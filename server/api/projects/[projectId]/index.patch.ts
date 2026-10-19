import { eq } from 'drizzle-orm'
import { resolveModules } from '#shared/utils/modules'
import { ensureDefaultCodex } from '../../../utils/projects'

/**
 * Updates the project's own fields. Premise, fabula and setting follow the conflict rule for long
 * texts (send `$base` with the versions they were based on). Settings are merged.
 */
export default defineEventHandler(async (event) => {
  const { user, project } = await requireProject(event)
  const input = await parseBody(event, projectUpdateSchema)
  if (!Object.keys(input).length) throw createError({ statusCode: 400, message: 'Nothing to update' })
  if (input.startSceneId) await assertRefs(project.id, [{ collection: 'scenes', ids: [input.startSceneId] }])

  return useDb().transaction(async (tx) => {
    const { patch, conflicts } = await applyLongTextRule('project', project, input, {
      projectId: project.id,
      locale: user.locale,
      timeZone: user.timezone,
      itemName: '',
    }, tx)
    const { settings, ...rest } = patch
    const [row] = await tx
      .update(tables.projects)
      .set({ ...rest, ...(settings ? { settings: { ...project.settings, ...settings } } : {}) })
      .where(eq(tables.projects.id, project.id))
      .returning()
    // Switching the codex on (or turning a novel into a game) brings the seven default categories.
    if ((patch.modules || patch.kind) && resolveModules(row!.kind, row!.modules).codex) {
      await ensureDefaultCodex(project.id, user.locale === 'en' ? 'en' : 'it', tx)
    }
    const json = JSON.parse(JSON.stringify(row))
    return conflicts.length ? { ...json, $conflicts: conflicts } : json
  })
})
