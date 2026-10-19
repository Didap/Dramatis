import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import type { RichDoc } from '#shared/types/domain'
import { PROFILE_SECTIONS } from '#shared/content/profile'
import { resolveModules } from '#shared/utils/modules'
import { richToPlainText } from '#shared/utils/richtext'

/*
 * Full-text search of a project (spec 5.9): the active revision of every scene, synopses and notes,
 * premise, fabula and setting, every description, profile answers and free text, notes, codex
 * entries, choice texts. Case and accent insensitive ("citta" finds "città", ' finds ’), phrase
 * match. Trashed items never appear, nor items of a module that is switched off.
 */

export type SearchType = 'scene' | 'chapter' | 'part' | 'architecture' | 'character' | 'group' | 'location' | 'object' | 'strand' | 'event' | 'note' | 'codex' | 'variable'

export const SEARCH_TYPES: readonly SearchType[] = ['scene', 'architecture', 'character', 'group', 'location', 'object', 'strand', 'chapter', 'part', 'event', 'note', 'codex', 'variable']

export interface SearchMatch {
  type: SearchType
  /** The item id; for architecture, the pillar (premise, fabula, setting). */
  id: string
  title: string
  /** Highlighted ranges of the title, [start, end). */
  titleMarks: [number, number][]
  /** Where the shown snippet comes from: text, synopsis, choice, notes, alias, tagline, description, profile, traits... */
  field: string
  /** For profile answers and free text: the section and, for answers, the question. */
  section?: string
  question?: string
  /** A short passage around the first match ('' when only the title matches). */
  snippet: string
  marks: [number, number][]
  /** Occurrences in the whole item. */
  count: number
  chapterId?: string
  status?: string
  code?: string
}

export interface SearchGroup {
  type: SearchType
  /** Items with at least one match (the list may be cut at the limit). */
  total: number
  /** Occurrences across all of them. */
  occurrences: number
  items: SearchMatch[]
}

export interface SearchResponse {
  q: string
  /** Items found across every group. */
  total: number
  groups: SearchGroup[]
}

const querySchema = z.object({
  q: z.string().trim().min(1).max(200),
  /** Comma-separated subset of SEARCH_TYPES. */
  types: z.string().max(300).optional(),
  /** Items returned per group (scenes default 50, others 20). */
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

// ---------------------------------------------------------------- folding

const SPECIAL: Record<string, string> = {
  '’': '\'', '‘': '\'', 'ʼ': '\'', '´': '\'', '`': '\'', '′': '\'',
  '“': '"', '”': '"', '«': '"', '»': '"', '„': '"', '″': '"',
  '–': '-', '—': '-', '‐': '-', '‑': '-',
  'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ı': 'i',
  ' ': ' ', ' ': ' ', ' ': ' ',
}
const SPECIAL_RE = new RegExp(`[${Object.keys(SPECIAL).join('')}]`, 'g')
const MARKS_RE = /\p{M}+/gu
const cache = new Map<string, string>()

function foldChar(ch: string): string {
  const code = ch.charCodeAt(0)
  if (code < 128) return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : ch
  let out = cache.get(ch)
  if (out === undefined) {
    const lower = ch.toLowerCase()
    out = SPECIAL[lower] ?? lower.normalize('NFD').replace(MARKS_RE, '')
    if (/\s/.test(out)) out = ' '
    cache.set(ch, out)
  }
  return out
}

/** Lowercase, without accents, plain quotes and dashes, single spaces: what matching compares. */
export function foldQuick(text: string): string {
  return text.normalize('NFD').replace(MARKS_RE, '').toLowerCase().replace(SPECIAL_RE, ch => SPECIAL[ch]!).replace(/\s+/g, ' ')
}

/** The folded text with, for every folded character, the index of the original character it comes from. */
function foldMapped(text: string): { folded: string, map: number[] } {
  let folded = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const out = foldChar(text[i]!)
    for (const ch of out) {
      folded += ch
      map.push(i)
    }
  }
  return { folded, map }
}

function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = []
  let at = haystack.indexOf(needle)
  while (at >= 0) {
    found.push(at)
    at = haystack.indexOf(needle, at + needle.length)
  }
  return found
}

/** Match ranges in `text` (original indices) for a folded query. */
function ranges(text: string, q: string): [number, number][] {
  const { folded, map } = foldMapped(text)
  return occurrences(folded, q).map(at => [map[at]!, map[at + q.length - 1]! + 1])
}

const BEFORE = 70
const AFTER = 130

