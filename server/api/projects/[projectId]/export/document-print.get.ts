/** The project document for the print page, which the browser turns into the PDF (spec section 6, P1). */
export default defineEventHandler(async (event) => {
  const model = await loadExportModel(event, { content: true })
  return { projectId: model.project.id, ...projectDocumentPrint(model) }
})
