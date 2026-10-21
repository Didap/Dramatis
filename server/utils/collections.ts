import { and, eq, inArray, isNull, max, sql } from 'drizzle-orm'
import type { Collection, RefType } from '../../shared/types/domain'
import { COLLECTIONS, COLLECTION_TO_REF, REF_TO_COLLECTION, TRASHABLE_COLLECTIONS } from '#shared/utils/constants'

/*
 * The registry of project-owned collections behind the generic API:
 *   POST   /api/projects/:projectId/:collection        create
 *   PATCH  /api/projects/:projectId/:collection/:id    update
 *   DELETE /api/projects/:projectId/:collection/:id    to the trash
 * Every handler checks that the project belongs to the user and that every id an item
 * points to belongs to the same project.
 */

export const collectionTables = {
  characters: tables.characters,
  groups: tables.groups,
  locations: tables.locations,
  objects: tables.objects,
  images: tables.images,
  strands: tables.strands,
  parts: tables.parts,
  chapters: tables.chapters,
  scenes: tables.scenes,
  links: tables.sceneLinks,
  variables: tables.variables,
  relations: tables.relations,
  maps: tables.maps,
  events: tables.events,
  notes: tables.notes,
  codexCategories: tables.codexCategories,
  codexEntries: tables.codexEntries,
} as const

export function isCollection(value: unknown): value is Collection {
  return typeof value === 'string' && (COLLECTIONS as readonly string[]).includes(value)
}

export function isTrashable(collection: Collection): boolean {
  return (TRASHABLE_COLLECTIONS as readonly string[]).includes(collection)
}

// Drizzle's generics do not survive a lookup table; the registry works on this loose shape.
type AnyTable = any

export function tableOf(collection: Collection): AnyTable {
  return collectionTables[collection]
}

/** A set of ids that must all exist (not trashed, unless allowTrashed) in a collection of the project. */
export interface RefCheck {
  collection: Collection
  ids: readonly (string | null | undefined)[]
  /** Accept items in the trash too (links that are only hidden while their target is trashed). */
  allowTrashed?: boolean
}

/** Answers 400 when any id does not belong to the project (or is in the trash). */
export async function assertRefs(projectId: string, checks: RefCheck[], db: DbOrTx = useDb()) {
  for (const check of checks) {
    const ids = [...new Set(check.ids.filter((id): id is string => !!id))]
    if (!ids.length) continue
    const table = tableOf(check.collection)
    const conditions = [eq(table.projectId, projectId), inArray(table.id, ids)]
    if (!check.allowTrashed) conditions.push(isNull(table.deletedAt))
    const rows: { id: string }[] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(...conditions))
    if (rows.length !== ids.length) {
      throw createError({ statusCode: 400, message: `Unknown ${check.collection} reference` })
    }
  }
}

/** Answers 400 when a media id is not owned by the user. */
export async function assertMedia(userId: string, ids: readonly (string | null | undefined)[], db: DbOrTx = useDb()) {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))]
  if (!wanted.length) return
  const rows = await db
    .select({ id: tables.media.id })
    .from(tables.media)
    .where(and(eq(tables.media.ownerId, userId), inArray(tables.media.id, wanted)))
  if (rows.length !== wanted.length) throw createError({ statusCode: 400, message: 'Unknown image' })
}

function refsByType(refs: readonly { type: string, id: string }[] | undefined): RefCheck[] {
  if (!refs?.length) return []
  const byCollection = new Map<Collection, string[]>()
  for (const ref of refs) {
    const collection = (REF_TO_COLLECTION as Record<string, Collection>)[ref.type]
    if (!collection) throw createError({ statusCode: 400, message: `Unknown reference type ${ref.type}` })
    byCollection.set(collection, [...(byCollection.get(collection) ?? []), ref.id])
  }
  return [...byCollection].map(([collection, ids]) => ({ collection, ids }))
}