/** A passage of `text` around its first match, cut at word boundaries, with the matches inside it. */
function snippetOf(text: string, q: string): { snippet: string, marks: [number, number][], count: number } | null {
  const flat = text.replace(/\s+/g, ' ').trim()
  const found = ranges(flat, q)
  if (!found.length) return null
  const [first] = found[0]!
  let start = Math.max(0, first - BEFORE)
  let end = Math.min(flat.length, first + AFTER)
  if (start > 0) {
    const space = flat.indexOf(' ', start)
    start = space >= 0 && space < first ? space + 1 : start
  }
  if (end < flat.length) {
    const space = flat.lastIndexOf(' ', end)
    end = space > found[0]![1] ? space : end
  }
  const prefix = start > 0 ? '…' : ''
  const suffix = end < flat.length ? '…' : ''
  const shift = prefix.length - start
  const marks = found
    .filter(([a, b]) => a >= start && b <= end)
    .map(([a, b]) => [a + shift, b + shift] as [number, number])
  return { snippet: `${prefix}${flat.slice(start, end)}${suffix}`, marks, count: found.length }
}

// ---------------------------------------------------------------- items

interface Field {
  field: string
  text: string
  section?: string
  question?: string
}

interface Candidate {
  type: SearchType
  id: string
  title: string
  fields: Field[]
  chapterId?: string
  status?: string
  code?: string
}

const plain = (doc: unknown) => richToPlainText(doc as RichDoc | null)

function match(candidate: Candidate, q: string): SearchMatch | null {
  const titleQuick = foldQuick(candidate.title)
  const inTitle = titleQuick.includes(q)
  let count = inTitle ? occurrences(titleQuick, q).length : 0
  let shown: { field: Field, snippet: string, marks: [number, number][] } | null = null
  for (const field of candidate.fields) {
    if (!field.text || !foldQuick(field.text).includes(q)) continue
    const found = snippetOf(field.text, q)
    if (!found) continue
    count += found.count
    shown ??= { field, snippet: found.snippet, marks: found.marks }
  }
  if (!inTitle && !shown) return null
  return {
    type: candidate.type,
    id: candidate.id,
    title: candidate.title,
    titleMarks: inTitle ? ranges(candidate.title, q) : [],
    field: shown?.field.field ?? 'title',
    ...(shown?.field.section ? { section: shown.field.section } : {}),
    ...(shown?.field.question ? { question: shown.field.question } : {}),
    snippet: shown?.snippet ?? '',
    marks: shown?.marks ?? [],
    count: Math.max(count, 1),
    ...(candidate.chapterId ? { chapterId: candidate.chapterId } : {}),
    ...(candidate.status ? { status: candidate.status } : {}),
    ...(candidate.code ? { code: candidate.code } : {}),
  }
}

interface Positioned { position: number, createdAt: Date }
const byPosition = (a: Positioned, b: Positioned) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime()

