/** The story as ink (appendix D.7), for inklecate, Inky and the ink runtime. */
export default defineEventHandler(async (event) => {
  const model = await loadExportModel(event, { content: true })
  const text = gameInk(model, exportTranslator(model.user.locale === 'en' ? 'en' : 'it'))
  await recordExport(model, 'ink', 'ink')
  return sendExportFile(event, exportFileName(model.project.title, model.day, 'ink'), EXPORT_MIME.ink, text)
})