/** The references an incoming item points to, per collection. */
export function referencesOf(collection: Collection, data: Record<string, any>): { refs: RefCheck[], media: (string | null | undefined)[] } {
  switch (collection) {
    case 'images':
      return {
        refs: data.ownerType && data.ownerId ? refsByType([{ type: data.ownerType, id: data.ownerId }]) : [],
        media: [data.mediaId],
      }
    case 'locations':
      return { refs: [{ collection: 'locations', ids: [data.parentId] }], media: [] }
    case 'strands':
      return {
        refs: [
          // A trashed giver, arc character or place stays linked (hidden until it is restored).
          { collection: 'characters', ids: [data.characterId, data.quest?.giverId], allowTrashed: true },
          { collection: 'locations', ids: [data.quest?.locationId], allowTrashed: true },
          { collection: 'scenes', ids: (data.quest?.objectives ?? []).map((o: { sceneId?: string | null }) => o.sceneId), allowTrashed: true },
          { collection: 'objects', ids: (data.quest?.rewards ?? []).map((r: { objectId?: string | null }) => r.objectId), allowTrashed: true },
        ],
        media: [],
      }
    case 'chapters':
      return { refs: [{ collection: 'parts', ids: [data.partId] }], media: [] }
    case 'scenes': {
      const manual = (data.manualTags ?? []) as { type: string, id: string }[]
      return {
        refs: [
          { collection: 'chapters', ids: [data.chapterId] },
          { collection: 'characters', ids: [data.povCharacterId, ...manual.filter(t => t.type === 'character').map(t => t.id)] },
          { collection: 'locations', ids: manual.filter(t => t.type === 'location').map(t => t.id) },
          { collection: 'objects', ids: manual.filter(t => t.type === 'object').map(t => t.id) },
          { collection: 'strands', ids: data.strandIds ?? [] },
        ],
        media: [],
      }
    }
    case 'links':
      return {
        refs: [
          { collection: 'scenes', ids: [data.fromSceneId, data.toSceneId] },
          {
            collection: 'variables',
            ids: [
              ...((data.conditions?.clauses ?? []) as { variableId: string }[]).map(c => c.variableId),
              ...((data.effects ?? []) as { variableId: string }[]).map(e => e.variableId),
            ],
          },
        ],
        media: [],
      }
    case 'relations':
      return {
        refs: refsByType(
          [
            data.sourceType && data.sourceId ? { type: data.sourceType, id: data.sourceId } : null,
            data.targetType && data.targetId ? { type: data.targetType, id: data.targetId } : null,
          ].filter((r): r is { type: string, id: string } => !!r),
        ).concat([
          // A step keeps its trashed chapter (it shows again when the chapter is restored).
          { collection: 'chapters', ids: ((data.evolution ?? []) as { chapterId: string | null }[]).map(s => s.chapterId), allowTrashed: true },
        ]),
        media: [],
      }
    case 'events':
    case 'notes':
      return { refs: refsByType(data.refs), media: [] }
    case 'codexEntries':
      return { refs: [{ collection: 'codexCategories', ids: [data.categoryId] }], media: [] }
    default:
      return { refs: [], media: [] }
  }
}

/** Columns that scope sibling ordering, for automatic positions. */
const POSITION_SCOPE: Partial<Record<Collection, readonly string[]>> = {
  chapters: ['partId'],
  scenes: ['chapterId'],
  links: ['fromSceneId'],
  characters: ['importance'],
  images: ['ownerType', 'ownerId'],
  codexEntries: ['categoryId'],
}

/** The next free position among the siblings of a new item. */
export async function nextPosition(projectId: string, collection: Collection, data: Record<string, any>, db: DbOrTx = useDb()) {
  const table = tableOf(collection)
  if (!table.position) return 0
  const conditions = [eq(table.projectId, projectId), isNull(table.deletedAt)]
  for (const scope of POSITION_SCOPE[collection] ?? []) {
    const value = data[scope] ?? null
    conditions.push(value === null ? isNull(table[scope]) : eq(table[scope], value))
  }
  const [row] = await db
    .select({ value: max(table.position) })
    .from(table)
    .where(and(...conditions))
  return row?.value == null ? 0 : Number(row.value) + 1
}

