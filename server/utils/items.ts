import { and, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Collection, EntityColor, SceneTags, WorldRefType } from '../../shared/types/domain'
import type { ManualTag } from '../../shared/types/entities'
import { ENTITY_COLOR_ORDER, REF_TO_COLLECTION } from '#shared/utils/constants'
import { isDirectedByDefault, isValidRelation } from '#shared/utils/relations'

const COLOURED: Partial<Record<Collection, true>> = {
  characters: true,
  groups: true,
  strands: true,
}

/** The palette colour least used in a collection, so new items are told apart at a glance. */
async function pickColor(projectId: string, collection: Collection, db: DbOrTx): Promise<EntityColor> {
  const table = tableOf(collection)
  const rows: { color: string, n: number }[] = await db
    .select({ color: table.color, n: count() })
    .from(table)
    .where(and(eq(table.projectId, projectId), isNull(table.deletedAt)))
    .groupBy(table.color)
  const used = new Map(rows.map(r => [r.color, Number(r.n)]))
  let best: EntityColor = ENTITY_COLOR_ORDER[0]!
  let bestCount = Number.POSITIVE_INFINITY
  for (const color of ENTITY_COLOR_ORDER) {
    const n = used.get(color) ?? 0
    if (n < bestCount) {
      best = color
      bestCount = n
    }
  }
  return best
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string, cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

/** Applies the manual tags of a scene to its tag map, keeping counts from the text. */
export function withManualTags(tags: SceneTags, manual: ManualTag[]): SceneTags {
  const wanted = new Set(manual.map(t => `${t.type}:${t.id}`))
  const next: SceneTags = {}
  for (const [key, info] of Object.entries(tags)) {
    const entry = { ...info, manual: wanted.has(key) || undefined }
    if (entry.manual || entry.mentions || entry.lines) next[key] = entry
  }
  for (const key of wanted) if (!next[key]) next[key] = { manual: true }
  return next
}

/** The id arrays derived from a scene's tag map. */
export function tagArrays(tags: SceneTags) {
  const out = { characterIds: [] as string[], locationIds: [] as string[], objectIds: [] as string[] }
  for (const key of Object.keys(tags)) {
    const [type, id] = key.split(':') as [string, string]
    if (type === 'character') out.characterIds.push(id)
    else if (type === 'location') out.locationIds.push(id)
    else if (type === 'object') out.objectIds.push(id)
  }
  return out
}

function checkRelation(data: { sourceType: WorldRefType, sourceId: string, targetType: WorldRefType, targetId: string, kind?: string }) {
  if (data.sourceType === data.targetType && data.sourceId === data.targetId) {
    throw createError({ statusCode: 400, message: 'A relationship needs two different items' })
  }
  if (data.kind && !isValidRelation(data.sourceType, data.targetType, data.kind as never)) {
    throw createError({ statusCode: 400, message: `A ${data.kind} relationship is not possible from ${data.sourceType} to ${data.targetType}` })
  }
}

/** Creates an item whose input has already been validated and whose references have been checked. */
export async function createItem(projectId: string, collection: Collection, input: Record<string, any>) {
  const db = useDb()
  const table = tableOf(collection)
  const data: Record<string, any> = { ...input, projectId }

  if (collection === 'relations') {
    data.kind ??= 'other'
    checkRelation(data as never)
    data.directed ??= isDirectedByDefault(data.kind)
  }
  if (collection === 'scenes') {
    const manual = (data.manualTags ?? []) as ManualTag[]
    delete data.manualTags
    data.tags = withManualTags({}, manual)
    Object.assign(data, tagArrays(data.tags))
  }

  try {
    return await db.transaction(async (tx) => {
      if (data.position === undefined && table.position) data.position = await nextPosition(projectId, collection, data, tx)
      if (COLOURED[collection] && !data.color) data.color = await pickColor(projectId, collection, tx)
      if (collection === 'scenes') data.code = await nextSceneCode(projectId, tx)

      const [row] = await tx.insert(table).values(data).returning()

      if (collection === 'scenes') {
        const [revision] = await tx
          .insert(tables.sceneRevisions)
          .values({ projectId, sceneId: row.id, number: 1, content: null, contentText: '', wordCount: 0 })
          .returning({ id: tables.sceneRevisions.id })
        const [scene] = await tx
          .update(tables.scenes)
          .set({ currentRevisionId: revision!.id })
          .where(eq(tables.scenes.id, row.id))
          .returning()
        await touchProject(projectId, tx)
        return scene
      }

      await touchProject(projectId, tx)
      return row
    })
  }
  catch (error) {
    if (isUniqueViolation(error)) throw createError({ statusCode: 409, message: 'An item with this name already exists' })
    throw error
  }
}

/** Updates an item whose patch has already been validated and whose references have been checked. */
export async function updateItem(projectId: string, collection: Collection, id: string, input: Record<string, any>, ctx: { locale: string, timeZone: string }) {
  const db = useDb()
  const table = tableOf(collection)
  const conditions = [eq(table.id, id), eq(table.projectId, projectId), isNull(table.deletedAt)]

  const [before]: any[] = await db.select().from(table).where(and(...conditions)).limit(1)
  if (!before) throw createError({ statusCode: 404, message: 'Not found' })

  if (collection === 'locations' && 'parentId' in input) {
    await assertNoLocationCycle(projectId, id, input.parentId)
  }
  if (collection === 'relations') checkRelation({ ...before, ...input })

  try {
    return await db.transaction(async (tx) => {
      // Read again under a row lock: concurrent saves of one item (two devices, a scene's text save
      // recomputing its tags) merge one after the other instead of overwriting each other.
      const [existing]: any[] = await tx.select().from(table).where(and(...conditions)).for('update')
      if (!existing) throw createError({ statusCode: 404, message: 'Not found' })
      const { patch, conflicts } = await applyLongTextRule(collection, existing, input, {
        projectId,
        locale: ctx.locale,
        timeZone: ctx.timeZone,
        itemName: existing.name ?? existing.title ?? '',
      }, tx)
      const data: Record<string, any> = { ...patch }

      // Profile answers are short fields: merge them, so two devices editing different answers both win.
      if (collection === 'characters' && data.profile) {
        const merged: Record<string, any> = { ...existing.profile }
        for (const [section, value] of Object.entries(data.profile as Record<string, any>)) {
          const before = merged[section] ?? {}
          merged[section] = { ...before, ...value, answers: { ...before.answers, ...value?.answers } }
        }
        data.profile = merged
      }
      if (collection === 'characters' && data.traits) data.traits = { ...existing.traits, ...data.traits }

      if (collection === 'scenes') {
        if (data.manualTags) {
          // Manual tags of entities in the trash are invisible to the client: keep them for the restore.
          const hidden = await hiddenRefKeys(projectId, Object.keys(existing.tags ?? {}).filter(k => existing.tags[k]?.manual), tx)
          const manual = [...(data.manualTags as ManualTag[]), ...hidden.map(key => ({ type: key.split(':')[0], id: key.split(':')[1] }) as ManualTag)]
          data.tags = withManualTags(existing.tags, manual)
          Object.assign(data, tagArrays(data.tags))
          delete data.manualTags
        }
        if (data.chapterId && data.chapterId !== existing.chapterId && data.position === undefined) {
          data.position = await nextPosition(projectId, 'scenes', { chapterId: data.chapterId }, tx)
        }
      }
      if ((collection === 'events' || collection === 'notes') && Array.isArray(data.refs)) {
        const before = (existing.refs ?? []) as { type: string, id: string }[]
        const hidden = await hiddenRefKeys(projectId, before.map(r => `${r.type}:${r.id}`), tx)
        const sent = new Set((data.refs as { type: string, id: string }[]).map(r => `${r.type}:${r.id}`))
        data.refs = [...data.refs, ...before.filter(r => hidden.includes(`${r.type}:${r.id}`) && !sent.has(`${r.type}:${r.id}`))]
      }
      if (collection === 'chapters' && 'partId' in data && data.partId !== existing.partId && data.position === undefined) {
        data.position = await nextPosition(projectId, 'chapters', { partId: data.partId }, tx)
      }
      if (collection === 'characters' && data.importance && data.importance !== existing.importance && data.position === undefined) {
        data.position = await nextPosition(projectId, 'characters', { importance: data.importance }, tx)
      }

      const [row] = Object.keys(data).length
        ? await tx.update(table).set(data).where(and(...conditions)).returning()
        : [existing]
      await touchProject(projectId, tx)
      return conflicts.length ? { ...row, $conflicts: conflicts } : row
    })
  }
  catch (error) {
    if (isUniqueViolation(error)) throw createError({ statusCode: 409, message: 'An item with this name already exists' })
    throw error
  }
}

/** The refs ("<type>:<id>") among `keys` whose entity is in the trash (hidden from the client, kept on save). */
async function hiddenRefKeys(projectId: string, keys: string[], db: DbOrTx): Promise<string[]> {
  const byCollection = new Map<Collection, string[]>()
  for (const key of keys) {
    const [type, id] = key.split(':') as [string, string]
    const collection = (REF_TO_COLLECTION as Record<string, Collection>)[type]
    if (collection && isUuid(id)) byCollection.set(collection, [...(byCollection.get(collection) ?? []), id])
  }
  const hidden: string[] = []
  for (const [collection, ids] of byCollection) {
    const table = tableOf(collection)
    const rows: { id: string }[] = await db.select({ id: table.id }).from(table).where(and(eq(table.projectId, projectId), inArray(table.id, ids), isNotNull(table.deletedAt)))
    const type = keys.find(k => ids.includes(k.split(':')[1]!))!.split(':')[0]
    for (const row of rows) hidden.push(`${type}:${row.id}`)
  }
  return hidden
}

/** Hands out the next scene code of a project (S001, S002...). Codes are never reused. */
export async function nextSceneCode(projectId: string, db: DbOrTx = useDb()): Promise<string> {
  const [row] = await db
    .update(tables.projects)
    .set({ sceneCounter: sql`${tables.projects.sceneCounter} + 1` })
    .where(eq(tables.projects.id, projectId))
    .returning({ n: tables.projects.sceneCounter })
  return sceneCode(row!.n)
}

export function sceneCode(n: number): string {
  return `S${String(n).padStart(3, '0')}`
}
