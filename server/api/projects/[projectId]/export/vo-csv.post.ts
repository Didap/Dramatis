import { exportParseBody } from '../../../../utils/export/limits'

/**
 * The voice-over script as CSV (appendix D.8), filtered by act, chapter and speaker, optionally only
 * revised and final scenes. Answers 422 with reason "empty" when no line matches.
 */
export default defineEventHandler(async (event) => {
  const model = await loadExportModel(event, { content: true })
  const options = await exportParseBody(event, voiceOverOptionsSchema, 64 * 1024)
  const rows = voiceOverRows(model).filter(voiceOverFilter(options))
  if (!rows.length) throw createError({ statusCode: 422, message: 'No dialogue line matches these filters', data: { reason: 'empty' } })
  await recordExport(model, 'vo_csv', 'csv')
  const name = exportFileName(model.project.title, model.day, 'csv', model.t('export.file.voice'))
  return sendExportFile(event, name, EXPORT_MIME.csv, voiceOverCsv(rows, options))
})
