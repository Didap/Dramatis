import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { ConditionClause, ConditionOp, LinkCondition, LinkEffect, RelationKind, RichDoc, RichNode, WorldRefType } from '../../shared/types/domain'
import type { ManualTag } from '../../shared/types/entities'
import { isDirectedByDefault, relationKindsFor } from '#shared/utils/relations'
import { CHARACTER_IMPORTANCES, ENTITY_COLORS, GROUP_KINDS, POINTS_OF_VIEW, RELATION_KINDS, SCENE_KINDS, SCENE_STATUSES, STRAND_KINDS, VARIABLE_TYPES } from '#shared/utils/constants'
import { mentionId } from '#shared/utils/richtext'

/*
 * Imports one of the demo projects (server/content/demo/*.json) into a user's account.
 * The JSON format is documented in docs/demo-format.md; references use "<type>:<key>".
 */

type Paragraphs = string[]

interface DemoScene {
  key: string
  title: string
  synopsis?: string
  status?: string
  kind?: string
  flow?: string
  pov?: string
  povCharacter?: string
  characters?: string[]
  locations?: string[]
  objects?: string[]
  strands?: string[]
  storyAt?: string
  storyTimeLabel?: string
  durationMinutes?: number
  endingLabel?: string
  text?: ({ p: string } | { line: { speaker: string, text: string, direction?: string } })[]
}

interface DemoProject {
  kind: 'novel' | 'game'
  title: string
  subtitle?: string
  authorName?: string
  genre?: string
  logline?: string
  premise?: Paragraphs
  fabula?: Paragraphs
  setting?: Paragraphs
  wordGoal?: number
  dailyWordGoal?: number
  characters?: { key: string, name: string, aliases?: string[], importance?: string, role?: string, tagline?: string, description?: Paragraphs, profile?: Record<string, string>, qualities?: string[], flaws?: string[], contradictions?: string[], playable?: boolean }[]
  groups?: { key: string, name: string, kind?: string, description?: Paragraphs, language?: Paragraphs, traditions?: Paragraphs, powers?: Paragraphs, members?: string[] }[]
  locations?: { key: string, name: string, kind?: string, nation?: string, region?: string, city?: string, parent?: string, description?: Paragraphs }[]
  objects?: { key: string, name: string, kind?: string, description?: Paragraphs }[]
  strands?: { key: string, name: string, kind?: string, description?: Paragraphs, character?: string, quest?: { giver?: string, objectives?: string[], rewards?: string } }[]
  relations?: { from: string, to: string, kind?: string, label?: string, reverseLabel?: string, description?: string, directed?: boolean }[]
  parts?: { title: string, chapters: { key: string, title: string, reason?: string, scenes: DemoScene[] }[] }[]
  links?: { from: string, to: string, label?: string, condition?: string, effect?: string }[]
  variables?: { name: string, type?: string, default?: string, description?: string }[]
  events?: { title: string, at?: string, timeLabel?: string, kind?: string, description?: string, links?: string[] }[]
  notes?: { title: string, category?: string, content?: Paragraphs }[]
}

/** Reads a demo file from the server assets (server/content/demo, bundled into the build). */
async function readDemo(kind: 'novel' | 'game', locale: 'it' | 'en'): Promise<DemoProject> {
  const raw = await useStorage('assets:demo').getItem(`${kind}.${locale}.json`)
  if (!raw) throw createError({ statusCode: 503, message: `Demo ${kind}.${locale} is not available` })
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as DemoProject
}

const oneOf = <T extends string>(values: readonly T[], value: string | undefined, fallback: T): T =>
  value && (values as readonly string[]).includes(value) ? (value as T) : fallback

const nullableOf = <T extends string>(values: readonly T[], value: string | undefined): T | null =>
  value && (values as readonly string[]).includes(value) ? (value as T) : null

const MENTION_RE = /@\[(character|group|location|object):([\w-]+)\]/g

