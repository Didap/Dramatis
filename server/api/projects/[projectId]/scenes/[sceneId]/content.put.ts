import { eq, max, sql } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  content: zNullableDoc,
  /** The revision being edited. */
  revisionId: z.uuid(),
  /** The revision version the text was based on (from GET content or the last save). */
  version: z.number().int().min(0),
  /** Keep the text before this save in the history (before "Sostituisci tutto"). */
  snapshot: z.literal('before_bulk').optional(),
})

/**
 * Saves the text of the scene's active revision.
 *
 * Never loses a word (spec 5.11): when the revision was saved meanwhile by another device or tab
 * (its version is newer than `version`), or another revision became active, the incoming text is
 * stored as a new, inactive revision "Conflitto del 18 ott, 14:32", the other text stays untouched,
 * and the answer is 409 with both. A stale save whose text is already the current one (a retry whose
 * answer was lost, a page closing twice) is no conflict: it answers like a save, without writing.
 *
 * On a normal save the server also keeps an automatic state in the history (at most one every few
 * minutes), gives dialogue lines their stable ids, recomputes the tags (mentions, lines spoken),
 * updates words and characters and records the delta in the writing log (account time zone).
 */
export default defineEventHandler(async (event) => {
  const { user, project } = await requireProject(event)
  const sceneId = requireUuidParam(event, 'sceneId')
  const body = await parseBody(event, schema)
  const now = new Date()

  // The conflict revision must be committed, so the 409 is raised after the transaction.
  const outcome = await useDb().transaction(async (tx) => {
    await tx.execute(sql`select id from scenes where id = ${sceneId} for update`)
    const scene = await requireScene(project.id, sceneId, tx)
    const revision = await currentRevision(scene, tx)

    if (body.revisionId !== revision.id || body.version !== revision.version) {
      if (body.revisionId === revision.id && canonical(body.content, true) === canonical(revision.content, true)) {
        const [row] = await tx.select().from(tables.scenes).where(eq(tables.scenes.id, scene.id)).limit(1)
        return {
          saved: {
            sceneId: scene.id,
            revisionId: revision.id,
            version: revision.version,
            wordCount: revision.wordCount,
            charCount: row!.charCount,
            charCountNoSpaces: row!.charCountNoSpaces,
            updatedAt: revision.updatedAt.toISOString(),
            scene: JSON.parse(JSON.stringify(row)),
            // The stored text has line ids the incoming one lacks: hand them to the editor.
            ...(canonical(body.content) !== canonical(revision.content) ? { content: revision.content } : {}),
          },
        }
      }
      const [last] = await tx.select({ n: max(tables.sceneRevisions.number) }).from(tables.sceneRevisions).where(eq(tables.sceneRevisions.sceneId, scene.id))
      const measured = measureDoc(body.content)
      const [conflict] = await tx
        .insert(tables.sceneRevisions)
        .values({
          projectId: project.id,
          sceneId: scene.id,
          number: Number(last?.n ?? 0) + 1,
          label: conflictRevisionLabel(user.locale, user.timezone, now),
          content: body.content,
          ...measured,
        })
        .returning()
      await touchProject(project.id, tx)
      return {
        conflict: {
          reason: body.revisionId !== revision.id ? 'revision' : 'version',
          conflictRevision: toRevisionInfo(conflict!),
          current: {
            revisionId: revision.id,
            content: revision.content,
            wordCount: revision.wordCount,
            version: revision.version,
            updatedAt: revision.updatedAt.toISOString(),
          },
        },
      }
    }

    await snapshot(revision, body.snapshot ?? 'auto', tx)

    const lines = normalizeLineIds(body.content, scene.code, scene.lineCounter)
    const content = lines.content
    const measured = measureDoc(content)
    const [saved] = await tx
      .update(tables.sceneRevisions)
      .set({ content, ...measured, version: revision.version + 1, updatedAt: now })
      .where(eq(tables.sceneRevisions.id, revision.id))
      .returning({ version: tables.sceneRevisions.version })

    const tags = await recomputeTags(scene, content, tx)
    const [updated] = await tx
      .update(tables.scenes)
      .set({
        wordCount: measured.wordCount,
        charCount: measured.charCount,
        charCountNoSpaces: measured.charCountNoSpaces,
        lineCounter: lines.lineCounter,
        editedAt: now,
        ...(tags.changed ? { tags: tags.tags, characterIds: tags.characterIds, locationIds: tags.locationIds, objectIds: tags.objectIds } : {}),
      })
      .where(eq(tables.scenes.id, scene.id))
      .returning()

    await logWords(project.id, dayIn(user.timezone, now), measured.wordCount - scene.wordCount, tx)
    await touchProject(project.id, tx)

    return {
      saved: {
        sceneId: scene.id,
        revisionId: revision.id,
        version: saved!.version,
        wordCount: measured.wordCount,
        charCount: measured.charCount,
        charCountNoSpaces: measured.charCountNoSpaces,
        updatedAt: now.toISOString(),
        /** The scene row after the save (tags, counts), to sync the store. */
        scene: JSON.parse(JSON.stringify(updated)),
        /** Present when the server gave dialogue lines new ids: apply them to the open editor. */
        ...(lines.changed ? { content } : {}),
      },
    }
  })

  if ('conflict' in outcome) {
    throw createError({ statusCode: 409, message: 'The scene was saved from another device', data: outcome.conflict })
  }
  return outcome.saved
})

function conflictRevisionLabel(locale: string, timeZone: string, date: Date) {
  const when = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'it-IT', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return locale === 'en' ? `Conflict of ${when}` : `Conflitto del ${when}`
}

/**
 * A document as a string that ignores key order (jsonb stores object keys in its own order) and,
 * with `withoutLineIds`, the dialogue line ids the server assigns: the same text either way.
 */
function canonical(value: unknown, withoutLineIds = false): string {
  if (Array.isArray(value)) return `[${value.map(v => canonical(v, withoutLineIds)).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => v !== undefined && !(withoutLineIds && k === 'lineId'))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v, withoutLineIds)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}
