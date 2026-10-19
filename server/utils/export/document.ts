import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { EntityRef, RichDoc, WorldRefType } from '#shared/types/domain'
import type { Character, Scene } from '#shared/types/entities'
import { PROFILE_SECTIONS } from '#shared/content/profile'
import { CHARACTER_IMPORTANCES } from '#shared/utils/constants'
import { variableUsage, type FlowCheck, type FlowCheckKind } from '#shared/utils/flow'
import { isEmptyDoc } from '#shared/utils/richtext'
import { compareStoryTime, parseStoryTime } from '#shared/utils/time'
import { DOCX_NUMBERING, docxListCounter, docxParagraphs, type DocxRichContext } from './docx-rich'
import { docxLanguage } from './docx-manuscript'
import { exportCleanText } from './files'
import { exportBrokenChoices, exportChoices, exportIsEnding, exportLines, exportStartScene, type GameRules } from './game'
import { richToHtml } from './html'
import { exportDate, exportNumber, type ExportLang, type ExportTranslator } from './i18n'
import { exportChapterNumber, exportWordsLabel } from './manuscript'
import type { ExportModel } from './model'

/*
 * The project document (appendix D.4): for a novel the story bible (premise, fabula, setting, strands,
 * characters with their profile, groups, locations, objects, codex, events in date order, structure); for a
 * game the narrative design document, which adds scene codes, kinds, start and endings, quests, the
 * variables table, the branch table, the flow check summary and, for every character, the voice section
 * with the lines and words spoken. The content is built once as blocks, then written as DOCX (every section
 * with a heading in the navigation pane) or sent to the print page for the PDF. Two voices, as in the app:
 * the author's words in a serif, the document's own labels in a sans.
 */

export type DocumentBlock =
  /** `author`: the heading is the author's own words (a name, a title), set in the serif like the text. */
  | { kind: 'heading', level: 1 | 2 | 3, text: string, author: boolean }
  /** A line in the document's own voice: small, sans, muted. */
  | { kind: 'meta', text: string, italic?: boolean }
  /** A label in the sans followed by a value in the author's voice. */
  | { kind: 'field', label: string, value: string }
  | { kind: 'rich', doc: RichDoc }
  /** A small heading inside an entry ("Qualità", "Membri"). */
  | { kind: 'label', text: string }
  | { kind: 'list', items: string[] }
  | { kind: 'question', text: string }
  /** The author's words as plain paragraphs (interview answers, synopses, taglines). */
  | { kind: 'text', paragraphs: string[], italic?: boolean }
  | { kind: 'image', ownerType: string, ownerId: string, portrait: boolean }
  | { kind: 'table', headers: string[], rows: string[][], widths: number[] }
  /** An entry introduced by a code or a date in the sans: a scene of the structure, an event. */
  | { kind: 'entry', lead: string, title: string, keepNext: boolean }

export interface ProjectDocument {
  title: string
  /** "Bibbia della storia" or "Documento di narrative design". */
  name: string
  subtitle: string
  author: string
  /** "Aggiornato al 18 ottobre 2026 · circa 2.400 parole · 15 scene". */
  stats: string
  language: string
  blocks: DocumentBlock[]
}

/** An image ready for Word: PNG, JPEG or GIF bytes and the size in pixels. */
export interface DocumentImage {
  data: Buffer
  type: 'png' | 'jpg' | 'gif'
  width: number
  height: number
}

const SERIF = 'Georgia'
const SANS = 'Arial'
const MUTED = '595959'

/** The format of image bytes, by their signature; null for anything Word cannot show (WebP). */
export function documentImageType(data: Uint8Array): DocumentImage['type'] | null {
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'png'
  if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return 'jpg'
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'gif'
  return null
}

/** An in-story time in the language of the file ("14 novembre 1953, 22:10"), with its label. */
export function exportStoryTime(lang: ExportLang, at: string | null | undefined, label: string | undefined, t: ExportTranslator): string {
  const parts = parseStoryTime(at)
  if (!parts) return label?.trim() || t('export.doc.undated')
  const tag = lang === 'en' ? 'en-GB' : 'it-IT'
  const { year, month, day, hour, minute } = parts
  let text: string
  if (year < 1 || year > 9999) text = month && day ? `${day}/${month}/${year}` : String(year)
  else if (day && month) text = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(year, month - 1, day))
  else if (month) text = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(year, month - 1, 1))
  else text = String(year)
  if (hour !== undefined) text += `, ${String(hour).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}`
  return label?.trim() ? `${text} (${label.trim()})` : text
}

