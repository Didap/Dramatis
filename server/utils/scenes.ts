import { and, desc, eq, inArray, isNull, sql, sum } from 'drizzle-orm'
import type { RichDoc, RichNode, SceneTags, SnapshotReason } from '../../shared/types/domain'
import { countCharacters, docWordCount, richToPlainText } from '#shared/utils/richtext'
import { tagArrays } from './items'

type SceneRow = typeof tables.scenes.$inferSelect
type RevisionRow = typeof tables.sceneRevisions.$inferSelect

/** A live scene of the project, or 404. */
export async function requireScene(projectId: string, sceneId: string, db: DbOrTx = useDb()): Promise<SceneRow> {
  const [scene] = await db
    .select()
    .from(tables.scenes)
    .where(and(eq(tables.scenes.id, sceneId), eq(tables.scenes.projectId, projectId), isNull(tables.scenes.deletedAt)))
    .limit(1)
  if (!scene) throw createError({ statusCode: 404, message: 'Scene not found' })
  return scene
}

/** The scene's active revision, repairing the pointer (or creating the first revision) if needed. */
export async function currentRevision(scene: SceneRow, db: DbOrTx = useDb()): Promise<RevisionRow> {
  if (scene.currentRevisionId) {
    const [revision] = await db
      .select()
      .from(tables.sceneRevisions)
      .where(and(eq(tables.sceneRevisions.id, scene.currentRevisionId), isNull(tables.sceneRevisions.deletedAt)))
      .limit(1)
    if (revision) return revision
  }
  const [latest] = await db
    .select()
    .from(tables.sceneRevisions)
    .where(and(eq(tables.sceneRevisions.sceneId, scene.id), isNull(tables.sceneRevisions.deletedAt)))
    .orderBy(desc(tables.sceneRevisions.number))
    .limit(1)
  const revision = latest ?? (
    await db
      .insert(tables.sceneRevisions)
      .values({ projectId: scene.projectId, sceneId: scene.id, number: 1, content: null, contentText: '', wordCount: 0 })
      .returning()
  )[0]!
  await db
    .update(tables.scenes)
    .set({ currentRevisionId: revision.id, wordCount: revision.wordCount, charCount: revision.charCount, charCountNoSpaces: revision.charCountNoSpaces })
    .where(eq(tables.scenes.id, scene.id))
  return revision
}

/** Plain text, words and characters of a scene document, computed on the server. */
export function measureDoc(content: RichDoc | null) {
  const contentText = richToPlainText(content)
  const countable = richToPlainText(content, { speakers: false, directions: false })
  return {
    contentText,
    wordCount: docWordCount(content),
    charCount: countCharacters(countable, true),
    charCountNoSpaces: countCharacters(countable, false),
  }
}

/**
 * Records a save's word delta in the writing log (positive = words written, negative = words removed)
 * and the project's total at the time. Only editor saves count.
 */
export async function logWords(projectId: string, day: string, delta: number, db: DbOrTx = useDb()) {
  const [row] = await db
    .select({ words: sum(tables.scenes.wordCount) })
    .from(tables.scenes)
    .where(and(eq(tables.scenes.projectId, projectId), isNull(tables.scenes.deletedAt)))
  const total = Number(row?.words ?? 0)
  const added = Math.max(delta, 0)
  const removed = Math.max(-delta, 0)
  await db
    .insert(tables.writingLog)
    .values({ projectId, day, added, removed, total })
    .onConflictDoUpdate({
      target: [tables.writingLog.projectId, tables.writingLog.day],
      set: {
        added: sql`${tables.writingLog.added} + ${added}`,
        removed: sql`${tables.writingLog.removed} + ${removed}`,
        total,
        updatedAt: new Date(),
      },
    })
}

/**
 * Gives every dialogue line of a scene a stable id derived from the scene code (S014-L003).
 * Lines without an id, with a duplicate id (copy and paste) or with another scene's id get a new one.
 */
export function normalizeLineIds(content: RichDoc | null, code: string, lineCounter: number) {
  if (!content || !code) return { content, lineCounter, changed: false }
  let counter = lineCounter
  let changed = false
  const seen = new Set<string>()
  const prefix = `${code}-L`
  const walk = (node: RichNode): RichNode => {
    if (node.type === 'dialogueLine') {
      const current = typeof node.attrs?.lineId === 'string' ? node.attrs.lineId : ''
      if (current.startsWith(prefix) && !seen.has(current)) {
        seen.add(current)
        return node
      }
      counter++
      const lineId = `${prefix}${String(counter).padStart(3, '0')}`
      seen.add(lineId)
      changed = true
      return { ...node, attrs: { ...node.attrs, lineId } }
    }
    return node.content ? { ...node, content: node.content.map(walk) } : node
  }
  const next = walk(content)
  return { content: changed ? next : content, lineCounter: counter, changed }
}

