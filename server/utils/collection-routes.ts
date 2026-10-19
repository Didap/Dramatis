import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { Collection } from '#shared/types/domain'
import { isCollection, isTrashable, tableOf, trashItem } from './collections'

/** The collection named by the `collection` route param (or the given one), or 404. */
export function collectionParam(event: H3Event, fixed?: Collection): Collection {
  const collection = fixed ?? getRouterParam(event, 'collection')
  if (!isCollection(collection)) throw createError({ statusCode: 404, message: 'Not found' })
  return collection
}

/** POST /api/projects/:projectId/:collection */
export async function handleCreate(event: H3Event, collection: Collection) {
  const { user, project } = await requireProject(event)
  const data = (await parseBody(event, createSchema(collection))) as Record<string, any>
  const { refs, media } = referencesOf(collection, data)
  await assertRefs(project.id, refs)
  await assertMedia(user.id, media)
  const row = await createItem(project.id, collection, data)
  return JSON.parse(JSON.stringify(row))
}

/** PATCH /api/projects/:projectId/:collection/:id */
export async function handleUpdate(event: H3Event, collection: Collection, id: string) {
  const { user, project } = await requireProject(event)
  const patch = (await parseBody(event, updateSchema(collection))) as Record<string, any>
  if (!Object.keys(patch).length) throw createError({ statusCode: 400, message: 'Nothing to update' })
  const { refs, media } = referencesOf(collection, patch)
  await assertRefs(project.id, refs)
  await assertMedia(user.id, media)
  const row = await updateItem(project.id, collection, id, patch, { locale: user.locale, timeZone: user.timezone })
  return JSON.parse(JSON.stringify(row))
}

/** DELETE /api/projects/:projectId/:collection/:id: trashable items go to the trash, the others are deleted. */
export async function handleDelete(event: H3Event, collection: Collection, id: string) {
  const { project } = await requireProject(event)
  if (isTrashable(collection)) {
    const result = await useDb().transaction(tx => trashItem(project.id, collection, id, tx))
    await touchProject(project.id)
    return { ...result, trashed: true }
  }
  const table = tableOf(collection)
  const removed = await useDb()
    .delete(table)
    .where(and(eq(table.id, id), eq(table.projectId, project.id)))
    .returning({ id: table.id })
  if (!removed.length) throw createError({ statusCode: 404, message: 'Not found' })
  await touchProject(project.id)
  return { id, trashed: false, cascade: {} }
}
