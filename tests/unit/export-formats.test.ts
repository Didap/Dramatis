import { Document, Packer } from 'docx'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { ProjectModule, RichDoc, RichNode } from '../../shared/types/domain'
import { flowChecks } from '../../shared/utils/flow'
import { buildProjectDocument } from '../../server/utils/export/document'
import { DOCX_NUMBERING, docxListCounter, docxParagraphs } from '../../server/utils/export/docx-rich'
import { exportBrokenChoices, exportChoices, exportLines } from '../../server/utils/export/game'
import { exportTranslator } from '../../server/utils/export/i18n'
import { gameInk, inkEscape, inkKnotName } from '../../server/utils/export/ink'
import { buildManuscript, exportChapterNumber } from '../../server/utils/export/manuscript'
import { exportFlowClean, type ExportModel } from '../../server/utils/export/model'
import { gameTwee, tweeEscape, tweePassageName } from '../../server/utils/export/twee'
import { manuscriptTxt } from '../../server/utils/export/txt'
import { voiceOverCsv, voiceOverRows } from '../../server/utils/export/vo-csv'

/*
 * The rules of the export formats (appendix D) on a small story built here: the implicit continuation, the
 * conditions and effects as each format writes them, the escaping of the author's text, chapter numbers,
 * separators, CSV quoting and the numbering of Word lists. The files of the demo projects are checked end to
 * end by scripts/export-check.mjs.
 */

const T = '2026-10-18T10:00:00.000Z'
const text = (value: string, marks: string[] = []): RichNode => ({ type: 'text', text: value, ...(marks.length ? { marks: marks.map(type => ({ type })) } : {}) })
const doc = (...content: RichNode[]): RichDoc => ({ type: 'doc', content })
const paragraph = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content })
const line = (speakerId: string | null, speakerName: string, words: string, lineId: string, direction = ''): RichNode =>
  ({ type: 'dialogueLine', attrs: { speakerId, speakerName, direction, lineId }, content: [text(words)] })

interface SceneSpec { id: string, code: string, title: string, chapterId?: string, ending?: boolean, status?: string, words?: number, content?: RichDoc | null }
interface LinkSpec { id: string, from: string, to: string, label?: string, mode?: 'all' | 'any', clauses?: { variableId: string, op: string, value?: string }[], effects?: { variableId: string, op: string, value?: string }[] }

