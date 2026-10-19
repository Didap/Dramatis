import { and, eq, isNull } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * The signed-in user, or 401. Sessions are sealed cookies valid on every device until they expire, so
 * the account is read back: a deleted account, or a session signed in before the last password change
 * (preferences.passwordChangedAt), is refused and its cookie cleared.
 */
export async function requireUser(event: H3Event) {
  const session = await requireUserSession(event)
  const [row] = await useDb()
    .select({ preferences: tables.users.preferences })
    .from(tables.users)
    .where(eq(tables.users.id, session.user.id))
    .limit(1)
  const changedAt = row?.preferences?.passwordChangedAt
  const signedInAt = session.loggedInAt ? Date.parse(session.loggedInAt) : Number.NaN
  if (!row || (changedAt && !(signedInAt >= Date.parse(changedAt)))) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Signed out' })
  }
  return session.user
}

/**
 * The project named by the `projectId` route param (or the given id), owned by the signed-in user.
 * Answers 404 for projects of other users, so their existence is never revealed.
 */
export async function requireProject(event: H3Event, projectId?: string, options: { includeDeleted?: boolean } = {}) {
  const user = await requireUser(event)
  const id = projectId ?? getRouterParam(event, 'projectId')
  if (!id || !isUuid(id)) throw createError({ statusCode: 404, message: 'Project not found' })
  const conditions = [eq(tables.projects.id, id), eq(tables.projects.ownerId, user.id)]
  if (!options.includeDeleted) conditions.push(isNull(tables.projects.deletedAt))
  const [project] = await useDb()
    .select()
    .from(tables.projects)
    .where(and(...conditions))
    .limit(1)
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' })
  return { user, project }
}

/** Marks the project as recently edited. */
export async function touchProject(projectId: string, db: DbOrTx = useDb()) {
  await db.update(tables.projects).set({ updatedAt: new Date() }).where(eq(tables.projects.id, projectId))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** A route param that must be a uuid, or 404. */
export function requireUuidParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name)
  if (!isUuid(value)) throw createError({ statusCode: 404, message: 'Not found' })
  return value
}
