import { z } from 'zod'
import { exportLines } from './game'
import type { ExportModel } from './model'

/*
 * The voice-over script (appendix D.8): one row per dialogue line in manuscript order, UTF-8 with a byte
 * order mark, RFC 4180 quoting and CRLF line ends, comma or semicolon (spreadsheets set to Italian).
 * Line ids come from the server (S014-L003) and never change, so two exports agree line by line.
 */

export const VO_COLUMNS = ['line_id', 'scene_code', 'act', 'chapter', 'scene_title', 'scene_kind', 'order', 'speaker', 'speaker_id', 'direction', 'text', 'words', 'scene_status'] as const

export const voiceOverOptionsSchema = z.object({
  delimiter: z.enum(['comma', 'semicolon']).default('comma'),
  partId: z.uuid().nullish(),
  chapterId: z.uuid().nullish(),
  /** "character:<id>" for a character, "label:<text>" for a free label. */
  speaker: z.string().max(240).nullish(),
  onlyRevised: z.boolean().default(false),
})

export type VoiceOverOptions = z.output<typeof voiceOverOptionsSchema>

export interface VoiceOverRow {
  line_id: string
  scene_code: string
  act: string
  chapter: string
  scene_title: string
  scene_kind: string
  order: number
  speaker: string
  speaker_id: string
  direction: string
  text: string
  words: number
  scene_status: string
  /** Not a column: for filters and summaries. */
  sceneId: string
  partId: string | null
  chapterId: string
  speakerKey: string
}

/** The key a line's speaker is filtered by: the character, or the free label. */
export function voiceSpeakerKey(speakerId: string | null, speaker: string): string {
  return speakerId ? `character:${speakerId}` : `label:${speaker}`
}

/** Every dialogue line of the project, in manuscript order, numbered before any filter. */
export function voiceOverRows(model: ExportModel): VoiceOverRow[] {
  const rows: VoiceOverRow[] = []
  const chapters = new Map(model.chapters.map(c => [c.id, c]))
  const parts = new Map(model.parts.map(p => [p.id, p]))
  let order = 0
  for (const scene of model.scenes) {
    const chapter = chapters.get(scene.chapterId)
    const part = model.usesParts && chapter?.partId ? parts.get(chapter.partId) : undefined
    for (const line of exportLines(model.content.get(scene.id) ?? null, model.names)) {
      order++
      rows.push({
        line_id: line.lineId ?? '',
        scene_code: scene.code,
        act: part?.title ?? '',
        chapter: chapter?.title ?? '',
        scene_title: scene.title,
        scene_kind: scene.kind,
        order,
        speaker: line.speaker,
        speaker_id: line.speakerId ?? '',
        direction: line.direction,
        text: line.text,
        words: line.words,
        scene_status: scene.status,
        sceneId: scene.id,
        partId: part?.id ?? null,
        chapterId: scene.chapterId,
        speakerKey: voiceSpeakerKey(line.speakerId, line.speaker),
      })
    }
  }
  return rows
}

export function voiceOverFilter(options: VoiceOverOptions) {
  return (row: VoiceOverRow) =>
    (!options.partId || row.partId === options.partId)
    && (!options.chapterId || row.chapterId === options.chapterId)
    && (!options.speaker || row.speakerKey === options.speaker)
    && (!options.onlyRevised || row.scene_status === 'revised' || row.scene_status === 'final')
}

/** One CSV field: quoted when it holds the delimiter, a quote or a line break (RFC 4180). */
function field(value: string | number, delimiter: string): string {
  let text = String(value).replace(/\r\n?|\n/g, '\n')
  // A spreadsheet would read these as a formula: a leading apostrophe keeps them text.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return text.includes(delimiter) || /["\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text
}

export function voiceOverCsv(rows: VoiceOverRow[], options: VoiceOverOptions): string {
  const delimiter = options.delimiter === 'semicolon' ? ';' : ','
  const lines = [VO_COLUMNS.join(delimiter)]
  for (const row of rows) lines.push(VO_COLUMNS.map(column => field(row[column], delimiter)).join(delimiter))
  return `﻿${lines.join('\r\n')}\r\n`
}
