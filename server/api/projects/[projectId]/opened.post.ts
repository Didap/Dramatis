import { eq } from 'drizzle-orm'

/** Marks the project as opened now and as the account's last opened project. */
export default defineEventHandler(async (event) => {
  const { user, project } = await requireProject(event)
  const db = useDb()
  await db.update(tables.projects).set({ openedAt: new Date(), updatedAt: project.updatedAt }).where(eq(tables.projects.id, project.id))
  const [account] = await db.select({ preferences: tables.users.preferences }).from(tables.users).where(eq(tables.users.id, user.id))
  if (account && account.preferences.lastProjectId !== project.id) {
    await db.update(tables.users).set({ preferences: { ...account.preferences, lastProjectId: project.id } }).where(eq(tables.users.id, user.id))
  }
  return { ok: true }
})