/** Prevents a location from containing itself through its ancestors. */
export async function assertNoLocationCycle(projectId: string, id: string, parentId: string | null | undefined, db: DbOrTx = useDb()) {
  if (!parentId) return
  if (parentId === id) throw createError({ statusCode: 400, message: 'A location cannot contain itself' })
  const rows = await db
    .select({ id: tables.locations.id, parentId: tables.locations.parentId })
    .from(tables.locations)
    .where(eq(tables.locations.projectId, projectId))
  const parentOf = new Map(rows.map(r => [r.id, r.parentId]))
  let cursor: string | null | undefined = parentId
  const seen = new Set<string>()
  while (cursor) {
    if (cursor === id) throw createError({ statusCode: 400, message: 'A location cannot contain itself' })
    if (seen.has(cursor)) break
    seen.add(cursor)
    cursor = parentOf.get(cursor) ?? null
  }
}

/** Items trashed together with another (the trash batch), by collection. */
export type TrashCascade = Partial<Record<Collection, string[]>>

const IMAGE_OWNERS: Partial<Record<Collection, 'character' | 'group' | 'location' | 'object' | 'codex'>> = {
  characters: 'character',
  groups: 'group',
  locations: 'location',
  objects: 'object',
  codexEntries: 'codex',
}

/**
 * Moves an item to the trash with what belongs to it, all with the same deletedAt (the batch):
 * a part with its chapters and their scenes, a chapter with its scenes, a codex category with its
 * entries, an entity with its images. Relationships and tags of a trashed entity are only hidden.
 */
export async function trashItem(projectId: string, collection: Collection, id: string, db: DbOrTx = useDb()) {
  const now = new Date()
  const table = tableOf(collection)
  const cascade: TrashCascade = {}
  const [row] = await db
    .update(table)
    .set({ deletedAt: now })
    .where(and(eq(table.id, id), eq(table.projectId, projectId), isNull(table.deletedAt)))
    .returning({ id: table.id })
  if (!row) throw createError({ statusCode: 404, message: 'Not found' })

  const add = (key: Collection, ids: string[]) => {
    if (ids.length) cascade[key] = [...(cascade[key] ?? []), ...ids]
  }

  let chapterIds: string[] = []
  if (collection === 'parts') {
    const chapters = await db
      .update(tables.chapters)
      .set({ deletedAt: now })
      .where(and(eq(tables.chapters.partId, id), isNull(tables.chapters.deletedAt)))
      .returning({ id: tables.chapters.id })
    chapterIds = chapters.map(c => c.id)
    add('chapters', chapterIds)
  }
  if (collection === 'chapters') chapterIds = [id]
  if (chapterIds.length) {
    const scenes = await db
      .update(tables.scenes)
      .set({ deletedAt: now })
      .where(and(inArray(tables.scenes.chapterId, chapterIds), isNull(tables.scenes.deletedAt)))
      .returning({ id: tables.scenes.id })
    add('scenes', scenes.map(s => s.id))
  }

  let entryIds: string[] = []
  if (collection === 'codexCategories') {
    const entries = await db
      .update(tables.codexEntries)
      .set({ deletedAt: now })
      .where(and(eq(tables.codexEntries.categoryId, id), isNull(tables.codexEntries.deletedAt)))
      .returning({ id: tables.codexEntries.id })
    entryIds = entries.map(e => e.id)
    add('codexEntries', entryIds)
  }

  const ownerType = collection === 'codexCategories' ? 'codex' : IMAGE_OWNERS[collection]
  const ownerIds = collection === 'codexCategories' ? entryIds : ownerType ? [id] : []
  if (ownerType && ownerIds.length) {
    const images = await db
      .update(tables.images)
      .set({ deletedAt: now })
      .where(and(eq(tables.images.projectId, projectId), eq(tables.images.ownerType, ownerType), inArray(tables.images.ownerId, ownerIds), isNull(tables.images.deletedAt)))
      .returning({ id: tables.images.id })
    add('images', images.map(i => i.id))
  }

  return { id, deletedAt: now.toISOString(), cascade }
}