/** An export model of a small game (or novel) without the database. */
function model(options: {
  kind?: 'novel' | 'game'
  scenes: SceneSpec[]
  chapters?: { id: string, title: string }[]
  links?: LinkSpec[]
  variables?: { id: string, name: string, type: 'boolean' | 'number' | 'string', defaultValue?: string }[]
  start?: string | null
  modules?: Partial<Record<ProjectModule, boolean>>
  separator?: string
}): ExportModel {
  const kind = options.kind ?? 'game'
  const on = kind === 'game'
  const modules = { branching: on, variables: on, quests: on, codex: on, script: on, scene_kinds: on, ...options.modules } as Record<ProjectModule, boolean>
  const chapters = (options.chapters ?? [{ id: 'c1', title: 'Il porto' }]).map((c, i) => ({ ...c, partId: null, reason: null, notes: null, wordGoal: null, position: i, versions: {}, meta: {}, createdAt: T, updatedAt: T, deletedAt: null }))
  const scenes = options.scenes.map((s, i) => ({
    id: s.id, code: s.code, title: s.title, chapterId: s.chapterId ?? chapters[0]!.id, ending: s.ending ?? false, endingLabel: '', status: s.status ?? 'draft', kind: 'scene',
    synopsis: '', wordCount: s.words ?? 10, position: i, strandIds: [], characterIds: [], locationIds: [], objectIds: [], povCharacterId: null, flowPosition: null, createdAt: T,
  }))
  const links = (options.links ?? []).map((l, i) => ({
    id: l.id, fromSceneId: l.from, toSceneId: l.to, label: l.label ?? '', position: i, createdAt: T,
    conditions: { mode: l.mode ?? 'all', clauses: l.clauses ?? [] }, effects: l.effects ?? [],
  }))
  const variables = (options.variables ?? []).map((v, i) => ({ ...v, defaultValue: v.defaultValue ?? '', description: '', position: i }))
  const project = {
    id: 'project', kind, title: 'La chiave d\'ottone', subtitle: '', authorName: 'Prova', language: 'it', startSceneId: options.start === undefined ? options.scenes[0]?.id ?? null : options.start,
    settings: { sceneSeparator: options.separator ?? '' }, premise: null, fabula: null, setting: null, premiseStatus: 'todo', fabulaStatus: 'todo', settingStatus: 'todo',
  }
  const bundle = { project, links, variables, chapters, scenes, parts: [], characters: [{ id: 'oren', name: 'Oren', aliases: [], importance: 'main', role: '', playable: false, tagline: '', description: null, notes: null, profile: {}, traits: {}, position: 0 }], groups: [], locations: [], objects: [], images: [], strands: [], relations: [], maps: [], events: [], notes: [], codexCategories: [], codexEntries: [] }
  const ordered = chapters.flatMap(c => scenes.filter(s => s.chapterId === c.id))
  const lang = 'it'
  return {
    user: { id: 'u', name: 'Prova', locale: 'it', timezone: 'Europe/Rome' },
    project,
    bundle,
    modules,
    isGame: kind === 'game',
    usesParts: false,
    parts: [],
    chapters,
    scenes: ordered,
    scenesByChapter: new Map(chapters.map(c => [c.id, scenes.filter(s => s.chapterId === c.id)])),
    content: new Map(options.scenes.map(s => [s.id, s.content ?? doc(paragraph(text(`Testo di ${s.title}.`)))])),
    names: new Map([['character:oren', 'Oren']]),
    flow: modules.branching ? flowChecks({ scenes: ordered, links, startSceneId: project.startSceneId, variables, variablesModule: modules.variables }) : null,
    lang,
    t: exportTranslator(lang),
    day: '2026-10-18',
  } as unknown as ExportModel
}

const ui = exportTranslator('it')

// The story of appendix D.6 and D.7: a choice with a condition and effects, a scene that continues on its own.
const story = () => model({
  scenes: [
    { id: 's3', code: 'S003', title: 'Dialogo con Oren', content: doc(line('oren', '', 'La porta è chiusa.', 'S003-L004', 'sottovoce')) },
    { id: 's4', code: 'S004', title: 'Il cortile' },
    { id: 's5', code: 'S005', title: 'La porta della torre', ending: true },
  ],
  variables: [
    { id: 'v1', name: 'fiducia_oren', type: 'number', defaultValue: '0' },
    { id: 'v2', name: 'ha_la_chiave', type: 'boolean' },
    { id: 'v3', name: 'ha_detto_la_verita', type: 'boolean' },
  ],
  links: [
    {
      id: 'l1', from: 's3', to: 's5', label: 'Dille la verità',
      clauses: [{ variableId: 'v1', op: 'gte', value: '2' }, { variableId: 'v2', op: 'is_true' }],
      effects: [{ variableId: 'v3', op: 'set', value: 'true' }, { variableId: 'v1', op: 'add', value: '2' }],
    },
    { id: 'l2', from: 's3', to: 's4', label: 'Taci' },
  ],
})

