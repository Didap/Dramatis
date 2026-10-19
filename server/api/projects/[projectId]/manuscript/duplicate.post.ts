import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { SceneTags } from '../../../../../shared/types/domain'
import enCopy from '../../../../../i18n/locales/en/manuscript.json'
import itCopy from '../../../../../i18n/locales/it/manuscript.json'

const schema = z.object({ sceneId: z.uuid() })

/**
 * Duplicates a scene: a new scene right after the original, with a new code, the same details and a
 * copy of the text of its active revision (its dialogue lines get ids of the new scene). Choices are
 * not copied, so the copy starts outside the flow. A copy is not words written: no writing log entry.
 * Answers with the new scene.
 */
export default defineEventHandler(async (event) => {
  const { user, project } = await requireProject(event)
  const { sceneId } = await parseBody(event, schema)

  return useDb().transaction(async (tx) => {
    const original = await requireScene(project.id, sceneId, tx)
    const revision = await currentRevision(original, tx)

    // Make room right after the original.
    await tx
      .update(tables.scenes)
      .set({ position: sql`${tables.scenes.position} + 1` })
      .where(and(
        eq(tables.scenes.projectId, project.id),
        eq(tables.scenes.chapterId, original.chapterId),
        gt(tables.scenes.position, original.position),
        isNull(tables.scenes.deletedAt),
      ))

    const code = await nextSceneCode(project.id, tx)
    const { content, lineCounter } = normalizeLineIds(revision.content, code, 0)
    const measured = measureDoc(content)
    const copy = (user.locale === 'en' ? enCopy : itCopy).manuscript.scene.copyTitle
    // A function, so "$&" or "$$" in a title stay as written instead of being read as patterns.
    const title = original.title.trim() ? copy.replace('{title}', () => original.title.trim()).slice(0, 300) : ''

    const [scene] = await tx
      .insert(tables.scenes)
      .values({
        projectId: project.id,
        chapterId: original.chapterId,
        code,
        title,
        synopsis: original.synopsis,
        notes: original.notes,
        status: original.status,
        kind: original.kind,
        pov: original.pov,
        povCharacterId: original.povCharacterId,
        storyAt: original.storyAt,
        storyTimeLabel: original.storyTimeLabel,
        durationValue: original.durationValue,
        durationUnit: original.durationUnit,
        strandIds: original.strandIds,
        ending: original.ending,
        endingLabel: original.endingLabel,
        lineCounter,
        position: original.position + 1,
      })
      .returning()

    const [copied] = await tx
      .insert(tables.sceneRevisions)
      .values({ projectId: project.id, sceneId: scene!.id, number: 1, content, ...measured })
      .returning({ id: tables.sceneRevisions.id })

    // Manual tags come along; mentions and speakers are counted again from the copied text.
    const manual: SceneTags = {}
    for (const [key, info] of Object.entries(original.tags ?? {})) if (info.manual) manual[key] = { manual: true }
    const tags = await recomputeTags({ projectId: project.id, tags: manual }, content, tx)

    const [row] = await tx
      .update(tables.scenes)
      .set({
        currentRevisionId: copied!.id,
        tags: tags.tags,
        characterIds: tags.characterIds,
        locationIds: tags.locationIds,
        objectIds: tags.objectIds,
        wordCount: measured.wordCount,
        charCount: measured.charCount,
        charCountNoSpaces: measured.charCountNoSpaces,
      })
      .where(eq(tables.scenes.id, scene!.id))
      .returning()

    await touchProject(project.id, tx)
    return JSON.parse(JSON.stringify(row)) as typeof row
  })
})