/** Imports a demo project for a user and returns the new project row. */
export async function importDemo(userId: string, kind: 'novel' | 'game', locale: 'it' | 'en') {
  const demo = await readDemo(kind, locale)
  const ids = {
    character: new Map<string, string>(),
    group: new Map<string, string>(),
    location: new Map<string, string>(),
    object: new Map<string, string>(),
    strand: new Map<string, string>(),
    scene: new Map<string, string>(),
  }
  const names = new Map<string, string>()
  const ref = (value: string | undefined) => {
    if (!value) return null
    const [type, key] = value.includes(':') ? (value.split(':') as [WorldRefType, string]) : (['character', value] as [WorldRefType, string])
    const id = ids[type]?.get(key)
    return id ? { type, id } : null
  }

  const inline = (text: string): RichNode[] => {
    const nodes: RichNode[] = []
    let last = 0
    for (const match of text.matchAll(MENTION_RE)) {
      const [token, type, key] = match as unknown as [string, WorldRefType, string]
      if (match.index! > last) nodes.push({ type: 'text', text: text.slice(last, match.index) })
      const id = ids[type]?.get(key)
      if (id) nodes.push({ type: 'mention', attrs: { id: mentionId(type, id), label: names.get(`${type}:${key}`) ?? key } })
      last = match.index! + token.length
    }
    if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) })
    return nodes.filter(n => n.type !== 'text' || n.text)
  }
  const doc = (paragraphs: Paragraphs | undefined): RichDoc | null =>
    paragraphs?.length ? { type: 'doc', content: paragraphs.map(p => ({ type: 'paragraph', content: inline(p) })) } : null

  const sceneDoc = (scene: DemoScene): RichDoc | null => {
    if (!scene.text?.length) return null
    return {
      type: 'doc',
      content: scene.text.map((block) => {
        if ('line' in block) {
          const speakerId = ids.character.get(block.line.speaker) ?? null
          return {
            type: 'dialogueLine',
            attrs: {
              speakerId,
              speakerName: names.get(`character:${block.line.speaker}`) ?? block.line.speaker,
              direction: block.line.direction ?? '',
              lineId: null,
            },
            content: block.line.text ? [{ type: 'text', text: block.line.text }] : [],
          }
        }
        return { type: 'paragraph', content: inline(block.p) }
      }),
    }
  }

  return useDb().transaction(async (tx) => {
    const [project] = await tx
      .insert(tables.projects)
      .values({
        ownerId: userId,
        kind: demo.kind,
        // Appendix C: the demo is an ordinary project, titled "Esempio: ..." / "Example: ...".
        title: `${locale === 'en' ? 'Example' : 'Esempio'}: ${demo.title}`,
        subtitle: demo.subtitle ?? '',
        authorName: demo.authorName ?? '',
        language: locale,
        genre: demo.genre ?? '',
        logline: demo.logline ?? '',
        color: kind === 'novel' ? 'blue' : 'teal',
        wordGoal: demo.wordGoal ?? null,
        dailyWordGoal: demo.dailyWordGoal ?? null,
        settings: { dialogueStyle: locale === 'it' ? 'guillemets' : 'double_quotes', guidance: true, smartTypography: true, parts: true, demo: true },
        openedAt: new Date(),
      })
      .returning()
    const pid = project!.id

    // Names first, so mentions inside any text can be resolved.
    for (const c of demo.characters ?? []) names.set(`character:${c.key}`, c.name)
    for (const g of demo.groups ?? []) names.set(`group:${g.key}`, g.name)
    for (const l of demo.locations ?? []) names.set(`location:${l.key}`, l.name)
    for (const o of demo.objects ?? []) names.set(`object:${o.key}`, o.name)
    for (const c of demo.characters ?? []) ids.character.set(c.key, randomUUID())
    for (const g of demo.groups ?? []) ids.group.set(g.key, randomUUID())
    for (const l of demo.locations ?? []) ids.location.set(l.key, randomUUID())
    for (const o of demo.objects ?? []) ids.object.set(o.key, randomUUID())
    for (const s of demo.strands ?? []) ids.strand.set(s.key, randomUUID())

    await tx.update(tables.projects).set({ premise: doc(demo.premise), fabula: doc(demo.fabula), setting: doc(demo.setting) }).where(eq(tables.projects.id, pid))

    const colourAt = (i: number) => ENTITY_COLORS[(i * 5) % ENTITY_COLORS.length]

    for (const [i, c] of (demo.characters ?? []).entries()) {
      const profile: Record<string, { mode: 'free', free: RichDoc | null }> = {}
      for (const [section, text] of Object.entries(c.profile ?? {})) profile[section] = { mode: 'free', free: doc([text]) }
      await tx.insert(tables.characters).values({
        id: ids.character.get(c.key)!,
        projectId: pid,
        name: c.name,
        aliases: c.aliases ?? [],
        importance: oneOf(CHARACTER_IMPORTANCES, c.importance, 'secondary'),
        role: oneOf([...CHARACTER_ROLES, ''] as const, c.role, ''),
        tagline: (c.tagline ?? '').slice(0, 140),
        color: colourAt(i),
        traits: { qualities: c.qualities ?? [], flaws: c.flaws ?? [], contradictions: c.contradictions ?? [] },
        playable: c.playable ?? c.role === 'player_character',
        description: doc(c.description),
        profile,
        status: Object.keys(c.profile ?? {}).length >= 5 ? 'done' : 'progress',
        position: i,
      })
    }

    for (const [i, l] of (demo.locations ?? []).entries()) {
      await tx.insert(tables.locations).values({
        id: ids.location.get(l.key)!,
        projectId: pid,
        name: l.name,
        kind: l.kind ?? '',
        nation: l.nation ?? '',
        region: l.region ?? '',
        city: l.city ?? '',
        color: colourAt(i + 3),
        description: doc(l.description),
        status: 'done',
        position: i,
      })
    }
    for (const l of demo.locations ?? []) {
      const parent = l.parent ? ids.location.get(l.parent) : undefined
      if (parent) await tx.update(tables.locations).set({ parentId: parent }).where(eq(tables.locations.id, ids.location.get(l.key)!))
    }

    for (const [i, o] of (demo.objects ?? []).entries()) {
      await tx.insert(tables.objects).values({
        id: ids.object.get(o.key)!,
        projectId: pid,
        name: o.name,
        kind: o.kind ?? '',
        color: colourAt(i + 6),
        description: doc(o.description),
        status: 'done',
        position: i,
      })
    }

    for (const [i, g] of (demo.groups ?? []).entries()) {
      await tx.insert(tables.groups).values({
        id: ids.group.get(g.key)!,
        projectId: pid,
        name: g.name,
        kind: oneOf(GROUP_KINDS, g.kind, 'other'),
        color: colourAt(i + 9),
        description: doc(g.description),
        language: doc(g.language),
        traditions: doc(g.traditions),
        powers: doc(g.powers),
        status: 'done',
        position: i,
      })
      // Membership is a relationship from the member to the group.
      for (const member of (g.members ?? []).map(ref)) {
        if (!member || member.type === 'group') continue
        await tx.insert(tables.relations).values({
          projectId: pid,
          sourceType: member.type,
          sourceId: member.id,
          targetType: 'group',
          targetId: ids.group.get(g.key)!,
          kind: 'membership',
          directed: true,
        })
      }
    }

    for (const [i, s] of (demo.strands ?? []).entries()) {
      const strandKind = oneOf(STRAND_KINDS, s.kind, 'plot')
      await tx.insert(tables.strands).values({
        id: ids.strand.get(s.key)!,
        projectId: pid,
        name: s.name,
        kind: strandKind,
        color: colourAt(i * 2 + 1),
        description: doc(s.description),
        characterId: s.character ? ids.character.get(s.character) ?? null : null,
        quest: s.quest
          ? {
              giverId: s.quest.giver ? ids.character.get(s.quest.giver) ?? null : null,
              objectives: (s.quest.objectives ?? []).map((text, n) => ({ id: `o${n + 1}`, text })),
              rewards: s.quest.rewards ? [{ id: 'r1', text: s.quest.rewards }] : [],
            }
          : null,
        status: 'progress',
        position: i,
      })
    }

    for (const r of demo.relations ?? []) {
      const from = ref(r.from)
      const to = ref(r.to)
      if (!from || !to || (from.type === to.type && from.id === to.id)) continue
      await tx.insert(tables.relations).values({
        projectId: pid,
        sourceType: from.type,
        sourceId: from.id,
        targetType: to.type,
        targetId: to.id,
        kind: relationKind(from.type, to.type, r.kind),
        label: r.label ?? '',
        reverseLabel: r.reverseLabel ?? '',
        description: r.description ?? '',
        directed: r.directed ?? isDirectedByDefault(oneOf(RELATION_KINDS, r.kind, 'other')),
      })
    }

    let startSceneId: string | null = null
    for (const [partIndex, part] of (demo.parts ?? []).entries()) {
      const [partRow] = await tx.insert(tables.parts).values({ projectId: pid, title: part.title, position: partIndex }).returning({ id: tables.parts.id })
      for (const [chapterIndex, chapter] of part.chapters.entries()) {
        const [chapterRow] = await tx
          .insert(tables.chapters)
          .values({ projectId: pid, partId: partRow!.id, title: chapter.title, reason: chapter.reason ? doc([chapter.reason]) : null, position: chapterIndex })
          .returning({ id: tables.chapters.id })
        for (const [sceneIndex, scene] of chapter.scenes.entries()) {
          const sceneId = randomUUID()
          ids.scene.set(scene.key, sceneId)
          const code = await nextSceneCode(pid, tx)
          const lines = normalizeLineIds(sceneDoc(scene), code, 0)
          const content = lines.content
          const measured = measureDoc(content)
          const { contentText, wordCount } = measured
          const manual: ManualTag[] = [
            ...(scene.characters ?? []).map(k => ids.character.get(k)).filter((x): x is string => !!x).map(id => ({ type: 'character' as const, id })),
            ...(scene.locations ?? []).map(k => ids.location.get(k)).filter((x): x is string => !!x).map(id => ({ type: 'location' as const, id })),
            ...(scene.objects ?? []).map(k => ids.object.get(k)).filter((x): x is string => !!x).map(id => ({ type: 'object' as const, id })),
          ]
          await tx.insert(tables.scenes).values({
            id: sceneId,
            projectId: pid,
            chapterId: chapterRow!.id,
            code,
            lineCounter: lines.lineCounter,
            title: scene.title,
            synopsis: scene.synopsis ?? '',
            status: oneOf(SCENE_STATUSES, scene.status, content ? 'draft' : 'planned'),
            kind: oneOf(SCENE_KINDS, scene.kind, 'scene'),
            ending: scene.flow === 'ending',
            endingLabel: scene.flow === 'ending' ? scene.endingLabel ?? scene.title : '',
            pov: nullableOf(POINTS_OF_VIEW, scene.pov),
            povCharacterId: scene.povCharacter ? ids.character.get(scene.povCharacter) ?? null : null,
            storyAt: scene.storyAt && STORY_TIME.test(scene.storyAt) ? scene.storyAt : null,
            storyTimeLabel: scene.storyTimeLabel ?? '',
            durationValue: scene.durationMinutes ?? null,
            durationUnit: scene.durationMinutes ? 'minutes' : null,
            tags: withManualTags({}, manual),
            strandIds: (scene.strands ?? []).map(k => ids.strand.get(k)).filter((x): x is string => !!x),
            wordCount,
            charCount: measured.charCount,
            charCountNoSpaces: measured.charCountNoSpaces,
            editedAt: content ? new Date() : null,
            position: sceneIndex,
          })
          if (scene.flow === 'start') startSceneId = sceneId
          const [revision] = await tx
            .insert(tables.sceneRevisions)
            .values({ projectId: pid, sceneId, number: 1, content, contentText, wordCount, charCount: measured.charCount, charCountNoSpaces: measured.charCountNoSpaces })
            .returning()
          const [sceneRow] = await tx.select().from(tables.scenes).where(eq(tables.scenes.id, sceneId))
          await activateRevision(sceneRow!, revision!, tx)
        }
      }
    }

    const variableIds = new Map<string, string>()
    const variableTypes = new Map<string, string>()
    for (const [i, v] of (demo.variables ?? []).entries()) {
      if (!/^[A-Za-z_]\w{0,59}$/.test(v.name)) continue
      const [variable] = await tx.insert(tables.variables).values({
        projectId: pid,
        name: v.name,
        type: oneOf(VARIABLE_TYPES, v.type, 'boolean'),
        defaultValue: v.default ?? '',
        description: v.description ?? '',
        position: i,
      }).returning({ id: tables.variables.id })
      variableIds.set(v.name, variable!.id)
      variableTypes.set(variable!.id, oneOf(VARIABLE_TYPES, v.type, 'boolean'))
    }

    for (const [i, link] of (demo.links ?? []).entries()) {
      const from = ids.scene.get(link.from)
      const to = ids.scene.get(link.to)
      if (!from || !to) continue
      await tx.insert(tables.sceneLinks).values({
        projectId: pid,
        fromSceneId: from,
        toSceneId: to,
        label: link.label ?? '',
        conditions: parseCondition(link.condition, variableIds, variableTypes),
        effects: parseEffects(link.effect, variableIds),
        position: i,
      })
    }

    for (const [i, e] of (demo.events ?? []).entries()) {
      await tx.insert(tables.events).values({
        projectId: pid,
        title: e.title,
        description: e.description ? doc([e.description]) : null,
        kind: e.kind === 'historical' ? 'historical' : 'story',
        at: e.at && STORY_TIME.test(e.at) ? e.at : null,
        timeLabel: e.timeLabel ?? '',
        refs: (e.links ?? []).map(ref).filter((r): r is NonNullable<ReturnType<typeof ref>> => !!r),
        position: i,
      })
    }

    if (kind === 'game') {
      // Game notes are lore: they go to the codex, by category.
      await createDefaultCodex(pid, locale, tx)
      const categories = await tx.select().from(tables.codexCategories).where(eq(tables.codexCategories.projectId, pid)).orderBy(tables.codexCategories.position)
      // Demo categories are keys (history, factions, places, technology, magic): map them onto the defaults.
      const DEFAULT_OF: Record<string, number> = { history: 0, places: 0, factions: 1, peoples: 1, religion: 2, religions: 2, beliefs: 2, magic: 3, technology: 3, creatures: 4, bestiary: 4, languages: 5, politics: 6 }
      for (const [i, n] of (demo.notes ?? []).entries()) {
        const category = categories[DEFAULT_OF[(n.category ?? '').toLowerCase()] ?? 0]!
        await tx.insert(tables.codexEntries).values({ projectId: pid, categoryId: category.id, title: n.title, body: doc(n.content), position: i })
      }
    }
    else {
      for (const [i, n] of (demo.notes ?? []).entries()) {
        await tx.insert(tables.notes).values({ projectId: pid, title: n.title, content: doc(n.content), pinned: i === 0, position: i })
      }
    }

    if (startSceneId) await tx.update(tables.projects).set({ startSceneId }).where(eq(tables.projects.id, pid))

    // One map with every character, laid out by the map view on first open.
    const nodes = Object.fromEntries([...ids.character.values()].map(id => [`character:${id}`, { x: 0, y: 0 }]))
    await tx.insert(tables.maps).values({ projectId: pid, name: locale === 'it' ? 'Personaggi' : 'Characters', nodes, settings: { include: { character: true } } })

    // Creating a demo records no writing stats (appendix C).
    return project!
  })
}