/** A container named "Ripristinati" / "Restored" for items whose place is gone, created on demand. */
async function restoredContainer(projectId: string, kind: 'chapters' | 'parts' | 'codexCategories', db: DbOrTx): Promise<string> {
  const [project] = await db
    .select({ ownerId: tables.projects.ownerId, settings: tables.projects.settings, kind: tables.projects.kind })
    .from(tables.projects)
    .where(eq(tables.projects.id, projectId))
  const [owner] = await db.select({ locale: tables.users.locale }).from(tables.users).where(eq(tables.users.id, project!.ownerId))
  const name = owner?.locale === 'en' ? 'Restored' : 'Ripristinati'
  const table = tableOf(kind)
  const nameColumn = kind === 'codexCategories' ? table.name : table.title
  const [existing] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.projectId, projectId), isNull(table.deletedAt), eq(nameColumn, name)))
    .limit(1)
  if (existing) return existing.id as string
  const values: Record<string, unknown> = { projectId }
  if (kind === 'codexCategories') values.name = name
  else values.title = name
  if (kind === 'chapters' && usesParts(project!)) values.partId = await restoredContainer(projectId, 'parts', db)
  values.position = await nextPosition(projectId, kind, values, db)
  const [row] = await db.insert(table).values(values).returning({ id: table.id })
  return row!.id as string
}

/** Whether a project organises chapters in parts (acts): the setting, or by default games yes and novels no. */
export function usesParts(project: { kind: string, settings: { parts?: boolean } }): boolean {
  return project.settings.parts ?? project.kind === 'game'
}

/**
 * Brings an item back from the trash with its batch. When its place is gone (the chapter of a scene,
 * the part of a chapter, the category of an entry is trashed or deleted), it goes to a "Ripristinati" container.
 */
export async function restoreItem(projectId: string, collection: Collection, id: string, db: DbOrTx = useDb()) {
  const table = tableOf(collection)
  const [item]: any[] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.projectId, projectId)))
    .limit(1)
  if (!item?.deletedAt) throw createError({ statusCode: 404, message: 'Not in the trash' })
  const stamp: Date = item.deletedAt
  const patch: Record<string, unknown> = { deletedAt: null }

  if (collection === 'scenes') {
    const [chapter] = await db.select({ deletedAt: tables.chapters.deletedAt }).from(tables.chapters).where(eq(tables.chapters.id, item.chapterId))
    if (!chapter || chapter.deletedAt) {
      patch.chapterId = await restoredContainer(projectId, 'chapters', db)
      patch.position = await nextPosition(projectId, 'scenes', { chapterId: patch.chapterId }, db)
    }
  }
  if (collection === 'chapters' && item.partId) {
    const [part] = await db.select({ deletedAt: tables.parts.deletedAt }).from(tables.parts).where(eq(tables.parts.id, item.partId))
    if (!part || part.deletedAt) patch.partId = await restoredContainer(projectId, 'parts', db)
  }
  if (collection === 'codexEntries') {
    const [category] = await db.select({ deletedAt: tables.codexCategories.deletedAt }).from(tables.codexCategories).where(eq(tables.codexCategories.id, item.categoryId))
    if (!category || category.deletedAt) patch.categoryId = await restoredContainer(projectId, 'codexCategories', db)
  }
  if (collection === 'variables') {
    // A live variable may have taken the name meanwhile.
    const [clash] = await db
      .select({ id: tables.variables.id })
      .from(tables.variables)
      .where(and(eq(tables.variables.projectId, projectId), eq(tables.variables.name, item.name), isNull(tables.variables.deletedAt)))
      .limit(1)
    if (clash) patch.name = `${item.name.slice(0, 37)}_2`
  }

  await db.update(table).set(patch).where(eq(table.id, id))

  // The rest of the batch.
  let chapterIds: string[] = []
  if (collection === 'parts') {
    const chapters = await db
      .update(tables.chapters)
      .set({ deletedAt: null })
      .where(and(eq(tables.chapters.partId, id), eq(tables.chapters.deletedAt, stamp)))
      .returning({ id: tables.chapters.id })
    chapterIds = chapters.map(c => c.id)
  }
  if (collection === 'chapters') chapterIds = [id]
  if (chapterIds.length) {
    await db
      .update(tables.scenes)
      .set({ deletedAt: null })
      .where(and(inArray(tables.scenes.chapterId, chapterIds), eq(tables.scenes.deletedAt, stamp)))
  }
  let entryIds: string[] = []
  if (collection === 'codexCategories') {
    const entries = await db
      .update(tables.codexEntries)
      .set({ deletedAt: null })
      .where(and(eq(tables.codexEntries.categoryId, id), eq(tables.codexEntries.deletedAt, stamp)))
      .returning({ id: tables.codexEntries.id })
    entryIds = entries.map(e => e.id)
  }
  const ownerIds = collection === 'codexCategories' ? entryIds : IMAGE_OWNERS[collection] ? [id] : []
  if (ownerIds.length) {
    await db
      .update(tables.images)
      .set({ deletedAt: null })
      .where(and(eq(tables.images.projectId, projectId), inArray(tables.images.ownerId, ownerIds), eq(tables.images.deletedAt, stamp)))
  }
}