export default defineEventHandler(async (event): Promise<SearchResponse> => {
  const { project } = await requireProject(event)
  const query = parseQuery(event, querySchema)
  const q = foldQuick(query.q).trim()
  if (!q) return { q: query.q, total: 0, groups: [] }
  const modules = resolveModules(project.kind, project.modules)
  const asked = new Set((query.types?.split(',').map(t => t.trim()).filter(Boolean) ?? SEARCH_TYPES) as SearchType[])
  const wanted = (type: SearchType) => asked.has(type)
    && (type !== 'codex' || modules.codex)
    && (type !== 'variable' || modules.variables)
  const db = useDb()
  const pid = project.id
  const live = (table: any) => and(eq(table.projectId, pid), isNull(table.deletedAt))
  const none = Promise.resolve([] as never[])
  const needScenes = wanted('scene')
  const needChapters = needScenes || wanted('chapter')

  const [parts, chapters, scenes, links, characters, groups, locations, objects, strands, events, notes, codexEntries, variables] = await Promise.all([
    needChapters || wanted('part')
      ? db.select({ id: tables.parts.id, title: tables.parts.title, description: tables.parts.description, position: tables.parts.position, createdAt: tables.parts.createdAt }).from(tables.parts).where(live(tables.parts))
      : none,
    needChapters
      ? db.select({ id: tables.chapters.id, partId: tables.chapters.partId, title: tables.chapters.title, reason: tables.chapters.reason, notes: tables.chapters.notes, position: tables.chapters.position, createdAt: tables.chapters.createdAt }).from(tables.chapters).where(live(tables.chapters))
      : none,
    needScenes
      ? db.select({
          id: tables.scenes.id,
          chapterId: tables.scenes.chapterId,
          code: tables.scenes.code,
          title: tables.scenes.title,
          synopsis: tables.scenes.synopsis,
          notes: tables.scenes.notes,
          status: tables.scenes.status,
          position: tables.scenes.position,
          createdAt: tables.scenes.createdAt,
          text: tables.sceneRevisions.contentText,
        }).from(tables.scenes).leftJoin(tables.sceneRevisions, eq(tables.sceneRevisions.id, tables.scenes.currentRevisionId)).where(live(tables.scenes))
      : none,
    needScenes && modules.branching
      ? db.select({ fromSceneId: tables.sceneLinks.fromSceneId, label: tables.sceneLinks.label }).from(tables.sceneLinks).where(and(live(tables.sceneLinks), ne(tables.sceneLinks.label, ''))).orderBy(asc(tables.sceneLinks.position))
      : none,
    wanted('character') ? db.select().from(tables.characters).where(live(tables.characters)).orderBy(asc(tables.characters.position), asc(tables.characters.createdAt)) : none,
    wanted('group') ? db.select().from(tables.groups).where(live(tables.groups)).orderBy(asc(tables.groups.position), asc(tables.groups.createdAt)) : none,
    wanted('location') ? db.select().from(tables.locations).where(live(tables.locations)).orderBy(asc(tables.locations.position), asc(tables.locations.createdAt)) : none,
    wanted('object') ? db.select().from(tables.objects).where(live(tables.objects)).orderBy(asc(tables.objects.position), asc(tables.objects.createdAt)) : none,
    wanted('strand') ? db.select().from(tables.strands).where(live(tables.strands)).orderBy(asc(tables.strands.position), asc(tables.strands.createdAt)) : none,
    wanted('event') ? db.select().from(tables.events).where(live(tables.events)).orderBy(asc(tables.events.position), asc(tables.events.createdAt)) : none,
    wanted('note') ? db.select().from(tables.notes).where(live(tables.notes)).orderBy(asc(tables.notes.position), asc(tables.notes.createdAt)) : none,
    wanted('codex') ? db.select().from(tables.codexEntries).where(live(tables.codexEntries)).orderBy(asc(tables.codexEntries.position), asc(tables.codexEntries.createdAt)) : none,
    wanted('variable') ? db.select().from(tables.variables).where(live(tables.variables)).orderBy(asc(tables.variables.position), asc(tables.variables.createdAt)) : none,
  ])

  const candidates: Candidate[] = []

  // Scenes and chapters in reading order.
  const partOrder = new Map([...parts].sort(byPosition).map((p, i) => [p.id, i]))
  const orderedChapters = [...chapters].sort((a, b) => {
    const pa = a.partId ? (partOrder.get(a.partId) ?? -1) : -1
    const pb = b.partId ? (partOrder.get(b.partId) ?? -1) : -1
    return pa - pb || byPosition(a, b)
  })
  const chapterIndex = new Map(orderedChapters.map((c, i) => [c.id, i]))
  const choices = new Map<string, string[]>()
  for (const link of links) choices.set(link.fromSceneId, [...(choices.get(link.fromSceneId) ?? []), link.label])
  if (needScenes) {
    const ordered = scenes
      .filter(s => chapterIndex.has(s.chapterId))
      .sort((a, b) => chapterIndex.get(a.chapterId)! - chapterIndex.get(b.chapterId)! || byPosition(a, b))
    for (const scene of ordered) {
      candidates.push({
        type: 'scene',
        id: scene.id,
        title: scene.title,
        chapterId: scene.chapterId,
        status: scene.status,
        code: scene.code,
        fields: [
          { field: 'text', text: scene.text ?? '' },
          { field: 'synopsis', text: scene.synopsis },
          ...(choices.get(scene.id) ?? []).map(text => ({ field: 'choice', text })),
          { field: 'notes', text: plain(scene.notes) },
        ],
      })
    }
  }
  if (wanted('architecture')) {
    for (const pillar of ['premise', 'fabula', 'setting'] as const) {
      candidates.push({ type: 'architecture', id: pillar, title: '', fields: [{ field: 'text', text: plain(project[pillar]) }] })
    }
  }

  const sections = PROFILE_SECTIONS.filter(s => (s.media as readonly string[]).includes(project.kind))
  for (const c of characters) {
    const profile: Field[] = []
    for (const section of sections) {
      const content = c.profile[section.key]
      if (!content) continue
      for (const question of section.questions) {
        const answer = content.answers?.[question]
        if (answer) profile.push({ field: 'profile', text: answer, section: section.key, question })
      }
      if (content.free) profile.push({ field: 'profile', text: plain(content.free), section: section.key })
    }
    candidates.push({
      type: 'character',
      id: c.id,
      title: c.name,
      fields: [
        ...c.aliases.map(text => ({ field: 'alias', text })),
        { field: 'tagline', text: c.tagline },
        { field: 'description', text: plain(c.description) },
        ...profile,
        { field: 'traits', text: [...(c.traits.qualities ?? []), ...(c.traits.flaws ?? []), ...(c.traits.contradictions ?? [])].join(' · ') },
        { field: 'notes', text: plain(c.notes) },
      ],
    })
  }
  for (const g of groups) {
    candidates.push({
      type: 'group',
      id: g.id,
      title: g.name,
      fields: [
        { field: 'description', text: plain(g.description) },
        { field: 'language', text: plain(g.language) },
        { field: 'traditions', text: plain(g.traditions) },
        { field: 'powers', text: plain(g.powers) },
        { field: 'notes', text: plain(g.notes) },
      ],
    })
  }
  for (const l of locations) {
    candidates.push({
      type: 'location',
      id: l.id,
      title: l.name,
      fields: [
        { field: 'place', text: [l.city, l.region, l.nation].filter(Boolean).join(', ') },
        { field: 'kind', text: l.kind },
        { field: 'description', text: plain(l.description) },
        { field: 'notes', text: plain(l.notes) },
      ],
    })
  }
  for (const o of objects) {
    candidates.push({ type: 'object', id: o.id, title: o.name, fields: [{ field: 'kind', text: o.kind }, { field: 'description', text: plain(o.description) }, { field: 'notes', text: plain(o.notes) }] })
  }
  for (const s of strands) {
    candidates.push({
      type: 'strand',
      id: s.id,
      title: s.name,
      fields: [
        { field: 'description', text: plain(s.description) },
        ...(s.quest?.objectives ?? []).map(o => ({ field: 'objective', text: o.text })),
        ...(s.quest?.rewards ?? []).map(r => ({ field: 'reward', text: r.text })),
      ],
    })
  }
  if (wanted('chapter')) {
    for (const c of orderedChapters) {
      candidates.push({ type: 'chapter', id: c.id, title: c.title, fields: [{ field: 'purpose', text: plain(c.reason) }, { field: 'notes', text: plain(c.notes) }] })
    }
  }
  if (wanted('part')) {
    for (const p of [...parts].sort(byPosition)) {
      candidates.push({ type: 'part', id: p.id, title: p.title, fields: [{ field: 'description', text: plain(p.description) }] })
    }
  }
  for (const e of events) {
    candidates.push({ type: 'event', id: e.id, title: e.title, fields: [{ field: 'date', text: e.timeLabel }, { field: 'description', text: plain(e.description) }] })
  }
  for (const n of notes) {
    candidates.push({ type: 'note', id: n.id, title: n.title, fields: [{ field: 'text', text: plain(n.content) }] })
  }
  for (const e of codexEntries) {
    candidates.push({ type: 'codex', id: e.id, title: e.title, fields: [{ field: 'text', text: plain(e.body) }] })
  }
  for (const v of variables) {
    candidates.push({ type: 'variable', id: v.id, title: v.name, fields: [{ field: 'description', text: v.description }] })
  }

  const groupsByType = new Map<SearchType, SearchGroup>()
  for (const candidate of candidates) {
    const found = match(candidate, q)
    if (!found) continue
    let group = groupsByType.get(candidate.type)
    if (!group) {
      group = { type: candidate.type, total: 0, occurrences: 0, items: [] }
      groupsByType.set(candidate.type, group)
    }
    group.total++
    group.occurrences += found.count
    group.items.push(found)
  }

  const result: SearchGroup[] = []
  for (const type of SEARCH_TYPES) {
    const group = groupsByType.get(type)
    if (!group) continue
    // Names first for the world; scenes and chapters keep the reading order.
    if (type !== 'scene' && type !== 'chapter' && type !== 'part' && type !== 'architecture') {
      group.items.sort((a, b) => Number(b.titleMarks.length > 0) - Number(a.titleMarks.length > 0))
    }
    group.items = group.items.slice(0, query.limit ?? (type === 'scene' ? 50 : 20))
    result.push(group)
  }
  return { q: query.q, total: result.reduce((n, g) => n + g.total, 0), groups: result }
})
