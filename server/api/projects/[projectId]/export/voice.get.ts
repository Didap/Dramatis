/**
 * The dialogue lines of the project in a few numbers, for the filters of the voice-over export:
 * lines per scene and speaker, and the speakers with their names.
 */
export default defineEventHandler(async (event) => {
  const model = await loadExportModel(event, { content: true })
  const rows = voiceOverRows(model)
  const speakers = new Map<string, { key: string, label: string, characterId: string | null, lines: number }>()
  const counts = new Map<string, { sceneId: string, speaker: string, lines: number }>()
  for (const row of rows) {
    const speaker = speakers.get(row.speakerKey) ?? { key: row.speakerKey, label: row.speaker, characterId: row.speaker_id || null, lines: 0 }
    speaker.lines++
    speakers.set(row.speakerKey, speaker)
    const key = `${row.sceneId}|${row.speakerKey}`
    const count = counts.get(key) ?? { sceneId: row.sceneId, speaker: row.speakerKey, lines: 0 }
    count.lines++
    counts.set(key, count)
  }
  return {
    total: rows.length,
    speakers: [...speakers.values()].sort((a, b) => b.lines - a.lines || a.label.localeCompare(b.label)),
    counts: [...counts.values()],
  }
})
