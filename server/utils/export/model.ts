import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { ExportWhat, ProjectModule, RichDoc, RichNode } from '#shared/types/domain'
import type { Chapter, Part, Project, ProjectBundle, Scene } from '#shared/types/entities'
import { flowChecks } from '#shared/utils/flow'
import { resolveModules } from '#shared/utils/modules'
import { parseMentionId } from '#shared/utils/richtext'
import { exportLanguage, exportTranslator, type ExportLang, type ExportTranslator } from './i18n'

/*
 * Everything an export reads (appendix D): the live project in manuscript order, the active revision of every
 * scene, the modules that are on, the flow analysis, and the language the file is written in.
 */

export interface ExportUser {
  id: string
  name: string
  locale: string
  timezone: string
}

export interface ExportModel {
  user: ExportUser
  project: Project
  bundle: ProjectBundle
  modules: Record<ProjectModule, boolean>
  isGame: boolean
  usesParts: boolean
  /** Parts in order (empty when the project does not use parts). */
  parts: Part[]
  /** Chapters in reading order: those outside any part first, then part by part (as the outline). */
  chapters: Chapter[]
  /** Scenes in reading order. */
  scenes: Scene[]
  scenesByChapter: Map<string, Scene[]>
  /** Text of the active revision of each scene (only when loaded with `content`). */
  content: Map<string, RichDoc | null>
  /** Current names by "<type>:<id>", for mentions and speakers. */
  names: Map<string, string>
  /** The flow checks of the app (sidebar badge, flow view, path), with the analysis; null without branching. */
  flow: ExportFlow | null
  lang: ExportLang
  t: ExportTranslator
  /** Today in the author's time zone (YYYY-MM-DD), for file names. */
  day: string
}

export type ExportFlow = ReturnType<typeof flowChecks>

const byPosition = (a: { position?: number, createdAt: string }, b: { position?: number, createdAt: string }) =>
  (a.position ?? 0) - (b.position ?? 0) || a.createdAt.localeCompare(b.createdAt)

/** Loads the project of the request (owned by the signed-in user) for an export. */
export async function loadExportModel(event: H3Event, options: { content?: boolean } = {}): Promise<ExportModel> {
  const { user, project: row } = await requireProject(event)
  const bundle = await loadBundle(row)
  const project = bundle.project
  const modules = resolveModules(project.kind, project.modules)
  const parted = usesParts(project)

  const parts = parted ? [...bundle.parts].sort(byPosition) : []
  const partOrder = new Map(parts.map((p, i) => [p.id, i]))
  const chapters = [...bundle.chapters].sort((a, b) => {
    const pa = a.partId ? (partOrder.get(a.partId) ?? -1) : -1
    const pb = b.partId ? (partOrder.get(b.partId) ?? -1) : -1
    return pa - pb || byPosition(a, b)
  })
  const scenesByChapter = new Map<string, Scene[]>()
  for (const scene of bundle.scenes) {
    const list = scenesByChapter.get(scene.chapterId)
    if (list) list.push(scene)
    else scenesByChapter.set(scene.chapterId, [scene])
  }
  for (const list of scenesByChapter.values()) list.sort(byPosition)
  const scenes = chapters.flatMap(c => scenesByChapter.get(c.id) ?? [])

  const names = new Map<string, string>()
  for (const c of bundle.characters) names.set(`character:${c.id}`, c.name)
  for (const g of bundle.groups) names.set(`group:${g.id}`, g.name)
  for (const l of bundle.locations) names.set(`location:${l.id}`, l.name)
  for (const o of bundle.objects) names.set(`object:${o.id}`, o.name)
  for (const e of bundle.codexEntries) names.set(`codex:${e.id}`, e.title)

  const lang = exportLanguage(project.language, user.locale)
  return {
    user: { id: user.id, name: user.name, locale: user.locale, timezone: user.timezone },
    project,
    bundle,
    modules,
    isGame: project.kind === 'game',
    usesParts: parted,
    parts,
    chapters,
    scenes,
    scenesByChapter,
    content: options.content ? await activeContents(project.id, scenes) : new Map(),
    names,
    flow: modules.branching
      ? flowChecks({ scenes, links: bundle.links, startSceneId: project.startSceneId, variables: bundle.variables, variablesModule: modules.variables })
      : null,
    lang,
    t: exportTranslator(lang),
    day: dayIn(user.timezone),
  }
}

/** The text of the active revision of each scene; a missing pointer falls back to the latest live revision. */
async function activeContents(projectId: string, scenes: Scene[]): Promise<Map<string, RichDoc | null>> {
  const db = useDb()
  const r = tables.sceneRevisions
  const content = new Map<string, RichDoc | null>()
  const pointers = scenes.map(s => s.currentRevisionId).filter((id): id is string => !!id)
  for (let i = 0; i < pointers.length; i += 500) {
    const rows = await db
      .select({ sceneId: r.sceneId, content: r.content })
      .from(r)
      .where(and(eq(r.projectId, projectId), inArray(r.id, pointers.slice(i, i + 500)), isNull(r.deletedAt)))
    for (const row of rows) content.set(row.sceneId, row.content)
  }
  const missing = scenes.filter(s => !content.has(s.id)).map(s => s.id)
  if (missing.length) {
    const rows = await db
      .selectDistinctOn([r.sceneId], { sceneId: r.sceneId, content: r.content })
      .from(r)
      .where(and(eq(r.projectId, projectId), inArray(r.sceneId, missing), isNull(r.deletedAt)))
      .orderBy(r.sceneId, desc(r.number))
    for (const row of rows) content.set(row.sceneId, row.content)
  }
  return content
}

