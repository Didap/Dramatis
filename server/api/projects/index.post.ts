import { eq } from 'drizzle-orm'

/** Creates a project: blank, or from a structure template. Games get the default codex categories. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await parseBody(event, projectCreateSchema)
  const { structure, ...fields } = body
  const locale = user.locale === 'en' ? 'en' : 'it'
  const [account] = await useDb().select({ preferences: tables.users.preferences }).from(tables.users).where(eq(tables.users.id, user.id))
  const language = fields.language ?? locale

  const project = await useDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(tables.projects)
      .values({
        ...fields,
        title: fields.title?.trim() || (locale === 'en' ? 'Untitled' : 'Senza titolo'),
        ownerId: user.id,
        language,
        authorName: fields.authorName ?? user.name,
        openedAt: new Date(),
        settings: {
          guidance: account?.preferences.guidance ?? true,
          dialogueStyle: defaultDialogueStyle(language),
          smartTypography: true,
          parts: fields.kind === 'game' || !!structure,
          ...(structure ? { template: structure } : {}),
        },
      })
      .returning()
    if (structure) await applyStructure(tx, row!, structure, locale)
    if (row!.kind === 'game') await createDefaultCodex(row!.id, locale, tx)
    return row!
  })
  return JSON.parse(JSON.stringify(project)) as typeof project
})
