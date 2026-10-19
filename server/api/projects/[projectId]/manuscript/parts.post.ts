import { and, asc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import enCopy from '../../../../../i18n/locales/en/manuscript.json'
import itCopy from '../../../../../i18n/locales/it/manuscript.json'

const schema = z.object({ enabled: z.boolean() })

/** The chapter's part before parts were turned off, kept in its meta so turning them on can rebuild it. */
const MEMORY = 'lastPartId'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What the plans read of a chapter and of a part (database rows fit). */
export interface ChapterLike {
  id: string
  partId: string | null
  position: number
  createdAt: Date
  deletedAt: Date | null
  meta: Record<string, unknown>
}
export interface PartLike {
  id: string
  position: number
  createdAt: Date
  deletedAt: Date | null
}

/** Where a chapter goes: its part, its position (kept when missing) and its meta. */
export interface ChapterChange {
  id: string
  partId: string | null
  position?: number
  meta: Record<string, unknown>
}

const byPosition = (a: { position: number, createdAt: Date }, b: { position: number, createdAt: Date }) =>
  a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime()

/** Chapters in reading order, as the workspace shows them: outside any part first, then part by part. */
export function readingOrder<C extends Pick<ChapterLike, 'partId' | 'position' | 'createdAt'>>(chapters: C[], liveParts: PartLike[]): C[] {
  const partOrder = new Map([...liveParts].sort(byPosition).map((p, i) => [p.id, i]))
  return [...chapters].sort((a, b) => {
    const pa = a.partId ? (partOrder.get(a.partId) ?? -1) : -1
    const pb = b.partId ? (partOrder.get(b.partId) ?? -1) : -1
    return pa - pb || byPosition(a, b)
  })
}

/** The part a chapter remembers from the last time parts were turned off. */
function remembered(chapter: Pick<ChapterLike, 'meta'>): string | null {
  const value = chapter.meta[MEMORY]
  return typeof value === 'string' && UUID.test(value) ? value : null
}

function forget(meta: Record<string, unknown>): Record<string, unknown> {
  const { [MEMORY]: _forget, ...rest } = meta
  return rest
}

/**
 * Parts off. The live chapters keep their reading order, leave their part and remember it. The
 * chapters in the trash leave theirs too, so restoring one while parts are off brings back no part;
 * those that went to the trash together with their part stay with it, so restoring that part still
 * brings them back.
 */
export function planPartsOff(chapters: ChapterLike[], parts: PartLike[]): ChapterChange[] {
  const partById = new Map(parts.map(p => [p.id, p]))
  const live = readingOrder(chapters.filter(c => !c.deletedAt), parts.filter(p => !p.deletedAt))
  const changes: ChapterChange[] = live.map((chapter, position) => ({
    id: chapter.id,
    partId: null,
    position,
    meta: chapter.partId ? { ...chapter.meta, [MEMORY]: chapter.partId } : { ...chapter.meta },
  }))
  for (const chapter of chapters) {
    if (!chapter.deletedAt || !chapter.partId) continue
    const part = partById.get(chapter.partId)
    if (part?.deletedAt && part.deletedAt.getTime() === chapter.deletedAt.getTime()) continue
    changes.push({ id: chapter.id, partId: null, meta: { ...chapter.meta, [MEMORY]: chapter.partId } })
  }
  return changes
}

/**
 * Parts on, once the parts are back (`liveParts`, in order, at least one). `ordered` are the live
 * chapters in their reading order from before; `existing` every part of the project, live or in the
 * trash. A live chapter goes back into the part it remembers; one without a live part of its own
 * follows the chapter before it, or opens the first part. A chapter in the trash goes back to the
 * part it remembers when that part still exists (if it is in the trash, a restore finds the place
 * gone and uses "Ripristinati", as for any other item); one that never had a part follows the live
 * chapter that came before it.
 */
export function planPartsOn(ordered: ChapterLike[], trashed: ChapterLike[], liveParts: PartLike[], existing: ReadonlySet<string>): ChapterChange[] {
  const alive = new Set(liveParts.map(p => p.id))
  const changes: ChapterChange[] = []
  const next = new Map<string, number>()
  // Where each live chapter lands, by its position before, for the trashed chapters to follow.
  const landed: { position: number, partId: string }[] = []
  let current = liveParts[0]!.id
  for (const chapter of ordered) {
    const memory = remembered(chapter) ?? chapter.partId
    if (memory && alive.has(memory)) current = memory
    const position = next.get(current) ?? 0
    next.set(current, position + 1)
    changes.push({ id: chapter.id, partId: current, position, meta: forget(chapter.meta) })
    landed.push({ position: chapter.position, partId: current })
  }
  for (const chapter of trashed) {
    const memory = remembered(chapter)
    if (memory && existing.has(memory)) {
      changes.push({ id: chapter.id, partId: memory, meta: forget(chapter.meta) })
    }
    else if (!chapter.partId) {
      const before = landed.filter(l => l.position <= chapter.position).at(-1)
      changes.push({ id: chapter.id, partId: before?.partId ?? liveParts[0]!.id, meta: forget(chapter.meta) })
    }
    else if (chapter.meta[MEMORY] !== undefined) {
      changes.push({ id: chapter.id, partId: chapter.partId, meta: forget(chapter.meta) })
    }
  }
  return changes
}

function firstPartTitle(kind: string, locale: string): string {
  const copy = (locale === 'en' ? enCopy : itCopy).manuscript.defaults
  return kind === 'game' ? copy.gamePart.replace('{n}', 'I') : copy.novelPartOrdinal['1']
}

/**
 * Turns the parts (acts) of the manuscript on or off (spec 7.15).
 * Off: the chapters keep their reading order and remember their part; the parts go to the trash in
 * one batch. On: the chapters go back into the parts they remember (brought back from the trash with
 * their batch); the first time, every chapter goes into a new "Parte prima" ("Atto I" in a game).
 * Chapters in the trash follow along (planPartsOff, planPartsOn), so restoring one later puts it in
 * the right place. Answers with the project and the live parts and chapters.
 */
export default defineEventHandler(async (event) => {
  const { user, project } = await requireProject(event)
  const { enabled } = await parseBody(event, schema)

  return useDb().transaction(async (tx) => {
    const ofProject = eq(tables.chapters.projectId, project.id)
    const liveChapters = and(ofProject, isNull(tables.chapters.deletedAt))
    const liveParts = and(eq(tables.parts.projectId, project.id), isNull(tables.parts.deletedAt))
    const chapters = await tx.select().from(tables.chapters).where(ofProject)
    const allParts = await tx.select().from(tables.parts).where(eq(tables.parts.projectId, project.id))
    let parts = allParts.filter(p => !p.deletedAt)
    let changes: ChapterChange[]

    if (!enabled) {
      changes = planPartsOff(chapters, allParts)
      if (parts.length) await tx.update(tables.parts).set({ deletedAt: new Date() }).where(liveParts)
    }
    else {
      const ordered = readingOrder(chapters.filter(c => !c.deletedAt), parts)
      // The parts the chapters remember: still alive, or in the trash with the batch that took them away.
      const wanted = new Set(ordered.map(c => remembered(c) ?? c.partId).filter((id): id is string => !!id))
      const batches = [...new Set(allParts.filter(p => p.deletedAt && wanted.has(p.id)).map(p => p.deletedAt!.getTime()))]
      for (const time of batches) {
        await tx
          .update(tables.parts)
          .set({ deletedAt: null })
          .where(and(eq(tables.parts.projectId, project.id), eq(tables.parts.deletedAt, new Date(time))))
      }
      parts = await tx.select().from(tables.parts).where(liveParts).orderBy(asc(tables.parts.position), asc(tables.parts.createdAt))

      if (!parts.length) {
        const [part] = await tx
          .insert(tables.parts)
          .values({ projectId: project.id, title: firstPartTitle(project.kind, user.locale), position: 0 })
          .returning()
        parts = [part!]
      }
      const existing = new Set([...allParts, ...parts].map(p => p.id))
      changes = planPartsOn(ordered, chapters.filter(c => c.deletedAt), parts, existing)
    }

    for (const change of changes) {
      await tx
        .update(tables.chapters)
        .set({ partId: change.partId, meta: change.meta, ...(change.position === undefined ? {} : { position: change.position }) })
        .where(eq(tables.chapters.id, change.id))
    }

    const [row] = await tx
      .update(tables.projects)
      .set({ settings: { ...project.settings, parts: enabled }, updatedAt: new Date() })
      .where(eq(tables.projects.id, project.id))
      .returning()

    return JSON.parse(JSON.stringify({
      project: row,
      parts: await tx.select().from(tables.parts).where(liveParts).orderBy(asc(tables.parts.position), asc(tables.parts.createdAt)),
      chapters: await tx.select().from(tables.chapters).where(liveChapters).orderBy(asc(tables.chapters.position), asc(tables.chapters.createdAt)),
    }))
  })
})