const OPS: Record<string, ConditionOp> = { '==': 'eq', '=': 'eq', '!=': 'neq', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }

/** "trust >= 2 and has_key" -> structured clauses (unknown variables are dropped). */
function parseCondition(text: string | undefined, variables: Map<string, string>, types: Map<string, string>): LinkCondition {
  if (!text?.trim()) return { mode: 'all', clauses: [] }
  const mode = /\s(or|\|\|)\s/i.test(text) ? 'any' : 'all'
  const clauses: ConditionClause[] = []
  for (const part of text.split(/\s+(?:and|or|&&|\|\|)\s+/i)) {
    const compare = /^\s*(\w+)\s*(==|!=|>=|<=|>|<|=)\s*(.+?)\s*$/.exec(part)
    if (compare) {
      const id = variables.get(compare[1]!)
      const value = compare[3]!.replace(/^["']|["']$/g, '')
      const op = OPS[compare[2]!]!
      // Booleans are tested with is_true / is_false, never "eq true".
      if (id && types.get(id) === 'boolean' && (value === 'true' || value === 'false') && (op === 'eq' || op === 'neq')) {
        clauses.push({ variableId: id, op: (op === 'eq') === (value === 'true') ? 'is_true' : 'is_false' })
      }
      else if (id) clauses.push({ variableId: id, op, value })
      continue
    }
    const negated = /^\s*(?:not\s+|!)(\w+)\s*$/i.exec(part)
    if (negated) {
      const id = variables.get(negated[1]!)
      if (id) clauses.push({ variableId: id, op: 'is_false' })
      continue
    }
    const bare = /^\s*(\w+)\s*$/.exec(part)
    const id = bare && variables.get(bare[1]!)
    if (id) clauses.push({ variableId: id, op: 'is_true' })
  }
  return { mode, clauses }
}

/** "trust += 1; has_key = true" -> structured effects (unknown variables are dropped). */
function parseEffects(text: string | undefined, variables: Map<string, string>): LinkEffect[] {
  if (!text?.trim()) return []
  const effects: LinkEffect[] = []
  for (const part of text.split(/[;,]/)) {
    const m = /^\s*(\w+)\s*(\+=|-=|=)\s*(.+?)\s*$/.exec(part)
    if (!m) continue
    const id = variables.get(m[1]!)
    if (!id) continue
    const value = m[3]!.replace(/^["']|["']$/g, '')
    effects.push({ variableId: id, op: m[2] === '+=' ? 'add' : m[2] === '-=' ? 'subtract' : 'set', value })
  }
  return effects
}

const STORY_TIME = /^-?\d{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01])(T([01]\d|2[0-3]):[0-5]\d)?)?)?$/

/** A demo relation kind, made valid for the pair of entity kinds. */
function relationKind(from: WorldRefType, to: WorldRefType, kind: string | undefined): RelationKind {
  const wanted = oneOf(RELATION_KINDS, kind, 'other')
  return relationKindsFor(from, to).kinds.includes(wanted) ? wanted : 'other'
}
