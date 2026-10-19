import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  add: z.array(zSpellWord).max(100).default([]),
  remove: z.array(zSpellWord).max(DICTIONARY_MAX).default([]),
})

/** The same word whatever its case and apostrophe. */
const fold = (word: string) => word.replace(/’/g, '\'').toLocaleLowerCase()

/**
 * Adds words to the project's spelling dictionary ("Aggiungi al dizionario") or takes them out. Merged
 * here, so two devices adding words at once both keep theirs; a word already there in another case
 * is not added twice. Answers with the whole dictionary.
 */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const body = await parseBody(event, schema)

  return useDb().transaction(async (tx) => {
    const [row] = await tx.select({ settings: tables.projects.settings }).from(tables.projects).where(eq(tables.projects.id, project.id)).for('update')
    const settings = row?.settings ?? {}
    const removed = new Set(body.remove.map(fold))
    const words = (settings.dictionary ?? []).filter(word => !removed.has(fold(word)))
    const known = new Set(words.map(fold))
    for (const word of body.add) {
      if (known.has(fold(word))) continue
      words.push(word)
      known.add(fold(word))
    }
    if (words.length > DICTIONARY_MAX) throw createError({ statusCode: 422, message: 'The dictionary is full' })
    await tx.update(tables.projects).set({ settings: { ...settings, dictionary: words } }).where(eq(tables.projects.id, project.id))
    return { dictionary: words }
  })
})
