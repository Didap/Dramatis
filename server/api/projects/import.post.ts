import { exportBodyLimit, exportOneAtATime, exportTooLarge, exportUnzip, exportZipNames } from '../../utils/export/limits'

/** The largest upload: a backup holds the project's text, its whole history and its images. */
const MAX_IMPORT_BYTES = 300 * 1024 * 1024
/** The largest Markdown or text manuscript (a long novel is a megabyte or two). */
const MAX_TEXT_BYTES = 30 * 1024 * 1024
/** The parts of a Word document that are read, and how large they may be. */
const DOCX_PARTS: Record<string, number> = { 'word/document.xml': 50_000_000, 'word/styles.xml': 10_000_000 }

/**
 * Imports a file as a new project of the signed-in user (spec 5.10.7): it never overwrites anything.
 * Multipart field "file":
 * - a project backup, the .dramatis.zip of an export or its dramatis.json alone, restored exactly;
 * - a manuscript (P1): a Word document (.docx) or a Markdown or text file, whose headings become parts,
 *   chapters and scenes. Text files may be UTF-8, UTF-16 (with its byte order mark) or Windows-1252.
 * Answers the new project, like POST /api/projects. A refused file answers 400 (413 when too large, 429 while
 * another import of the same author runs) with data.reason "notBackup", "version", "invalid", "tooLarge",
 * "empty", "encoding" or "busy".
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  // The size is known before a byte is read: an upload declared above the limit is refused without buffering it.
  const declared = getRequestHeader(event, 'content-length')
  if (declared && Number(declared) > MAX_IMPORT_BYTES) exportTooLarge('The file is too large to import')
  rateLimit(`import:${user.id}`, 8, 60_000)

  // One import at a time for each author (a second one waits, its upload unread): each can take a lot of memory.
  return exportOneAtATime(`import:${user.id}`, 3, async () => {
    // An upload sent without its length is counted as it arrives, and cut off past the limit.
    const limit = exportBodyLimit(event, MAX_IMPORT_BYTES)
    const parts = await readMultipartFormData(event).catch((error) => {
      if (limit.exceeded) exportTooLarge('The file is too large to import')
      throw error
    })
    if (limit.exceeded) exportTooLarge('The file is too large to import')
    const file = parts?.find(p => p.name === 'file')
    if (!file?.data?.length) throw createError({ statusCode: 400, message: 'No file', data: { reason: 'notBackup' } })
    const bytes = new Uint8Array(file.data.buffer, file.data.byteOffset, file.data.byteLength)
    const fileName = (file.filename ?? '').normalize('NFC')
    const t = exportTranslator(user.locale === 'en' ? 'en' : 'it')
    const baseName = fileName.replace(/\.[^.]+$/, '').replace(/\.dramatis$/, '').trim() || t('export.import.untitled')
    const restore = (input: unknown, files: Map<string, Uint8Array>) => restoreBackup(user.id, input, files, { untitled: t('common.untitled.project') })

    let project
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      // A zip: a Dramatis backup, or a Word document.
      let names: string[]
      try {
        names = exportZipNames(bytes)
      }
      catch (error) {
        if ((error as { data?: { reason?: string } })?.data?.reason) throw error
        throw createError({ statusCode: 400, message: 'The file is not a Dramatis backup', data: { reason: 'notBackup' } })
      }
      if (!names.includes('dramatis.json') && names.includes('word/document.xml')) {
        let entries: Record<string, Uint8Array>
        try {
          entries = exportUnzip(bytes, { entry: name => DOCX_PARTS[name] ?? null, total: 60_000_000 })
        }
        catch (error) {
          if ((error as { data?: { reason?: string } })?.data?.reason) throw error
          throw createError({ statusCode: 400, message: 'The document cannot be read', data: { reason: 'notBackup' } })
        }
        project = await fromManuscript(user, buildImportedManuscript(docxBlocks(entries), baseName))
      }
      else {
        const { json, files } = readBackup(bytes)
        project = await restore(json, files)
      }
    }
    else if (/^\s*\{/.test(new TextDecoder().decode(bytes.subarray(0, 64)).replace(/^\uFEFF/, '')) || /\.json$/i.test(fileName)) {
      // The JSON document of a backup, alone (without its images).
      const { json, files } = readBackup(bytes)
      project = await restore(json, files)
    }
    else {
      // Anything else that reads as text is a manuscript: Markdown, or plain text with one paragraph a line.
      if (bytes.length > MAX_TEXT_BYTES) exportTooLarge('The manuscript is too large to import')
      const text = decodeText(bytes)
      if (text.includes('\u0000')) throw createError({ statusCode: 400, message: 'The file is not a Dramatis backup', data: { reason: 'notBackup' } })
      const blocks = markdownBlocks(text, { lines: /\.txt$/i.test(fileName) })
      project = await fromManuscript(user, buildImportedManuscript(blocks, baseName))
    }
    return JSON.parse(JSON.stringify(project)) as typeof project
  })
})

async function fromManuscript(user: { id: string, name: string, locale: string }, manuscript: ImportedManuscript) {
  const hasText = manuscript.parts.some(p => p.chapters.some(c => c.scenes.some(s => s.content.length)))
  if (!hasText) throw createError({ statusCode: 400, message: 'The manuscript has no text', data: { reason: 'empty' } })
  return createProjectFromManuscript(user, manuscript)
}

/** Windows-1252 where it differs from Latin-1 (0x80 to 0x9F); the five unused bytes stay as they are. */
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ'