/** The content of the project document, as blocks. */
export function buildProjectDocument(model: ExportModel): ProjectDocument {
  const { bundle, modules, t, lang, names, project } = model
  const kind = project.kind
  const term = (key: string, count = 1) => t(`common.vocab.${kind}.${key}`, {}, count)
  const label = (name: string, key: string | null | undefined) => (key ? t(`common.enums.${name}.${key}`) : '')
  const blocks: DocumentBlock[] = []

  /** A heading of the document: its own words at level 1, the author's (names, titles) below unless `author` says otherwise. */
  const heading = (level: 1 | 2 | 3, text: string, author = level > 1) => blocks.push({ kind: 'heading', level, text, author })
  const meta = (...parts: (string | null | undefined | false)[]) => {
    const text = parts.filter(Boolean).join(' · ')
    if (text) blocks.push({ kind: 'meta', text })
  }
  const field = (name: string, value: string | null | undefined) => {
    if (value?.trim()) blocks.push({ kind: 'field', label: name, value: value.trim() })
  }
  const text = (doc: RichDoc | null | undefined, fallback?: string) => {
    if (doc && !isEmptyDoc(doc)) blocks.push({ kind: 'rich', doc })
    else if (fallback) blocks.push({ kind: 'meta', text: fallback, italic: true })
  }
  const subheading = (value: string) => blocks.push({ kind: 'label', text: value })
  const list = (items: string[]) => {
    const kept = items.filter(item => item.trim())
    if (kept.length) blocks.push({ kind: 'list', items: kept })
  }
  const image = (ownerType: string, ownerId: string, portrait: boolean) => blocks.push({ kind: 'image', ownerType, ownerId, portrait })

  // ---------------------------------------------------------------- lookups

  const scenesOf = (predicate: (s: Scene) => boolean) => model.scenes.filter(predicate)
  const sceneName = (s: Scene) => (model.isGame ? `${s.code} ${s.title}` : s.title || s.code).trim()
  const scenesLine = (scenes: Scene[]) => (scenes.length ? t('export.doc.scenesIn', { list: scenes.map(sceneName).join(', ') }) : '')
  const refName = (ref: EntityRef) => names.get(`${ref.type}:${ref.id}`) ?? ''

  /** "Tobia Marin, padre": the other side of every relationship of an entity, as the relations panel shows it. */
  const relationLines = (type: WorldRefType, id: string, options: { only?: string, skip?: string } = {}) =>
    bundle.relations
      .filter(r => (options.only ? r.kind === options.only : r.kind !== options.skip))
      .flatMap((r) => {
        const isSource = r.sourceType === type && r.sourceId === id
        const isTarget = r.targetType === type && r.targetId === id
        if (!isSource && !isTarget) return []
        const other = isSource ? { type: r.targetType, id: r.targetId } : { type: r.sourceType, id: r.sourceId }
        const name = refName(other)
        if (!name) return []
        // On the member's side a membership reads as its own role; otherwise as what the other one is.
        const role = r.kind === 'membership' ? r.label : isSource ? r.reverseLabel || (r.directed ? '' : r.label) : r.label
        const what = [role.trim(), label('relationKind', r.kind)].filter(Boolean)
        return [`${name}, ${[...new Set(what)].join(' · ')}${r.description.trim() ? `. ${r.description.trim()}` : ''}`]
      })

  // Lines and words spoken by every character (module script).
  const spoken = new Map<string, { lines: number, words: number }>()
  if (modules.script) {
    for (const scene of model.scenes) {
      for (const line of exportLines(model.content.get(scene.id) ?? null, names)) {
        if (!line.speakerId) continue
        const entry = spoken.get(line.speakerId) ?? { lines: 0, words: 0 }
        entry.lines++
        entry.words += line.words
        spoken.set(line.speakerId, entry)
      }
    }
  }

  // ---------------------------------------------------------------- premise, fabula, setting

  for (const [key, status] of [['premise', project.premiseStatus], ['fabula', project.fabulaStatus], ['setting', project.settingStatus]] as const) {
    heading(1, term(key))
    meta(label('planningStatus', status))
    text(project[key], t('export.doc.notWritten'))
  }

  // ---------------------------------------------------------------- strands (and quests)

  heading(1, term('strands', 2))
  if (!bundle.strands.length) meta(t('export.doc.none'))
  for (const strand of bundle.strands) {
    const quest = modules.quests && (strand.kind === 'quest' || strand.kind === 'side_quest')
    heading(2, strand.name)
    meta(label('strandKind', strand.kind), label('planningStatus', strand.status))
    if (strand.kind === 'arc' && strand.characterId) field(t('export.doc.arcOf'), names.get(`character:${strand.characterId}`))
    text(strand.description)
    if (quest && strand.quest) {
      field(t('export.doc.questGiver'), strand.quest.giverId ? names.get(`character:${strand.quest.giverId}`) : '')
      const objectives = (strand.quest.objectives ?? []).filter(o => o.text.trim())
      if (objectives.length) {
        subheading(t('export.doc.objectives'))
        list(objectives.map((o) => {
          const scene = o.sceneId ? model.scenes.find(s => s.id === o.sceneId) : undefined
          const notes = [o.optional ? t('export.doc.optional') : '', scene ? t('export.doc.completedIn', { scene: sceneName(scene) }) : ''].filter(Boolean)
          return `${o.text.trim()}${notes.length ? ` (${notes.join(', ')})` : ''}`
        }))
      }
      const rewards = (strand.quest.rewards ?? []).filter(r => r.text.trim())
      if (rewards.length) {
        subheading(t('export.doc.rewards'))
        const object = term('object').toLocaleLowerCase()
        list(rewards.map(r => (r.objectId && names.get(`object:${r.objectId}`) ? `${r.text.trim()} (${t('export.doc.rewardObject', { object, name: names.get(`object:${r.objectId}`)! })})` : r.text.trim())))
      }
    }
    meta(scenesLine(scenesOf(s => s.strandIds.includes(strand.id))))
  }

  // ---------------------------------------------------------------- characters

  heading(1, term('characters'))
  if (!bundle.characters.length) meta(t('export.doc.none'))
  const importanceOrder = new Map(CHARACTER_IMPORTANCES.map((k, i) => [k, i]))
  const characters = [...bundle.characters].sort((a, b) => (importanceOrder.get(a.importance) ?? 9) - (importanceOrder.get(b.importance) ?? 9) || a.position - b.position)
  const sections = PROFILE_SECTIONS.filter(s => (s.media as readonly string[]).includes(kind))
  const custom = (project.settings.customQuestions ?? {}) as Record<string, { key: string, label: string }[]>

  const profileSection = (character: Character, key: string) => {
    const section = character.profile?.[key]
    if (!section) return
    const def = PROFILE_SECTIONS.find(s => s.key === key)
    const answers = Object.entries(section.answers ?? {}).filter(([, a]) => a?.trim())
    const hasFree = !isEmptyDoc(section.free)
    const mode = section.mode === 'free' ? (hasFree ? 'free' : answers.length ? 'interview' : null) : answers.length ? 'interview' : hasFree ? 'free' : null
    if (!mode) return
    heading(3, t(`profile.sections.${key}.title`), false)
    if (mode === 'free') {
      text(section.free)
      return
    }
    const order = [...(def?.questions ?? []), ...(custom[key] ?? []).map(q => q.key)]
    answers.sort(([a], [b]) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999))
    for (const [question, answer] of answers) {
      const known = def?.questions.includes(question as never)
      const ask = known ? t(`profile.sections.${key}.questions.${question}.label`) : custom[key]?.find(q => q.key === question)?.label ?? ''
      if (ask) blocks.push({ kind: 'question', text: ask })
      blocks.push({ kind: 'text', paragraphs: answer.split(/\n{2,}/) })
    }
  }

  for (const character of characters) {
    heading(2, character.name)
    image('character', character.id, true)
    meta(
      label('importance', character.importance),
      character.role ? label('role', character.role) : '',
      model.isGame && character.playable ? t('export.doc.playable') : '',
    )
    if (character.aliases.length) field(t('export.doc.aliases'), character.aliases.join(', '))
    if (character.tagline.trim()) blocks.push({ kind: 'text', paragraphs: [character.tagline.trim()], italic: true })
    text(character.description)
    if (character.importance === 'main') for (const section of sections) profileSection(character, section.key)
    else if (model.isGame) profileSection(character, 'voice')
    if (modules.script) {
      const words = spoken.get(character.id)
      meta(words ? t('export.doc.spoken', { lines: exportNumber(lang, words.lines), words: exportNumber(lang, words.words) }) : t('export.doc.noLines'))
    }
    const traits = character.traits ?? {}
    for (const key of ['qualities', 'flaws', 'contradictions'] as const) {
      const items = (traits[key] ?? []).filter(item => item.trim())
      if (!items.length) continue
      subheading(t(`export.doc.traits.${key}`))
      list(items)
    }
    const relationships = relationLines('character', character.id, { skip: 'membership' })
    if (relationships.length) {
      subheading(t('export.doc.relationships'))
      list(relationships)
    }
    const memberships = relationLines('character', character.id, { only: 'membership' })
    if (memberships.length) {
      subheading(term('groups'))
      list(memberships)
    }
    meta(scenesLine(scenesOf(s => s.characterIds.includes(character.id) || s.povCharacterId === character.id)))
    if (!isEmptyDoc(character.notes)) {
      subheading(term('notes'))
      text(character.notes)
    }
  }

  // ---------------------------------------------------------------- groups, locations, objects

  heading(1, term('groups'))
  if (!bundle.groups.length) meta(t('export.doc.none'))
  for (const group of bundle.groups) {
    heading(2, group.name)
    image('group', group.id, false)
    meta(label('groupKind', group.kind), label('planningStatus', group.status))
    text(group.description)
    for (const key of ['language', 'traditions', 'powers'] as const) {
      if (isEmptyDoc(group[key])) continue
      subheading(t(`export.doc.group.${key}`))
      text(group[key])
    }
    const members = relationLines('group', group.id, { only: 'membership' })
    if (members.length) {
      subheading(t('export.doc.members'))
      list(members)
    }
    const relationships = relationLines('group', group.id, { skip: 'membership' })
    if (relationships.length) {
      subheading(t('export.doc.relationships'))
      list(relationships)
    }
    if (!isEmptyDoc(group.notes)) {
      subheading(term('notes'))
      text(group.notes)
    }
  }

  heading(1, term('locations'))
  if (!bundle.locations.length) meta(t('export.doc.none'))
  for (const location of bundle.locations) {
    heading(2, location.name)
    image('location', location.id, false)
    meta(location.kind, [location.city, location.region, location.nation].filter(s => s.trim()).join(', '), label('planningStatus', location.status))
    text(location.description)
    const relationships = relationLines('location', location.id)
    if (relationships.length) {
      subheading(t('export.doc.relationships'))
      list(relationships)
    }
    meta(scenesLine(scenesOf(s => s.locationIds.includes(location.id))))
    if (!isEmptyDoc(location.notes)) {
      subheading(term('notes'))
      text(location.notes)
    }
  }

  heading(1, term('objects'))
  if (!bundle.objects.length) meta(t('export.doc.none'))
  for (const object of bundle.objects) {
    heading(2, object.name)
    image('object', object.id, false)
    meta(object.kind, label('planningStatus', object.status))
    text(object.description)
    const owners = relationLines('object', object.id, { only: 'ownership' })
    if (owners.length) {
      subheading(t('export.doc.owners'))
      list(owners)
    }
    const relationships = relationLines('object', object.id, { skip: 'ownership' })
    if (relationships.length) {
      subheading(t('export.doc.relationships'))
      list(relationships)
    }
    meta(scenesLine(scenesOf(s => s.objectIds.includes(object.id))))
    if (!isEmptyDoc(object.notes)) {
      subheading(term('notes'))
      text(object.notes)
    }
  }

  // ---------------------------------------------------------------- codex

  if (modules.codex) {
    heading(1, term('codex'))
    if (!bundle.codexEntries.length) meta(t('export.doc.none'))
    for (const category of bundle.codexCategories) {
      const entries = bundle.codexEntries.filter(e => e.categoryId === category.id)
      if (!entries.length) continue
      heading(2, category.name)
      for (const entry of entries) {
        heading(3, entry.title)
        image('codex', entry.id, false)
        text(entry.body)
      }
    }
  }

  // ---------------------------------------------------------------- events

  heading(1, term('event', 2))
  if (!bundle.events.length) meta(t('export.doc.none'))
  const events = [...bundle.events].sort((a, b) => compareStoryTime(a.at, b.at) || a.position - b.position)
  for (const event of events) {
    blocks.push({ kind: 'entry', lead: exportStoryTime(lang, event.at, event.timeLabel, t), title: event.title, keepNext: true })
    meta(label('eventKind', event.kind), event.refs.map(refName).filter(Boolean).join(', '))
    text(event.description)
  }

  // ---------------------------------------------------------------- structure

  heading(1, t('export.doc.structure'))
  const start = model.modules.branching ? exportStartScene(model) : null
  // Chapters keep the number of the outline (their place in reading order), as in the manuscript.
  const chapterBlock = (chapterId: string) => {
    const number = model.chapters.findIndex(c => c.id === chapterId) + 1
    const chapter = model.chapters[number - 1]!
    const numeral = exportChapterNumber(number, project.settings.chapterNumbering ?? 'arabic', lang)
    const title = chapter.title.trim()
    heading(model.usesParts ? 3 : 2, title ? (numeral ? `${numeral}. ${title}` : title) : t('export.out.chapterNumber', { n: numeral || number }), !!title)
    if (!isEmptyDoc(chapter.reason)) {
      subheading(term('chapterPurpose'))
      text(chapter.reason)
    }
    for (const scene of model.scenesByChapter.get(chapterId) ?? []) {
      const flow = [
        scene.id === start?.id ? t('export.doc.start') : '',
        exportIsEnding(model, scene) ? `${term('ending')}${scene.endingLabel ? `: ${scene.endingLabel}` : ''}` : '',
      ]
      blocks.push({ kind: 'entry', lead: model.isGame || modules.branching ? scene.code : '', title: scene.title || t('export.doc.untitledScene'), keepNext: !!scene.synopsis.trim() })
      meta(
        modules.scene_kinds ? label('sceneKind', scene.kind) : '',
        label('sceneStatus', scene.status),
        t('export.out.words', { n: exportNumber(lang, scene.wordCount) }, scene.wordCount),
        ...flow,
      )
      if (scene.synopsis.trim()) blocks.push({ kind: 'text', paragraphs: [scene.synopsis.trim()] })
    }
  }
  if (model.usesParts) {
    const loose = model.chapters.filter(c => !c.partId || !model.parts.some(p => p.id === c.partId))
    for (const chapter of loose) chapterBlock(chapter.id)
    model.parts.forEach((part, index) => {
      heading(2, part.title.trim() || `${term('part')} ${index + 1}`, !!part.title.trim())
      text(part.description)
      for (const chapter of model.chapters.filter(c => c.partId === part.id)) chapterBlock(chapter.id)
    })
  }
  else {
    for (const chapter of model.chapters) chapterBlock(chapter.id)
  }
  if (!model.chapters.length) meta(t('export.doc.none'))

  // ---------------------------------------------------------------- game modules

  const sentence = (choice: GameRules) => {
    const truth = (value: unknown) => (value === true ? t('export.doc.true') : value === false ? t('export.doc.false') : String(value ?? ''))
    const condition = choice.condition
      ? choice.condition.clauses
          .map(c => [c.variable.name, label('conditionOp', c.op), c.op === 'is_true' || c.op === 'is_false' ? '' : truth(c.value)].filter(Boolean).join(' '))
          .join(` ${choice.condition.mode === 'any' ? t('export.doc.or') : t('export.doc.and')} `)
      : t('export.doc.always')
    const effects = choice.effects.length
      ? choice.effects.map(e => [e.variable.name, label('effectOp', e.op), e.op === 'toggle' ? '' : truth(e.value)].filter(Boolean).join(' ')).join('\n')
      : ''
    return { condition, effects }
  }

  if (modules.variables) {
    heading(1, term('variables'))
    if (!bundle.variables.length) meta(t('export.doc.none'))
    else {
      const usage = variableUsage(bundle.links)
      blocks.push({
        kind: 'table',
        headers: [t('export.doc.table.name'), t('export.doc.table.type'), t('export.doc.table.default'), t('export.doc.table.description'), t('export.doc.table.usage')],
        rows: bundle.variables.map(v => [
          v.name,
          label('variableType', v.type),
          v.type === 'boolean' ? (v.defaultValue === 'true' ? t('export.doc.true') : t('export.doc.false')) : v.type === 'number' ? String(Number.parseInt(v.defaultValue, 10) || 0) : v.defaultValue,
          v.description,
          t('export.doc.usage', { read: usage.read.get(v.id) ?? 0, written: usage.written.get(v.id) ?? 0 }),
        ]),
        widths: [2000, 1300, 1300, 3000, 1900],
      })
    }
  }

  if (modules.branching && model.flow) {
    heading(1, t('export.doc.branches'))
    const choices = exportChoices(model)
    const broken = exportBrokenChoices(model)
    const rows = model.scenes.flatMap(scene => [
      ...(choices.get(scene.id) ?? []).map((choice) => {
        const { condition, effects } = sentence(choice)
        return [scene.code, choice.implicit ? t('export.doc.implicit') : choice.text || t('export.doc.continuation'), choice.to.code, condition, effects]
      }),
      // A choice to a scene in the trash stays in the table, as the flow view shows it: the team sees what is missing.
      ...(broken.get(scene.id) ?? []).map((choice) => {
        const { condition, effects } = sentence(choice)
        return [scene.code, choice.text || t('export.doc.continuation'), t('export.doc.trashedTarget'), condition, effects]
      }),
    ])
    if (rows.length) {
      blocks.push({
        kind: 'table',
        headers: [t('export.doc.table.scene'), t('export.doc.table.choice'), t('export.doc.table.target'), t('export.doc.table.condition'), t('export.doc.table.effects')],
        rows,
        widths: [1000, 2800, 1100, 2400, 2200],
      })
    }
    else meta(t('export.doc.none'))

    // The checks of the flow view (shared/utils/flow.ts), the same ones the sidebar badge counts.
    heading(1, t('export.doc.checks'))
    const { analysis, checks } = model.flow
    const of = (kind: FlowCheckKind) => checks.filter(c => c.kind === kind)
    const codes = (ids: (string | undefined)[]) => ids.map(id => model.scenes.find(s => s.id === id)).filter((s): s is Scene => !!s).map(sceneName).join(', ')
    const choiceNames = (list: FlowCheck[]) => list.map((check) => {
      const link = bundle.links.find(l => l.id === check.linkId)
      const scene = model.scenes.find(s => s.id === check.sceneId)
      return scene && link ? t('export.doc.choiceIn', { scene: scene.code, choice: link.label.trim() || t('export.doc.continuation') }) : ''
    }).filter(Boolean).join(', ')
    const variableNames = (list: FlowCheck[]) => list.map(c => bundle.variables.find(v => v.id === c.variableId)?.name ?? '').filter(Boolean).join(', ')
    field(t('export.doc.startScene'), analysis.hasStart && start ? sceneName(start) : t('export.doc.noStart', { manuscript: term('manuscript').toLocaleLowerCase() }))
    field(term('ending', 2), analysis.endings.length ? codes(analysis.endings) : t('export.doc.noEndings'))
    field(t('export.doc.brokenTargets'), choiceNames(of('brokenTarget')))
    field(t('export.doc.trashedVariables'), choiceNames(of('trashedVariable')))
    field(t('export.doc.badRules'), choiceNames(of('badRule')))
    field(t('export.doc.unreachableEndings'), codes(of('unreachableEnding').map(c => c.sceneId)))
    field(t('export.doc.unreachable'), codes(of('unreachable').map(c => c.sceneId)))
    field(t('export.doc.deadEnds'), codes(of('deadEnd').map(c => c.sceneId)))
    field(t('export.doc.emptyChoices'), choiceNames(of('emptyText')))
    field(t('export.doc.unusedVariables'), variableNames(of('unusedVariable')))
    field(t('export.doc.unchangedVariables'), variableNames(of('unchangedVariable')))
    if (!checks.length) meta(t('export.doc.clean'))
  }

  const totalWords = model.scenes.reduce((n, s) => n + s.wordCount, 0)
  return {
    title: project.title,
    name: term('projectDocument'),
    subtitle: project.subtitle,
    author: project.authorName,
    stats: `${t('export.doc.updated', { date: exportDate(lang, new Date(), model.user.timezone) })} · ${exportWordsLabel(t, lang, totalWords)} · ${t('export.doc.sceneCount', { n: exportNumber(lang, model.scenes.length) }, model.scenes.length)}`,
    language: project.language || lang,
    blocks,
  }
}

