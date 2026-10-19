import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { countWords, extractDialogueLines } from '#shared/utils/richtext'

const querySchema = z.object({
  /** Only the lines this character speaks. */
  characterId: z.uuid().optional(),
})

export interface SpokenLine {
  sceneId: string
  lineId: string | null
  speakerId: string | null
  speakerName: string
  direction: string
  text: string
  /** Words of the line text only (spec 0.11): not the speaker, not the direction. */
  words: number
}

/**
 * The dialogue lines (module script) of the active revisions of the live scenes: every line of the
 * project, or those spoken by one character. Scene by scene, in the order of each scene's text.
 */
export default defineEventHandler(async (event): Promise<{ lines: SpokenLine[] }> => {
  const { project } = await requireProject(event)
  const { characterId } = parseQuery(event, querySchema)
  if (characterId) await assertRefs(project.id, [{ collection: 'characters', ids: [characterId] }])

  const conditions = [eq(tables.scenes.projectId, project.id), isNull(tables.scenes.deletedAt)]
  // A speaker is always tagged in the scene (source dialogue), so the scenes to read are known.
  if (characterId) conditions.push(sql`${characterId}::uuid = any(${tables.scenes.characterIds})`)

  const rows = await useDb()
    .select({ sceneId: tables.scenes.id, content: tables.sceneRevisions.content })
    .from(tables.scenes)
    .innerJoin(tables.sceneRevisions, eq(tables.sceneRevisions.id, tables.scenes.currentRevisionId))
    .where(and(...conditions))

  const lines: SpokenLine[] = []
  for (const row of rows) {
    for (const line of extractDialogueLines(row.content)) {
      if (characterId && line.speakerId !== characterId) continue
      lines.push({ sceneId: row.sceneId, ...line, words: countWords(line.text) })
    }
  }
  return { lines }
})
