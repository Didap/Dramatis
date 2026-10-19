import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { CharacterProfileSection, ExportWhat, ProjectKind, RichDoc } from '#shared/types/domain'
import { PROFILE_SECTIONS } from '#shared/content/profile'
import { analyseFlow, variableUsage } from '#shared/utils/flow'
import { resolveModules } from '#shared/utils/modules'
import { countWords, docWordCount } from '#shared/utils/richtext'

/*
 * The path from idea to finished work (spec 3): eight stages computed from the project's data,
 * live, never a gate. Each stage says whether it is done, how far along it is, why (a message
 * code the overview translates) and where to work on it next.
 * It runs on every visit to the overview and once per project in the projects list, so it reads
 * only what the stages need: the main characters' profiles, the one export that counts, and the
 * dialogue lines without a speaker counted by the database (scene text never leaves it).
 */

export type PathStageKey = 'premise' | 'protagonist' | 'world' | 'plot' | 'quests' | 'structure' | 'draft' | 'revision' | 'delivery'

export interface PathReason {
  /** Message under overview.path.reasons. */
  code: string
  /** Count for the plural form of the message. */
  n?: number
  /** Names and titles as the author wrote them, numbers to format. */
  params?: Record<string, string | number>
}

export interface PathStage {
  key: PathStageKey
  done: boolean
  /** Progress towards done, from 0 to 1. */
  fraction: number
  reason: PathReason
  /** The next place to work on the stage, relative to the project ("architecture/premise"). */
  to: string
  /** The stage's action, under overview.path.actions. */
  action: string
  actionParams?: Record<string, string>
}

export interface ProjectPath {
  kind: ProjectKind
  stages: PathStage[]
  /** The first stage not done; null when the whole path is done. */
  current: PathStageKey | null
  done: number
}

const ANSWERED_WORDS = 10
const TEAM_EXPORTS: ExportWhat[] = ['json', 'twee', 'ink', 'vo_csv', 'document']

const ratio = (value: number, target: number) => (target <= 0 ? 1 : Math.max(0, Math.min(1, value / target)))
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)

/** Words of a profile section in its current mode: answers summed, or the free text. */
function sectionWords(section: CharacterProfileSection | undefined): number {
  if (!section) return 0
  const answers = Object.values(section.answers ?? {}).reduce((n, text) => n + countWords(text ?? ''), 0)
  const free = docWordCount(section.free)
  const mode = section.mode ?? (answers > 0 || free === 0 ? 'interview' : 'free')
  return mode === 'free' ? free : answers
}

interface Positioned { id: string, position: number, createdAt: Date }
const byPosition = (a: Positioned, b: Positioned) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime()

