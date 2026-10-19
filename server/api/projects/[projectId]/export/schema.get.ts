/** The JSON Schema of the dramatis-game format, published beside its exporter. */
export default defineEventHandler(async (event) => {
  await requireProject(event)
  return sendExportFile(event, `dramatis-game-${DRAMATIS_GAME_VERSION}.schema.json`, EXPORT_MIME.json, `${JSON.stringify(DRAMATIS_GAME_SCHEMA, null, 2)}\n`)
})