/** Removes a deleted state variable from every condition and effect that used it. */
export async function forgetVariable(projectId: string, variableId: string, db: DbOrTx = useDb()) {
  await db.execute(sql`update scene_links set
      conditions = jsonb_set(conditions, '{clauses}', (select coalesce(jsonb_agg(c), '[]'::jsonb) from jsonb_array_elements(conditions->'clauses') c where c->>'variableId' <> ${variableId})),
      effects = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(effects) e where e->>'variableId' <> ${variableId})
    where project_id = ${projectId} and (conditions::text like ${`%${variableId}%`} or effects::text like ${`%${variableId}%`})`)
}

/** The steps of a relationship's evolution lose a chapter deleted for good, and keep their intensity and note. */
async function forgetChapters(projectId: string, ids: string[], db: DbOrTx) {
  for (const id of ids) {
    await db.execute(sql`update relations set evolution = (select coalesce(jsonb_agg(case when s->>'chapterId' = ${id} then jsonb_set(s, '{chapterId}', 'null'::jsonb) else s end), '[]'::jsonb) from jsonb_array_elements(evolution) s)
      where project_id = ${projectId} and evolution::text like ${`%${id}%`}`)
  }
}

/**
 * Deletes an item for good, with its batch, and removes every reference to it so nothing points to a
 * ghost. Foreign keys already cascade (scenes of a chapter, revisions and links of a scene, entries of a
 * category) or set null (POV character, a chapter's part, an arc's character); this handles arrays and jsonb.
 */