/**
 * The text of a file whatever wrote it: UTF-16 with its byte order mark (Notepad's "Unicode") or without it
 * (told by its zero bytes), UTF-8 with or without a mark, and otherwise Windows-1252, the encoding of old Notepad
 * and of Word's plain text, in which every byte is a character (so an Italian manuscript keeps its accents). A
 * UTF-8 file with a few stray bytes stays UTF-8, the stray bytes shown as �. A file that claims UTF-16 and
 * is not answers 400 "encoding".
 */
function decodeText(bytes: Uint8Array): string {
  const utf16 = (encoding: 'utf-16le' | 'utf-16be', start: number) => {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(start))
    }
    catch {
      throw createError({ statusCode: 400, message: 'The text of the file cannot be read', data: { reason: 'encoding' } })
    }
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return utf16('utf-16le', 2)
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return utf16('utf-16be', 2)
  // Text with a zero in every other byte is UTF-16 without its mark: the zeros say which half is which.
  const head = bytes.subarray(0, 4000)
  let even = 0
  let odd = 0
  head.forEach((byte, i) => {
    if (byte === 0) {
      if (i % 2) odd++
      else even++
    }
  })
  if (odd > head.length / 4 && even < odd / 20) return utf16('utf-16le', 0)
  if (even > head.length / 4 && odd < even / 20) return utf16('utf-16be', 0)
  const bom = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF ? 3 : 0
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(bom))
  }
  catch {}
  const { valid, invalid } = utf8Sequences(bytes)
  if (valid > invalid * 4) return new TextDecoder('utf-8').decode(bytes.subarray(bom))
  let text = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192)).replace(/[\x80-\x9F]/g, ch => CP1252[ch.charCodeAt(0) - 0x80]!)
  }
  return text
}

/** How many multibyte UTF-8 sequences a text holds, and how many bytes above 127 that start none. */
function utf8Sequences(bytes: Uint8Array) {
  let valid = 0
  let invalid = 0
  for (let i = 0; i < bytes.length; i++) {
    const lead = bytes[i]!
    if (lead < 0x80) continue
    const length = lead >= 0xC2 && lead <= 0xDF ? 2 : lead >= 0xE0 && lead <= 0xEF ? 3 : lead >= 0xF0 && lead <= 0xF4 ? 4 : 0
    let ok = length > 0 && i + length <= bytes.length
    for (let j = 1; ok && j < length; j++) ok = (bytes[i + j]! & 0xC0) === 0x80
    if (ok) {
      valid++
      i += length - 1
    }
    else invalid++
  }
  return { valid, invalid }
}
