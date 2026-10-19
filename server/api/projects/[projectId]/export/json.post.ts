/** The story for developers in the documented dramatis-game format (appendix D.5). */
export default defineEventHandler(async (event) => {
  const model = await loadExportModel(event, { content: true })
  const data = gameJson(model)
  await recordExport(model, 'json', 'json')
  return sendExportFile(event, exportFileName(model.project.title, model.day, 'json'), EXPORT_MIME.json, `${JSON.stringify(data, null, 2)}\n`)
})