export async function purgeItem(projectId: string, collection: Collection, id: string, db: DbOrTx = useDb()) {
  const table = tableOf(collection)
  const ref = (COLLECTION_TO_REF as Partial<Record<Collection, RefType>>)[collection]
  const [item]: any[] = await db.select().from(table).where(and(eq(table.id, id), eq(table.projectId, projectId))).limit(1)
  if (!item) throw createError({ statusCode: 404, message: 'Not found' })

  if (collection === 'parts' && item.deletedAt) {
    // Chapters trashed with the part go with it; the others just leave the part (FK set null).
    const gone = await db.delete(tables.chapters).where(and(eq(tables.chapters.partId, id), eq(tables.chapters.deletedAt, item.deletedAt))).returning({ id: tables.chapters.id })
    await forgetChapters(projectId, gone.map(c => c.id), db)
  }
  const ownerType = IMAGE_OWNERS[collection]
  if (ownerType) {
    await db.delete(tables.images).where(and(eq(tables.images.projectId, projectId), eq(tables.images.ownerType, ownerType), eq(tables.images.ownerId, id)))
  }
  if (collection === 'codexCategories') {
    await db.execute(sql`delete from images where project_id = ${projectId} and owner_type = 'codex' and owner_id in (select id from codex_entries where category_id = ${id}::uuid)`)
  }

  await db.delete(table).where(and(eq(table.id, id), eq(table.projectId, projectId)))

  if (collection === 'variables') await forgetVariable(projectId, id, db)
  if (collection === 'chapters') await forgetChapters(projectId, [id], db)
  if (collection === 'scenes') {
    await db.execute(sql`update projects set start_scene_id = null where id = ${projectId} and start_scene_id = ${id}::uuid`)
    await db.execute(sql`update strands set quest = jsonb_set(quest, '{objectives}', (select coalesce(jsonb_agg(case when o->>'sceneId' = ${id} then o - 'sceneId' else o end), '[]'::jsonb) from jsonb_array_elements(quest->'objectives') o)) where project_id = ${projectId} and jsonb_typeof(quest->'objectives') = 'array' and quest::text like ${`%${id}%`}`)
  }
  if (!ref) return

  const refKey = `${ref}:${id}`
  const refJson = JSON.stringify([{ type: ref, id }])
  if (collection === 'characters' || collection === 'locations' || collection === 'objects') {
    const column = { characters: 'character_ids', locations: 'location_ids', objects: 'object_ids' }[collection]
    await db.execute(sql`update scenes set ${sql.identifier(column)} = array_remove(${sql.identifier(column)}, ${id}::uuid), tags = tags - ${refKey}::text where project_id = ${projectId} and (tags ? ${refKey}::text or ${id}::uuid = any(${sql.identifier(column)}))`)
  }
  if (collection === 'strands') {
    await db.execute(sql`update scenes set strand_ids = array_remove(strand_ids, ${id}::uuid) where project_id = ${projectId} and ${id}::uuid = any(strand_ids)`)
  }
  if (collection === 'characters' || collection === 'groups' || collection === 'locations' || collection === 'objects') {
    await db.execute(sql`delete from relations where project_id = ${projectId} and ((source_type = ${ref} and source_id = ${id}::uuid) or (target_type = ${ref} and target_id = ${id}::uuid))`)
    await db.execute(sql`update maps set nodes = nodes - ${refKey}::text where project_id = ${projectId} and nodes ? ${refKey}::text`)
  }
  if (collection === 'characters') {
    await db.execute(sql`update strands set quest = jsonb_set(quest, '{giverId}', 'null'::jsonb) where project_id = ${projectId} and quest->>'giverId' = ${id}`)
  }
  if (collection === 'locations') {
    await db.execute(sql`update strands set quest = jsonb_set(quest, '{locationId}', 'null'::jsonb) where project_id = ${projectId} and quest->>'locationId' = ${id}`)
    await db.execute(sql`update locations set parent_id = null where project_id = ${projectId} and parent_id = ${id}::uuid`)
  }
  if (collection === 'objects') {
    await db.execute(sql`update strands set quest = jsonb_set(quest, '{rewards}', (select coalesce(jsonb_agg(case when r->>'objectId' = ${id} then r - 'objectId' else r end), '[]'::jsonb) from jsonb_array_elements(quest->'rewards') r)) where project_id = ${projectId} and jsonb_typeof(quest->'rewards') = 'array' and quest::text like ${`%${id}%`}`)
  }
  for (const target of ['events', 'notes'] as const) {
    await db.execute(sql`update ${sql.identifier(target)} set refs = coalesce((select jsonb_agg(r) from jsonb_array_elements(refs) r where not (r->>'type' = ${ref} and r->>'id' = ${id})), '[]'::jsonb) where project_id = ${projectId} and refs @> ${refJson}::jsonb`)
  }
}