export default defineEventHandler(async (event): Promise<ProjectPath> => {
  const { project } = await requireProject(event)
  const db = useDb()
  const pid = project.id
  const kind = project.kind
  const game = kind === 'game'
  const modules = resolveModules(kind, project.modules)
  const live = (table: any) => and(eq(table.projectId, pid), isNull(table.deletedAt))
  const log = tables.exportLog
  // The delivery stage needs one export: the latest made while every scene was final, of the right kind.
  const deliveredBy = game
    ? and(eq(log.projectId, pid), eq(log.allFinal, true), inArray(log.what, TEAM_EXPORTS), modules.branching ? eq(log.flowClean, true) : undefined)
    : and(eq(log.projectId, pid), eq(log.allFinal, true), eq(log.what, 'manuscript'), sql`lower(${log.format}) in ('docx', 'epub', 'pdf')`)

  const [characters, locations, groups, objects, codexEntries, strands, parts, chapters, scenes, links, variables, exports] = await Promise.all([
    // Only main characters matter to the path (the protagonist, the revision's "every main character").
    db.select({ id: tables.characters.id, name: tables.characters.name, importance: tables.characters.importance, profile: tables.characters.profile, position: tables.characters.position, createdAt: tables.characters.createdAt })
      .from(tables.characters).where(and(live(tables.characters), eq(tables.characters.importance, 'main'))).orderBy(asc(tables.characters.position), asc(tables.characters.createdAt)),
    db.select({ id: tables.locations.id }).from(tables.locations).where(live(tables.locations)),
    db.select({ id: tables.groups.id }).from(tables.groups).where(live(tables.groups)),
    db.select({ id: tables.objects.id }).from(tables.objects).where(live(tables.objects)),
    db.select({ id: tables.codexEntries.id }).from(tables.codexEntries).where(live(tables.codexEntries)),
    db.select({ id: tables.strands.id, name: tables.strands.name, kind: tables.strands.kind, quest: tables.strands.quest, position: tables.strands.position, createdAt: tables.strands.createdAt })
      .from(tables.strands).where(live(tables.strands)).orderBy(asc(tables.strands.position), asc(tables.strands.createdAt)),
    db.select({ id: tables.parts.id, position: tables.parts.position, createdAt: tables.parts.createdAt }).from(tables.parts).where(live(tables.parts)),
    db.select({ id: tables.chapters.id, title: tables.chapters.title, partId: tables.chapters.partId, reason: tables.chapters.reason, position: tables.chapters.position, createdAt: tables.chapters.createdAt })
      .from(tables.chapters).where(live(tables.chapters)),
    db.select({
      id: tables.scenes.id,
      chapterId: tables.scenes.chapterId,
      title: tables.scenes.title,
      status: tables.scenes.status,
      wordCount: tables.scenes.wordCount,
      ending: tables.scenes.ending,
      characterIds: tables.scenes.characterIds,
      povCharacterId: tables.scenes.povCharacterId,
      strandIds: tables.scenes.strandIds,
      position: tables.scenes.position,
      createdAt: tables.scenes.createdAt,
    }).from(tables.scenes).where(live(tables.scenes)),
    db.select({ id: tables.sceneLinks.id, fromSceneId: tables.sceneLinks.fromSceneId, toSceneId: tables.sceneLinks.toSceneId, conditions: tables.sceneLinks.conditions, effects: tables.sceneLinks.effects })
      .from(tables.sceneLinks).where(live(tables.sceneLinks)),
    db.select({ id: tables.variables.id, name: tables.variables.name, position: tables.variables.position, createdAt: tables.variables.createdAt })
      .from(tables.variables).where(live(tables.variables)).orderBy(asc(tables.variables.position), asc(tables.variables.createdAt)),
    db.select({ createdAt: log.createdAt }).from(log).where(deliveredBy).orderBy(desc(log.createdAt)).limit(1),
  ])

  // Reading order, as the outline shows it: chapters outside any part first, then part by part.
  const partOrder = new Map([...parts].sort(byPosition).map((p, i) => [p.id, i]))
  const orderedChapters = [...chapters].sort((a, b) => {
    const pa = a.partId ? (partOrder.get(a.partId) ?? -1) : -1
    const pb = b.partId ? (partOrder.get(b.partId) ?? -1) : -1
    return pa - pb || byPosition(a, b)
  })
  const chapterIndex = new Map(orderedChapters.map((c, i) => [c.id, i]))
  const orderedScenes = scenes
    .filter(s => chapterIndex.has(s.chapterId))
    .sort((a, b) => chapterIndex.get(a.chapterId)! - chapterIndex.get(b.chapterId)! || byPosition(a, b))
  const sceneCount = orderedScenes.length
  const scenePath = (id: string) => `manuscript/scenes/${id}`
  const sceneTitle = (scene: { title: string }) => scene.title.trim()

  const flow = modules.branching
    ? analyseFlow(orderedScenes.map(s => ({ id: s.id, ending: s.ending })), links, project.startSceneId)
    : null

  const premiseWords = docWordCount(project.premise as RichDoc | null)
  const fabulaWords = docWordCount(project.fabula as RichDoc | null)
  const settingWords = docWordCount(project.setting as RichDoc | null)

  const stages: PathStage[] = []

  // 1. Premise
  stages.push({
    key: 'premise',
    done: premiseWords >= 30,
    fraction: ratio(premiseWords, 30),
    reason: premiseWords >= 30
      ? { code: 'premiseDone', n: premiseWords }
      : premiseWords === 0 ? { code: 'premiseEmpty' } : { code: 'premiseShort', n: premiseWords, params: { target: 30 } },
    to: 'architecture/premise',
    action: premiseWords ? 'continuePremise' : 'writePremise',
  })

  // 2. Protagonist: a main character with three answered sections, one of them the conflict.
  const sectionKeys = PROFILE_SECTIONS.filter(s => (s.media as readonly string[]).includes(kind)).map(s => s.key as string)
  const mains = characters.filter(c => c.importance === 'main').map((c) => {
    const answered = sectionKeys.filter(key => sectionWords(c.profile[key]) >= ANSWERED_WORDS)
    const conflict = answered.includes('conflict')
    const score = (conflict ? 1 : 0) + Math.min(answered.filter(k => k !== 'conflict').length, 2)
    return { ...c, answered, conflict, score }
  })
  const best = [...mains].sort((a, b) => b.score - a.score)[0]
  if (!best) {
    stages.push({ key: 'protagonist', done: false, fraction: 0, reason: { code: 'noMain' }, to: 'characters', action: 'createProtagonist' })
  }
  else {
    const done = best.score >= 3
    const missing = !best.conflict ? 'conflict' : sectionKeys.find(k => !best.answered.includes(k)) ?? 'conflict'
    stages.push({
      key: 'protagonist',
      done,
      fraction: best.score / 3,
      reason: done
        ? { code: 'protagonistDone', params: { name: best.name } }
        : best.conflict
          ? { code: 'protagonistSections', n: best.answered.length, params: { name: best.name } }
          : { code: 'protagonistNoConflict', n: Math.min(best.answered.length, 2), params: { name: best.name } },
      to: done ? `characters/${best.id}` : `characters/${best.id}/${missing}`,
      action: done ? 'openCharacter' : 'completeProfile',
      actionParams: { name: best.name },
    })
  }

  // 3. The world (novel) / World and lore (game).
  {
    const settingOk = settingWords >= 30
    const lore = locations.length + groups.length + objects.length + (modules.codex ? codexEntries.length : 0)
    const placesOk = game ? lore >= 3 : locations.length >= 1
    const done = settingOk && placesOk
    let reason: PathReason
    if (done) reason = game ? { code: 'loreDone', n: lore } : { code: 'worldDone', n: locations.length }
    else if (!settingOk) reason = settingWords ? { code: 'settingShort', n: settingWords, params: { target: 30 } } : { code: 'settingEmpty' }
    else reason = game ? { code: 'loreFew', n: lore, params: { target: 3 } } : { code: 'noLocation' }
    stages.push({
      key: 'world',
      done,
      fraction: (ratio(settingWords, 30) + (game ? ratio(lore, 3) : ratio(locations.length, 1))) / 2,
      reason,
      to: !settingOk ? 'architecture/setting' : game ? 'world' : 'locations',
      action: !settingOk ? 'writeSetting' : game ? 'openWorld' : 'addLocation',
    })
  }

  // 4. The plot (novel) / Plot and quests (game).
  {
    const fabulaOk = fabulaWords >= 100
    const questMode = game && modules.quests
    const strandOk = questMode
      ? strands.some(s => s.kind === 'quest' && (s.quest?.objectives ?? []).some(o => o.text.trim()))
      : strands.some(s => s.kind === 'plot')
    const done = fabulaOk && strandOk
    let reason: PathReason
    if (done) reason = { code: questMode ? 'questsDone' : 'plotDone', n: fabulaWords }
    else if (!fabulaOk) reason = fabulaWords ? { code: 'fabulaShort', n: fabulaWords, params: { target: 100 } } : { code: 'fabulaEmpty' }
    else reason = { code: questMode ? 'noQuest' : 'noPlotStrand' }
    stages.push({
      key: game ? 'quests' : 'plot',
      done,
      fraction: (ratio(fabulaWords, 100) + (strandOk ? 1 : 0)) / 2,
      reason,
      to: !fabulaOk ? 'architecture/fabula' : 'strands',
      action: !fabulaOk ? 'writeFabula' : strandOk ? 'openStrands' : questMode ? 'addQuest' : 'addPlotStrand',
    })
  }

  // 5. Structure (novel) / Structure and flow (game).
  {
    const withScenes = new Set(orderedScenes.map(s => s.chapterId))
    const emptyChapter = orderedChapters.find(c => !withScenes.has(c.id))
    const chaptersOk = game || orderedChapters.length >= 3
    const scenesOk = sceneCount >= 6
    const filledOk = orderedChapters.length > 0 && !emptyChapter
    const countsOk = chaptersOk && scenesOk && filledOk
    // The start and the endings belong to the game table only (a gamebook novel skips them).
    const gameFlow = game ? flow : null
    const startOk = !gameFlow || gameFlow.hasStart
    const endingOk = !gameFlow || gameFlow.endings.length > 0
    const done = countsOk && startOk && endingOk
    const measures = [
      ...(game ? [] : [ratio(orderedChapters.length, 3)]),
      ratio(sceneCount, 6),
      orderedChapters.length ? withScenes.size / orderedChapters.length : 0,
      ...(gameFlow ? [startOk ? 1 : 0, endingOk ? 1 : 0] : []),
    ]
    let reason: PathReason
    if (done) reason = { code: 'structureDone', params: { chapters: orderedChapters.length, scenes: sceneCount } }
    else if (!chaptersOk || !scenesOk) reason = { code: game ? 'structureScenes' : 'structureCounts', params: { chapters: orderedChapters.length, scenes: sceneCount } }
    else if (!filledOk) reason = emptyChapter ? { code: 'emptyChapter', params: { chapter: emptyChapter.title.trim() } } : { code: 'noChapters' }
    else if (!startOk) reason = { code: 'noStart' }
    else reason = { code: 'noEnding' }
    const toFlow = countsOk && !!gameFlow && !done
    stages.push({
      key: 'structure',
      done,
      fraction: mean(measures),
      reason,
      to: toFlow ? 'flow' : !countsOk && emptyChapter && chaptersOk && scenesOk ? `manuscript/chapters/${emptyChapter.id}` : 'manuscript',
      action: toFlow ? 'openFlow' : 'openManuscript',
    })
  }

  // 6. First draft: every scene has words and has left "planned" [games: a flow with no gaps].
  {
    const failing = orderedScenes.find(s => s.wordCount < 1 || s.status === 'planned')
    const planned = orderedScenes.filter(s => s.status === 'planned').length
    const empty = orderedScenes.filter(s => s.wordCount < 1).length
    const ok = orderedScenes.filter(s => s.wordCount >= 1 && s.status !== 'planned').length
    const flowGaps = game && flow ? flow.unreachable.length + flow.deadEnds.length : 0
    const done = sceneCount > 0 && !failing && flowGaps === 0
    let reason: PathReason
    if (!sceneCount) reason = { code: 'noScenes' }
    else if (done) reason = { code: 'draftDone', n: sceneCount }
    else if (planned) reason = { code: 'scenesPlanned', n: planned }
    else if (empty) reason = { code: 'scenesEmpty', n: empty }
    else if (flow && flow.unreachable.length) reason = { code: 'unreachable', n: flow.unreachable.length }
    else reason = { code: 'deadEnds', n: flow?.deadEnds.length ?? 0 }
    const units = sceneCount + (game && flow ? 1 : 0)
    // The flow checks are the place only for a game with branches; otherwise the manuscript.
    const toChecks = !failing && sceneCount > 0 && game && !!flow
    stages.push({
      key: 'draft',
      done,
      fraction: units ? (ok + (game && flow && flowGaps === 0 && sceneCount ? 1 : 0)) / units : 0,
      reason,
      to: failing ? scenePath(failing.id) : toChecks ? 'flow?view=checks' : 'manuscript',
      action: failing ? 'writeScene' : toChecks ? 'openChecks' : 'openManuscript',
      actionParams: failing ? { title: sceneTitle(failing) } : undefined,
    })
  }

  // 7. Revision.
  {
    interface Check { ok: boolean, reason: PathReason, to: string, action: string, actionParams?: Record<string, string> }
    const checks: Check[] = []
    const appears = (characterId: string) => orderedScenes.some(s => s.characterIds.includes(characterId) || s.povCharacterId === characterId)
    const tagged = (strandId: string) => orderedScenes.some(s => s.strandIds.includes(strandId))

    const notRevised = orderedScenes.filter(s => s.status !== 'revised' && s.status !== 'final')
    for (const scene of orderedScenes) {
      checks.push({ ok: scene.status === 'revised' || scene.status === 'final', reason: { code: 'notRevised', n: notRevised.length }, to: scenePath(scene.id), action: 'reviseScene', actionParams: { title: sceneTitle(scene) } })
    }
    if (!game) {
      for (const chapter of orderedChapters) {
        checks.push({ ok: docWordCount(chapter.reason as RichDoc | null) >= 5, reason: { code: 'noPurpose', params: { chapter: chapter.title.trim() } }, to: `manuscript/chapters/${chapter.id}`, action: 'writePurpose', actionParams: { chapter: chapter.title.trim() } })
      }
      for (const character of characters.filter(c => c.importance === 'main')) {
        checks.push({ ok: appears(character.id), reason: { code: 'untaggedCharacter', params: { name: character.name } }, to: `characters/${character.id}`, action: 'openCharacter', actionParams: { name: character.name } })
      }
      for (const strand of strands.filter(s => s.kind === 'plot' || s.kind === 'subplot')) {
        checks.push({ ok: tagged(strand.id), reason: { code: 'untaggedStrand', params: { name: strand.name } }, to: `strands/${strand.id}`, action: 'openStrand', actionParams: { name: strand.name } })
      }
    }
    else {
      if (modules.quests) {
        for (const strand of strands.filter(s => s.kind === 'quest' || s.kind === 'side_quest')) {
          checks.push({ ok: tagged(strand.id), reason: { code: 'untaggedQuest', params: { name: strand.name } }, to: `strands/${strand.id}`, action: 'openStrand', actionParams: { name: strand.name } })
        }
      }
      if (modules.variables) {
        const { read, written } = variableUsage(links)
        for (const variable of variables) {
          checks.push({ ok: read.has(variable.id) || written.has(variable.id), reason: { code: 'unusedVariable', params: { name: variable.name } }, to: 'variables', action: 'openVariables' })
        }
      }
      if (flow) {
        checks.push({ ok: flow.hasStart, reason: { code: 'noStart' }, to: 'flow?view=checks', action: 'openChecks' })
        const ending = orderedScenes.find(s => flow.unreachableEndings.includes(s.id))
        checks.push({ ok: !ending, reason: { code: 'unreachableEnding', params: { title: ending ? sceneTitle(ending) : '' } }, to: 'flow?view=checks', action: 'openChecks' })
      }
      if (modules.script) {
        // Lines with neither a character nor a free label, counted per scene in the database, in the
        // active revisions that hold dialogue lines (the same rule as extractDialogueLines).
        const rows = await db.execute(sql`with recursive nodes(scene_id, node) as (
            select s.id, r.content
            from scene_revisions r join scenes s on s.current_revision_id = r.id
            where s.project_id = ${pid} and s.deleted_at is null and r.deleted_at is null
              and r.content is not null and r.content::text like '%"dialogueLine"%'
          union all
            select n.scene_id, child.node
            from nodes n
            cross join lateral jsonb_array_elements(
              case when coalesce(n.node->>'type', '') <> 'dialogueLine' and jsonb_typeof(n.node->'content') = 'array'
                then n.node->'content' else '[]'::jsonb end
            ) as child(node)
          )
          select scene_id as "sceneId", count(*)::int as n
          from nodes
          where node->>'type' = 'dialogueLine'
            and coalesce(node->'attrs'->>'speakerId', '') = ''
            and coalesce(node->'attrs'->>'speakerName', '') ~ '^\\s*$'
          group by scene_id`) as unknown as { sceneId: string, n: number }[]
        const silent = new Map(rows.map(row => [row.sceneId, Number(row.n)]))
        const total = [...silent.values()].reduce((a, b) => a + b, 0)
        const first = orderedScenes.find(s => silent.has(s.id))
        checks.push({ ok: !total, reason: { code: 'noSpeaker', n: total }, to: first ? scenePath(first.id) : 'manuscript', action: 'reviseScene', actionParams: { title: first ? sceneTitle(first) : '' } })
      }
    }

    const failing = checks.find(c => !c.ok)
    const done = sceneCount > 0 && !failing
    stages.push({
      key: 'revision',
      done,
      fraction: checks.length && sceneCount ? checks.filter(c => c.ok).length / checks.length : 0,
      reason: !sceneCount ? { code: 'noScenes' } : failing ? failing.reason : { code: 'revisionDone' },
      to: failing?.to ?? (game && flow ? 'flow?view=checks' : 'analysis'),
      action: failing?.action ?? (game && flow ? 'openChecks' : 'openAnalysis'),
      actionParams: failing?.actionParams,
    })
  }

  // 8. Delivery: every scene final and an export made while it was so [games: with clean flow checks].
  {
    const notFinal = orderedScenes.filter(s => s.status !== 'final')
    const allFinal = sceneCount > 0 && !notFinal.length
    const exported = exports[0]
    const done = allFinal && !!exported
    const first = notFinal[0]
    let reason: PathReason
    if (!sceneCount) reason = { code: 'noScenes' }
    else if (done) reason = { code: 'delivered', params: { date: exported!.createdAt.toISOString() } }
    else if (!allFinal) reason = { code: 'notFinal', n: notFinal.length }
    else reason = { code: game ? 'noTeamExport' : 'noExport' }
    stages.push({
      key: 'delivery',
      done,
      fraction: sceneCount ? (sceneCount - notFinal.length + (exported ? 1 : 0)) / (sceneCount + 1) : 0,
      reason,
      to: first ? scenePath(first.id) : 'export',
      action: first ? 'finishScene' : 'export',
      actionParams: first ? { title: sceneTitle(first) } : undefined,
    })
  }

  const current = stages.find(s => !s.done)?.key ?? null
  return { kind, stages, current, done: stages.filter(s => s.done).length }
})