describe('the choices of the team formats', () => {
  it('writes the implicit continuation only for scenes without any choice', () => {
    const choices = exportChoices(story())
    expect(choices.get('s3')!.map(c => [c.to.code, c.implicit])).toEqual([['S005', false], ['S004', false]])
    expect(choices.get('s4')!.map(c => [c.to.code, c.implicit])).toEqual([['S005', true]])
    expect(choices.has('s5')).toBe(false)
  })

  it('gives no continuation to a scene whose only choice points to the trash (spec 0.8)', () => {
    const m = model({
      scenes: [{ id: 'a', code: 'S001', title: 'A' }, { id: 'b', code: 'S002', title: 'B', ending: true }],
      links: [{ id: 'gone', from: 'a', to: 'trashed', label: 'Apri' }],
    })
    expect(exportChoices(m).get('a')).toBeUndefined()
    expect(exportBrokenChoices(m).get('a')!.map(c => c.text)).toEqual(['Apri'])
    expect(gameInk(m, ui)).toMatch(/=== s001_a ===\n# code: S001\n# kind: scene\nTesto di A\.\n-> END/)
    expect(exportFlowClean(m)).toBe(false)
  })

  it('reads a boolean condition stored as "eq true" as is_true', () => {
    const m = model({
      scenes: [{ id: 'a', code: 'S001', title: 'A' }, { id: 'b', code: 'S002', title: 'B', ending: true }],
      variables: [{ id: 'v', name: 'has_logbook', type: 'boolean' }],
      links: [
        { id: 'l1', from: 'a', to: 'b', label: 'Leggi', clauses: [{ variableId: 'v', op: 'eq', value: 'true' }] },
        { id: 'l2', from: 'a', to: 'b', label: 'Ignora', clauses: [{ variableId: 'v', op: 'neq', value: 'true' }] },
      ],
    })
    const [read, ignore] = exportChoices(m).get('a')!
    expect(read!.condition!.clauses.map(c => [c.op, c.value])).toEqual([['is_true', null]])
    expect(ignore!.condition!.clauses.map(c => [c.op, c.value])).toEqual([['is_false', null]])
    expect(gameInk(m, ui)).toContain('+ {has_logbook} [Leggi]')
    expect(gameInk(m, ui)).toContain('+ {not has_logbook} [Ignora]')
    expect(gameTwee(m, 'ID', ui)).toContain('(if: $has_logbook is true)[(link-goto: "Leggi", "S002 B")]')
  })

  it('counts a choice to a trashed variable as a problem of the flow, as the flow view does', () => {
    const m = model({
      scenes: [{ id: 'a', code: 'S001', title: 'A' }, { id: 'b', code: 'S002', title: 'B', ending: true }],
      links: [{ id: 'l1', from: 'a', to: 'b', label: 'Vai', clauses: [{ variableId: 'trashed', op: 'is_true' }] }],
    })
    expect(m.flow!.checks.map(c => c.kind)).toContain('trashedVariable')
    expect(exportFlowClean(m)).toBe(false)
    expect(exportFlowClean(story())).toBe(true)
  })

  it('keeps only line ids of the server\'s shape', () => {
    const lines = exportLines(doc(line(null, 'Voce', 'Uno', 'S001-L001'), line(null, 'Voce', 'Due', 'x\n-> END')), new Map())
    expect(lines.map(l => l.lineId)).toEqual(['S001-L001', null])
  })
})

describe('Twee 3', () => {
  it('writes the choices of appendix D.6', () => {
    const twee = gameTwee(story(), 'D674C58C-DEFA-4F70-B7A2-27742230C0FC', ui)
    expect(twee).toContain(':: S003 Dialogo con Oren [scene] ')
    expect(twee).toContain('(if: $fiducia_oren >= 2 and $ha_la_chiave is true)[(link: "Dille la verità")[(set: $ha_detto_la_verita to true)(set: $fiducia_oren to it + 2)(go-to: "S005 La porta della torre")]]')
    expect(twee).toContain('[[Taci->S004 Il cortile]]')
    expect(twee).toContain('[[Continua->S005 La porta della torre]]')
    expect(twee).toContain('\'\'Oren\'\' (sottovoce): La porta è chiusa.')
    expect(twee).toContain(':: Startup [startup]\n{(set: $fiducia_oren to 0)(set: $ha_la_chiave to false)(set: $ha_detto_la_verita to false)}')
    expect(twee).toContain(':: S005 La porta della torre [scene ending]')
  })

  it('writes the same story for SugarCube', () => {
    const twee = gameTwee(story(), 'ID', ui, 'sugarcube')
    expect(twee).toContain('<<if $fiducia_oren gte 2 and $ha_la_chiave is true>><<link "Dille la verità" "S005 La porta della torre">><<set $ha_detto_la_verita to true>><<set $fiducia_oren to $fiducia_oren + 2>><</link>><</if>>')
    expect(twee).toContain(':: StoryInit\n<<set $fiducia_oren to 0>>')
  })

  it('keeps the author\'s text from turning into markup', () => {
    expect(tweeEscape('$oro (set: $x to 1) [[via]] \'\'forte\'\' //corsivo// <b>')).toBe('&#36;oro &#40;set: &#36;x to 1) &#91;&#91;via&#93;&#93; &#39;&#39;forte&#39;&#39; &#47;/corsivo&#47;/ &lt;b&gt;')
    expect(tweeEscape(':: Passaggio\n- elenco\n# titolo')).toBe('&#58;: Passaggio\n&#45; elenco\n&#35; titolo')
    expect(tweePassageName({ code: 'S007', title: 'Il [ponte] -> rotto' })).toBe('S007 Il ponte rotto')
  })

  it('keeps the title on its own line', () => {
    const m = story()
    m.project.title = 'Una storia\n:: StoryData'
    expect(gameTwee(m, 'ID', ui)).toMatch(/^:: StoryTitle\nUna storia :: StoryData\n\n:: StoryData\n/)
  })
})

describe('Ink', () => {
  it('writes the choices of appendix D.7', () => {
    const ink = gameInk(story(), ui)
    expect(ink).toContain('VAR fiducia_oren = 0\nVAR ha_la_chiave = false\nVAR ha_detto_la_verita = false\n\n-> s003_dialogo_con_oren')
    expect(ink).toContain('Oren: (sottovoce) La porta è chiusa. #id:S003-L004')
    expect(ink).toContain('+ {fiducia_oren >= 2 and ha_la_chiave} [Dille la verità]\n    ~ ha_detto_la_verita = true\n    ~ fiducia_oren += 2\n    -> s005_la_porta_della_torre')
    expect(ink).toContain('=== s004_il_cortile ===\n# code: S004\n# kind: scene\nTesto di Il cortile.\n-> s005_la_porta_della_torre')
    expect(ink).toMatch(/=== s005_la_porta_della_torre ===[\s\S]*-> END\n$/)
  })

  it('writes toggles and subtractions', () => {
    const m = model({
      scenes: [{ id: 'a', code: 'S001', title: 'A' }, { id: 'b', code: 'S002', title: 'B', ending: true }],
      variables: [{ id: 'v', name: 'luce', type: 'boolean' }, { id: 'n', name: 'monete', type: 'number' }],
      links: [{ id: 'l', from: 'a', to: 'b', label: 'Paga', effects: [{ variableId: 'v', op: 'toggle' }, { variableId: 'n', op: 'subtract', value: '3' }] }],
    })
    expect(gameInk(m, ui)).toContain('+ [Paga]\n    ~ luce = not luce\n    ~ monete -= 3\n    -> s002_b')
  })

  it('escapes the author\'s text and names knots from code and title', () => {
    expect(inkEscape('* {oro} | #tag -> via')).toBe('\\* \\{oro\\} \\| \\#tag -\\> via')
    expect(inkEscape('VAR x = 1')).toBe('\\VAR x = 1')
    expect(inkKnotName({ code: 'S014', title: 'L\'ultimo bivio!' })).toBe('s014_lultimo_bivio')
  })
})

describe('the manuscript', () => {
  const novel = () => model({
    kind: 'novel',
    chapters: [{ id: 'c1', title: 'Il porto' }, { id: 'c2', title: 'Vuoto' }, { id: 'c3', title: 'La torre' }],
    scenes: [
      { id: 'a', code: 'S001', title: 'Uno', chapterId: 'c1', status: 'final' },
      { id: 'b', code: 'S002', title: 'Due', chapterId: 'c1', status: 'draft' },
      { id: 'c', code: 'S003', title: 'Tre', chapterId: 'c2', status: 'draft', words: 0 },
      { id: 'd', code: 'S004', title: 'Quattro', chapterId: 'c3', status: 'final' },
    ],
  })

  it('numbers chapters as the outline does, whatever the selection leaves out', () => {
    const ms = buildManuscript(novel(), { scenes: 'final' })
    expect(ms.parts.flatMap(p => p.chapters.map(c => c.heading))).toEqual(['1. Il porto', '3. La torre'])
    expect(exportChapterNumber(14, 'roman', 'it')).toBe('XIV')
    expect(exportChapterNumber(21, 'words', 'it')).toBe('Ventuno')
    expect(exportChapterNumber(23, 'words', 'en')).toBe('Twenty-three')
  })

  it('writes a visible separator in plain text, with a BOM and CRLF', () => {
    const txt = manuscriptTxt(buildManuscript(novel(), { separator: 'blank', titlePage: false }))
    expect(txt.startsWith('﻿')).toBe(true)
    expect(txt).not.toMatch(/[^\r]\n/)
    expect(txt).toContain('Testo di Uno.\r\n\r\n***\r\n\r\nTesto di Due.')
  })

  it('numbers each Word list from 1, whatever came before it in the file', async () => {
    const list = doc({ type: 'orderedList', content: [{ type: 'listItem', content: [paragraph(text('voce'))] }] })
    const ctx = { names: new Map<string, string>(), indent: 0, separator: '***', lists: docxListCounter() }
    const children = [...docxParagraphs(list, ctx), ...docxParagraphs(list, ctx)]
    const file = await Packer.toBuffer(new Document({ numbering: DOCX_NUMBERING, sections: [{ children }] }))
    const numbering = strFromU8(unzipSync(new Uint8Array(file))['word/numbering.xml']!)
    const document = strFromU8(unzipSync(new Uint8Array(file))['word/document.xml']!)
    const used = [...document.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map(m => m[1])
    expect(new Set(used).size).toBe(2)
    for (const id of used) expect(numbering).toContain(`<w:num w:numId="${id}">`)
  })
})

describe('the voice-over script', () => {
  it('quotes what needs quoting and keeps formulas as text', () => {
    const m = model({ scenes: [{ id: 'a', code: 'S001', title: 'Il "molo", di notte', content: doc(line(null, 'Guardia', '=SOMMA(A1); "Alt!"', 'S001-L001', 'urla')) }] })
    const csv = voiceOverCsv(voiceOverRows(m), { delimiter: 'semicolon', onlyRevised: false })
    expect(csv.startsWith('﻿line_id;scene_code;act;chapter;scene_title;scene_kind;order;speaker;speaker_id;direction;text;words;scene_status\r\n')).toBe(true)
    expect(csv).toContain('S001-L001;S001;;Il porto;"Il ""molo"", di notte";scene;1;Guardia;;urla;"\'=SOMMA(A1); ""Alt!""";2;draft\r\n')
  })
})

describe('the project document', () => {
  it('lists the checks of the flow view, choices to the trash included', () => {
    const m = model({
      scenes: [{ id: 'a', code: 'S001', title: 'A' }, { id: 'b', code: 'S002', title: 'B', ending: true }],
      links: [{ id: 'gone', from: 'a', to: 'trashed', label: 'Apri' }],
    })
    const blocks = buildProjectDocument(m).blocks
    const field = (label: string) => blocks.find(b => b.kind === 'field' && b.label === label)
    expect(field('Scelte verso scene nel cestino')).toMatchObject({ value: 'S001: «Apri»' })
    expect(field('Vicoli ciechi')).toMatchObject({ value: 'S001 A' })
    expect(blocks.some(b => b.kind === 'table' && b.rows.some(r => r[2] === 'scena nel cestino'))).toBe(true)
    expect(blocks.some(b => b.kind === 'meta' && b.text.startsWith('Nessun problema'))).toBe(false)
  })
})
