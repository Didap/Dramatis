import { z } from 'zod'
import { EXPORT_WHATS } from '#shared/utils/constants'
import { exportParseBody } from '../../../../utils/export/limits'

const schema = z.object({
  what: z.enum(EXPORT_WHATS),
  format: z.enum(['pdf']),
})

/** Records an export the browser made itself (the PDF from the print page). */
export default defineEventHandler(async (event) => {
  const model = await loadExportModel(event)
  const { what, format } = await exportParseBody(event, schema, 64 * 1024)
  await recordExport(model, what, format)
  return { ok: true }
})