/** Mentions of characters, places and objects, and dialogue lines per speaker, in a document. */
function countRefs(content: RichDoc | null) {
  const counts = new Map<string, { mentions: number, lines: number }>()
  const bump = (key: string, field: 'mentions' | 'lines') => {
    const entry = counts.get(key) ?? { mentions: 0, lines: 0 }
    entry[field]++
    counts.set(key, entry)
  }
  const walk = (node: RichNode) => {
    if (node.type === 'mention' && typeof node.attrs?.id === 'string') {
      const [type, id] = node.attrs.id.split(':')
      if ((type === 'character' || type === 'location' || type === 'object') && id && isUuid(id)) bump(`${type}:${id}`, 'mentions')
    }
    if (node.type === 'dialogueLine' && typeof node.attrs?.speakerId === 'string' && isUuid(node.attrs.speakerId)) {
      bump(`character:${node.attrs.speakerId}`, 'lines')
    }
    ;(node.content ?? []).forEach(walk)
  }
  if (content) walk(content)
  return counts
}

/**
 * Recomputes the scene's tags from the active text: mentions and dialogue lines spoken, per entity.
 * Manual flags are kept; a tag disappears when it is neither manual nor found in the text.
 * Only entities that exist and are not in the trash count.
 */
export async function recomputeTags(scene: Pick<SceneRow, 'projectId' | 'tags'>, content: RichDoc | null, db: DbOrTx = useDb()) {
  const counts = countRefs(content)
  const byType = { character: [] as string[], location: [] as string[], object: [] as string[] }
  for (const key of counts.keys()) {
    const [type, id] = key.split(':') as ['character' | 'location' | 'object', string]
    byType[type].push(id)
  }
  const live = new Set<string>()
  const tableFor = { character: tables.characters, location: tables.locations, object: tables.objects }
  for (const type of ['character', 'location', 'object'] as const) {
    if (!byType[type].length) continue
    const table = tableFor[type]
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.projectId, scene.projectId), isNull(table.deletedAt), inArray(table.id, byType[type])))
    for (const row of rows) live.add(`${type}:${row.id}`)
  }

  const tags: SceneTags = {}
  for (const [key, info] of Object.entries(scene.tags ?? {})) {
    const found = live.has(key) ? counts.get(key) : undefined
    const entry = { manual: info.manual || undefined, mentions: found?.mentions || undefined, lines: found?.lines || undefined }
    if (entry.manual || entry.mentions || entry.lines) tags[key] = entry
  }
  for (const key of live) {
    if (tags[key]) continue
    const found = counts.get(key)!
    tags[key] = { mentions: found.mentions || undefined, lines: found.lines || undefined }
  }
  const clean = JSON.parse(JSON.stringify(tags)) as SceneTags
  const changed = JSON.stringify(clean) !== JSON.stringify(scene.tags ?? {})
  return { tags: clean, ...tagArrays(clean), changed }
}

/** Retention of the history of a revision: the last 50 states, then one per day. */
const KEEP_RECENT = 50
/** At most one automatic state every few minutes while writing. */
export const SNAPSHOT_MINUTES = 10

/** Keeps a state of a revision in its history (Cronologia). Automatic states are throttled. */
export async function snapshot(revision: RevisionRow, reason: SnapshotReason, db: DbOrTx = useDb()) {
  if (!revision.content) return
  if (reason === 'auto') {
    const [last] = await db
      .select({ createdAt: tables.sceneSnapshots.createdAt })
      .from(tables.sceneSnapshots)
      .where(eq(tables.sceneSnapshots.revisionId, revision.id))
      .orderBy(desc(tables.sceneSnapshots.createdAt))
      .limit(1)
    if (last && Date.now() - last.createdAt.getTime() < SNAPSHOT_MINUTES * 60_000) return
  }
  await db.insert(tables.sceneSnapshots).values({
    projectId: revision.projectId,
    sceneId: revision.sceneId,
    revisionId: revision.id,
    content: revision.content,
    wordCount: revision.wordCount,
    reason,
  })
  // Beyond the most recent ones, keep the newest state of each day.
  await db.execute(sql`delete from scene_snapshots s where s.revision_id = ${revision.id}
    and s.id not in (select id from scene_snapshots where revision_id = ${revision.id} order by created_at desc limit ${KEEP_RECENT})
    and s.id not in (select distinct on (date_trunc('day', created_at)) id from scene_snapshots where revision_id = ${revision.id} order by date_trunc('day', created_at), created_at desc)`)
}

/** Makes a revision the active one: counts, tags and pointer follow (no writing-log entry). */
export async function activateRevision(scene: SceneRow, revision: RevisionRow, db: DbOrTx = useDb()) {
  const tags = await recomputeTags(scene, revision.content, db)
  const [updated] = await db
    .update(tables.scenes)
    .set({
      currentRevisionId: revision.id,
      wordCount: revision.wordCount,
      charCount: revision.charCount,
      charCountNoSpaces: revision.charCountNoSpaces,
      tags: tags.tags,
      characterIds: tags.characterIds,
      locationIds: tags.locationIds,
      objectIds: tags.objectIds,
    })
    .where(eq(tables.scenes.id, scene.id))
    .returning()
  return updated!
}

export function toRevisionInfo(revision: RevisionRow) {
  const { content: _content, contentText: _text, ...info } = revision
  return JSON.parse(JSON.stringify(info)) as Omit<RevisionRow, 'content' | 'contentText' | 'createdAt' | 'updatedAt' | 'deletedAt'> & { createdAt: string, updatedAt: string, deletedAt: string | null }
}
