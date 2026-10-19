import { and, desc, eq, isNotNull } from 'drizzle-orm'
import type { Collection } from '../../../../../shared/types/domain'
import { TRASHABLE_COLLECTIONS } from '#shared/utils/constants'

export type TrashCollection = Collection | 'revisions'

export interface TrashItem {
  collection: TrashCollection
  id: string
  title: string
  deletedAt: string
  /** The container the item belongs to (a scene's chapter, a revision's scene...). */
  parent?: { collection: TrashCollection, id: string, title: string }
  /** true when the item left together with its parent, in the same batch. */
  withParent?: boolean
  /** A readable line for items without a title: "Anna, Marco" (relationship), "Teresa" (image), "Il molo, La barca" (choice). */
  detail?: string
  /** A relationship's kind (for its label). */
  kind?: string
  /** What a relationship or a choice connects, by name: source and target, or from scene and to scene. */
  ends?: { from: string, to: string }
}

const TITLE: Partial<Record<TrashCollection, string>> = {
  characters: 'name',
  groups: 'name',
  locations: 'name',
  objects: 'name',
  strands: 'name',
  variables: 'name',
  maps: 'name',
  codexCategories: 'name',
}

const PARENT: Partial<Record<TrashCollection, { column: string, collection: TrashCollection }>> = {
  chapters: { column: 'partId', collection: 'parts' },
  scenes: { column: 'chapterId', collection: 'chapters' },
  codexEntries: { column: 'categoryId', collection: 'codexCategories' },
  revisions: { column: 'sceneId', collection: 'scenes' },
}

/** Everything in the trash, newest first, with the batch structure (what left together). */
export default defineEventHandler(async (event): Promise<TrashItem[]> => {
  const { project } = await requireProject(event)
  const db = useDb()
  const items: TrashItem[] = []
  const titles = new Map<string, string>()
  const stamps = new Map<string, number>()
  const sources: [TrashCollection, any][] = [...TRASHABLE_COLLECTIONS.map(c => [c, tableOf(c)] as [TrashCollection, any]), ['revisions', tables.sceneRevisions]]

  for (const [collection, table] of sources) {
    const rows: any[] = await db
      .select()
      .from(table)
      .where(and(eq(table.projectId, project.id), isNotNull(table.deletedAt)))
      .orderBy(desc(table.deletedAt))
    for (const row of rows) {
      const title = collection === 'images' ? row.caption : collection === 'relations' ? row.label : collection === 'links' ? row.label : collection === 'revisions' ? row.label : row[TITLE[collection] ?? 'title'] ?? ''
      stamps.set(`${collection}:${row.id}`, row.deletedAt.getTime())
      const item: TrashItem = { collection, id: row.id, title, deletedAt: row.deletedAt.toISOString() }
      const parent = PARENT[collection]
      if (parent && row[parent.column]) item.parent = { collection: parent.collection, id: row[parent.column], title: '' }
      items.push(item)
    }
  }

  // Titles of live parents too (a trashed scene of a live chapter).
  for (const [collection, table] of [['parts', tables.parts], ['chapters', tables.chapters], ['scenes', tables.scenes], ['codexCategories', tables.codexCategories]] as const) {
    const rows: any[] = await db.select().from(table).where(eq(table.projectId, project.id))
    for (const row of rows) titles.set(`${collection}:${row.id}`, row.title ?? row.name ?? '')
  }
  for (const item of items) {
    if (!item.parent) continue
    item.parent.title = titles.get(`${item.parent.collection}:${item.parent.id}`) ?? ''
    item.withParent = stamps.get(`${item.parent.collection}:${item.parent.id}`) === new Date(item.deletedAt).getTime()
  }
  // Names of what relationships, images and choices connect, for a readable trash line.
  const names = new Map<string, string>()
  for (const [type, table] of [['character', tables.characters], ['group', tables.groups], ['location', tables.locations], ['object', tables.objects]] as const) {
    const rows: any[] = await db.select({ id: table.id, name: table.name }).from(table).where(eq(table.projectId, project.id))
    for (const row of rows) names.set(`${type}:${row.id}`, row.name)
  }
  const entries: any[] = await db.select({ id: tables.codexEntries.id, title: tables.codexEntries.title }).from(tables.codexEntries).where(eq(tables.codexEntries.projectId, project.id))
  for (const row of entries) names.set(`codex:${row.id}`, row.title)
  const scenes: any[] = await db.select({ id: tables.scenes.id, title: tables.scenes.title, code: tables.scenes.code }).from(tables.scenes).where(eq(tables.scenes.projectId, project.id))
  for (const row of scenes) names.set(`scene:${row.id}`, row.title || row.code)

  const details = new Map<string, string>()
  const extras = new Map<string, Pick<TrashItem, 'kind' | 'ends'>>()
  const relationRows: any[] = await db.select().from(tables.relations).where(and(eq(tables.relations.projectId, project.id), isNotNull(tables.relations.deletedAt)))
  for (const r of relationRows) {
    const ends = { from: names.get(`${r.sourceType}:${r.sourceId}`) ?? '', to: names.get(`${r.targetType}:${r.targetId}`) ?? '' }
    details.set(`relations:${r.id}`, [ends.from, ends.to].filter(Boolean).join(', '))
    extras.set(`relations:${r.id}`, { kind: r.kind, ends })
  }
  const imageRows: any[] = await db.select().from(tables.images).where(and(eq(tables.images.projectId, project.id), isNotNull(tables.images.deletedAt)))
  for (const i of imageRows) details.set(`images:${i.id}`, names.get(`${i.ownerType}:${i.ownerId}`) ?? '')
  const linkRows: any[] = await db.select().from(tables.sceneLinks).where(and(eq(tables.sceneLinks.projectId, project.id), isNotNull(tables.sceneLinks.deletedAt)))
  for (const l of linkRows) {
    const ends = { from: names.get(`scene:${l.fromSceneId}`) ?? '', to: names.get(`scene:${l.toSceneId}`) ?? '' }
    details.set(`links:${l.id}`, [ends.from, ends.to].filter(Boolean).join(', '))
    extras.set(`links:${l.id}`, { ends })
  }
  for (const item of items) {
    const key = `${item.collection}:${item.id}`
    const detail = details.get(key)
    if (detail) item.detail = detail
    Object.assign(item, extras.get(key))
  }

  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
})