/** Every live scene is final (and there is at least one): what the path's last stage looks for. */
export function exportAllFinal(model: Pick<ExportModel, 'scenes'>): boolean {
  return model.scenes.length > 0 && model.scenes.every(s => s.status === 'final')
}

/**
 * The flow checks are clean: no problem the sidebar badge would count (trashed targets and variables, rules
 * that do not fit, unreachable scenes and endings, dead ends, no start, no ending); true without branching.
 */
export function exportFlowClean(model: Pick<ExportModel, 'flow'>): boolean {
  return !model.flow || model.flow.problems === 0
}

/** Records an export (spec 7.24): what, format, and whether every scene was final and the flow clean. */
export async function recordExport(model: Pick<ExportModel, 'project' | 'scenes' | 'flow'>, what: ExportWhat, format: string) {
  await useDb().insert(tables.exportLog).values({
    projectId: model.project.id,
    what,
    format,
    allFinal: exportAllFinal(model),
    flowClean: exportFlowClean(model),
  })
}

/** The text a mention shows: the entity's current name when the label follows it, otherwise the label. */
export function exportMentionText(node: RichNode, names: Map<string, string>): string {
  const ref = parseMentionId(node.attrs?.id)
  const current = ref ? names.get(`${ref.type}:${ref.id}`) : undefined
  const label = typeof node.attrs?.label === 'string' ? node.attrs.label : ''
  if (current && (node.attrs?.followsName || !label)) return current
  return label
}

/** The name of the speaker of a dialogue line: the character's current name, or the free label. */
export function exportSpeaker(attrs: Record<string, unknown> | undefined, names: Map<string, string>): string {
  const id = typeof attrs?.speakerId === 'string' ? attrs.speakerId : ''
  const current = id ? names.get(`character:${id}`) : undefined
  return (current ?? String(attrs?.speakerName ?? '')).trim()
}

/** The direction of a dialogue line, without the parentheses an author may have typed around it. */
export function exportDirection(attrs: Record<string, unknown> | undefined): string {
  const direction = String(attrs?.direction ?? '').trim()
  const bare = /^\((.*)\)$/s.exec(direction)
  return (bare ? bare[1]! : direction).trim()
}

/** Inline text of a node (mentions resolved, hard breaks as spaces or newlines). */
export function exportInlineText(node: RichNode, names: Map<string, string>, breaks = ' '): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return breaks
  if (node.type === 'mention') return exportMentionText(node, names)
  return (node.content ?? []).map(n => exportInlineText(n, names, breaks)).join('')
}

/** Paragraphs of a rich text as plain strings (lists flattened, separators dropped), for documents and JSON. */
export function exportPlainParagraphs(doc: RichDoc | null | undefined, names: Map<string, string>): string[] {
  const out: string[] = []
  const walk = (node: RichNode) => {
    switch (node.type) {
      case 'doc':
      case 'bulletList':
      case 'orderedList':
      case 'blockquote':
      case 'listItem':
        ;(node.content ?? []).forEach(walk)
        return
      case 'horizontalRule':
      case 'sceneBreak':
      case 'image':
        return
      case 'dialogueLine': {
        const speaker = exportSpeaker(node.attrs, names)
        const direction = exportDirection(node.attrs)
        const text = exportInlineText(node, names).trim()
        out.push(`${speaker ? `${speaker}: ` : ''}${direction ? `(${direction}) ` : ''}${text}`)
        return
      }
      default: {
        const text = exportInlineText(node, names, '\n').trim()
        if (text) out.push(text)
      }
    }
  }
  if (doc) walk(doc)
  return out
}

const isBlankBlock = (node: RichNode) =>
  node.type === 'paragraph' && !(node.content ?? []).some(n => n.type === 'mention' || (n.type === 'text' && n.text?.trim()))

/** A document without the empty paragraphs at its start and end (the editor often keeps one). */
export function exportTrimDoc(doc: RichDoc | null | undefined): RichDoc | null {
  if (!doc?.content) return doc ?? null
  const content = [...doc.content]
  while (content.length && isBlankBlock(content[0]!)) content.shift()
  while (content.length && isBlankBlock(content.at(-1)!)) content.pop()
  return { ...doc, content }
}

/** Plain text of a rich text, paragraphs separated by a blank line. */
export function exportPlainText(doc: RichDoc | null | undefined, names: Map<string, string>): string {
  return exportPlainParagraphs(doc, names).join('\n\n')
}