/** The primary image of an entity: the first by position. */
function primaryImageRow(model: ExportModel, ownerType: string, ownerId: string) {
  return model.bundle.images.filter(i => i.ownerType === ownerType && i.ownerId === ownerId).sort((a, b) => a.position - b.position)[0]
}

/** The project document as DOCX. `images` holds the pictures Word can show, by media id. */
export async function projectDocumentDocx(model: ExportModel, images: Map<string, DocumentImage>): Promise<Buffer> {
  const document = buildProjectDocument(model)
  const rich: DocxRichContext = { names: model.names, indent: 0, separator: '***', style: 'AuthorText', lists: docxListCounter() }
  const body: (Paragraph | Table)[] = []
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }

  for (const block of document.blocks) {
    switch (block.kind) {
      case 'heading': {
        // Heading 2 is set in the serif (names), Heading 3 in the sans (the sections of a profile): a heading
        // in the other voice keeps its style, for the navigation pane, and changes only its face.
        const face = block.level === 2 && !block.author ? SANS : block.level === 3 && block.author ? SERIF : undefined
        body.push(new Paragraph({
          heading: block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          children: [new TextRun({ text: exportCleanText(block.text), ...(face ? { font: face } : {}) })],
        }))
        break
      }
      case 'meta':
        body.push(new Paragraph({ style: 'Meta', children: [new TextRun({ text: exportCleanText(block.text), italics: block.italic })] }))
        break
      case 'field':
        body.push(new Paragraph({ style: 'AuthorText', children: [new TextRun({ text: `${exportCleanText(block.label)}: `, font: SANS, bold: true, size: 19 }), new TextRun(exportCleanText(block.value))] }))
        break
      case 'rich':
        body.push(...docxParagraphs(block.doc, rich))
        break
      case 'label':
        body.push(new Paragraph({ style: 'Label', children: [new TextRun(exportCleanText(block.text))] }))
        break
      case 'list':
        for (const item of block.items) body.push(new Paragraph({ style: 'AuthorText', bullet: { level: 0 }, children: [new TextRun(exportCleanText(item))] }))
        break
      case 'question':
        body.push(new Paragraph({ style: 'Question', children: [new TextRun(exportCleanText(block.text))] }))
        break
      case 'text':
        for (const paragraph of block.paragraphs) {
          body.push(new Paragraph({ style: 'AuthorText', children: paragraph.split('\n').flatMap((line, i) => [...(i ? [new TextRun({ break: 1 })] : []), new TextRun({ text: exportCleanText(line), italics: block.italic })]) }))
        }
        break
      case 'image': {
        const row = primaryImageRow(model, block.ownerType, block.ownerId)
        const picture = row ? images.get(row.mediaId) : undefined
        if (!row || !picture?.width || !picture.height) break
        const name = model.names.get(`${block.ownerType}:${block.ownerId}`) ?? ''
        const scale = Math.min((block.portrait ? 151 : 265) / picture.width, (block.portrait ? 202 : 227) / picture.height, 1)
        body.push(new Paragraph({
          spacing: { before: 80, after: 120 },
          children: [new ImageRun({
            type: picture.type,
            data: picture.data,
            transformation: { width: Math.round(picture.width * scale), height: Math.round(picture.height * scale) },
            altText: { name: row.caption || name, description: row.alt || row.caption || name, title: row.caption || '' },
          })],
        }))
        if (row.caption) body.push(new Paragraph({ style: 'Meta', children: [new TextRun({ text: exportCleanText(row.caption), italics: true })] }))
        break
      }
      case 'table': {
        const cell = (value: string, head: boolean, width: number) => new TableCell({
          width: { size: width, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 90, right: 90 },
          children: value.split('\n').map(line => new Paragraph({ style: head ? 'Label' : 'TableText', children: [new TextRun(exportCleanText(line))] })),
        })
        body.push(new Table({
          width: { size: block.widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
          columnWidths: block.widths,
          borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
          rows: [
            new TableRow({ tableHeader: true, children: block.headers.map((h, i) => cell(h, true, block.widths[i]!)) }),
            ...block.rows.map(r => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v, false, block.widths[i]!)) })),
          ],
        }))
        body.push(new Paragraph({ children: [] }))
        break
      }
      case 'entry':
        body.push(new Paragraph({
          style: 'AuthorText',
          keepNext: block.keepNext,
          spacing: { before: 180 },
          children: [
            ...(block.lead ? [new TextRun({ text: `${exportCleanText(block.lead)}  `, font: SANS, bold: true, size: 19 })] : []),
            new TextRun({ text: exportCleanText(block.title), bold: true }),
          ],
        }))
        break
    }
  }

  const titlePage: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(exportCleanText(document.title))] }),
    new Paragraph({ style: 'Subtitle', children: [new TextRun(document.name)] }),
    ...(document.subtitle ? [new Paragraph({ style: 'Meta', alignment: AlignmentType.CENTER, children: [new TextRun({ text: exportCleanText(document.subtitle), italics: true })] })] : []),
    ...(document.author ? [new Paragraph({ style: 'Meta', alignment: AlignmentType.CENTER, spacing: { before: 480 }, children: [new TextRun({ text: exportCleanText(document.author), size: 24 })] })] : []),
    new Paragraph({ style: 'Meta', alignment: AlignmentType.CENTER, spacing: { before: 480 }, children: [new TextRun(document.stats)] }),
  ]

  const page = { size: { width: 11906, height: 16838 }, margin: { top: 1247, bottom: 1247, left: 1361, right: 1361 } }
  const doc = new Document({
    title: `${document.title}: ${document.name}`,
    creator: document.author || undefined,
    numbering: DOCX_NUMBERING,
    styles: {
      default: {
        document: {
          run: { font: SERIF, size: 22, language: { value: docxLanguage(document.language) } },
          paragraph: { spacing: { after: 120, line: 288 } },
        },
        title: { run: { font: SERIF, size: 52, bold: true, color: '1F1F1F' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 240 } } },
        heading1: { run: { font: SANS, size: 32, bold: true, color: '1F1F1F' }, paragraph: { spacing: { before: 480, after: 200 }, keepNext: true, outlineLevel: 0 } },
        heading2: { run: { font: SERIF, size: 28, bold: true, color: '1F1F1F' }, paragraph: { spacing: { before: 360, after: 120 }, keepNext: true, outlineLevel: 1 } },
        heading3: { run: { font: SANS, size: 22, bold: true, color: '1F1F1F' }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true, outlineLevel: 2 } },
      },
      paragraphStyles: [
        { id: 'Normal', name: 'Normal', quickFormat: true, run: { font: SERIF, size: 22 }, paragraph: { spacing: { after: 120, line: 288 } } },
        { id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', next: 'Normal', run: { font: SANS, size: 28, color: MUTED }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 240 } } },
        { id: 'AuthorText', name: 'Author text', basedOn: 'Normal', next: 'AuthorText', quickFormat: true, run: { font: SERIF, size: 22 }, paragraph: { spacing: { after: 120, line: 288 } } },
        { id: 'Meta', name: 'Details', basedOn: 'Normal', next: 'AuthorText', quickFormat: true, run: { font: SANS, size: 18, color: MUTED }, paragraph: { spacing: { after: 100 } } },
        { id: 'Label', name: 'Label', basedOn: 'Normal', next: 'AuthorText', quickFormat: true, run: { font: SANS, size: 19, bold: true }, paragraph: { spacing: { before: 160, after: 60 }, keepNext: true } },
        { id: 'Question', name: 'Question', basedOn: 'Normal', next: 'AuthorText', quickFormat: true, run: { font: SANS, size: 19, bold: true, color: '404040' }, paragraph: { spacing: { before: 140, after: 40 }, keepNext: true } },
        { id: 'TableText', name: 'Table text', basedOn: 'Normal', run: { font: SANS, size: 18 }, paragraph: { spacing: { after: 0, line: 252 } } },
      ],
    },
    sections: [
      { properties: { page }, children: titlePage },
      {
        properties: { page: { ...page, pageNumbers: { start: 1 } } },
        footers: { default: new Footer({ children: [new Paragraph({ style: 'Meta', alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
        children: body.length ? body : [new Paragraph({ children: [] })],
      },
    ],
  })
  return Packer.toBuffer(doc)
}

/** The project document for the print page (the PDF): rich texts as safe XHTML, images by media id. */
export function projectDocumentPrint(model: ExportModel) {
  const document = buildProjectDocument(model)
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.kind === 'rich') return { kind: 'html' as const, html: richToHtml(block.doc, { names: model.names, separator: '***' }) }
      if (block.kind === 'image') {
        const row = primaryImageRow(model, block.ownerType, block.ownerId)
        if (!row) return null
        const name = model.names.get(`${block.ownerType}:${block.ownerId}`) ?? ''
        return { kind: 'image' as const, mediaId: row.mediaId, caption: row.caption, alt: row.alt || row.caption || name, portrait: block.portrait }
      }
      return block
    }).filter(b => b !== null),
  }
}
