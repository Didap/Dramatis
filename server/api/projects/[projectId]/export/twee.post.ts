import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { exportParseBody } from '../../../../utils/export/limits'

const schema = z.object({ format: z.enum(['harlowe', 'sugarcube']).default('harlowe') })

const IFID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/

/**
 * Twee 3 for Harlowe 3 (appendix D.6) or, with format "sugarcube", SugarCube 2 (P1). The project's IFID is
 * made once, on the first export, and kept in the project's settings (the data model has no column for it).
 */
export default defineEventHandler(async (event) => {
  const model = await loadExportModel(event, { content: true })
  const { format } = await exportParseBody(event, schema, 64 * 1024)
  const settings = model.project.settings as Record<string, unknown>
  let ifid = typeof settings.ifid === 'string' && IFID_RE.test(settings.ifid) ? settings.ifid : ''
  if (!ifid) {
    ifid = randomUUID().toUpperCase()
    await useDb()
      .update(tables.projects)
      .set({ settings: sql`${tables.projects.settings} || ${JSON.stringify({ ifid })}::jsonb` })
      .where(eq(tables.projects.id, model.project.id))
  }
  const text = gameTwee(model, ifid, exportTranslator(model.user.locale === 'en' ? 'en' : 'it'), format)
  await recordExport(model, 'twee', format === 'sugarcube' ? 'twee-sugarcube' : 'twee')
  const name = exportFileName(model.project.title, model.day, 'twee', format === 'sugarcube' ? 'sugarcube' : undefined)
  return sendExportFile(event, name, EXPORT_MIME.twee, text)
})
