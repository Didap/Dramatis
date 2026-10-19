import { z } from 'zod'
import { exportParseBody } from '../../../../utils/export/limits'

const schema = manuscriptOptionsSchema.extend({
  format: z.enum(['docx', 'epub', 'txt']),
  /**
   * EPUB only (P1): a cover image, JPEG or PNG as base64 (with or without the data: prefix). The export page
   * sends a JPEG of at most 2400 pixels, a few megabytes.
   */
  cover: z.string().max(10_000_000).optional(),
})

/**
 * The manuscript (or script) as DOCX, EPUB or TXT (appendix D.1 to D.3). The PDF is the print page.
 * Answers 422 with reason "empty" when no scene with text matches the options.
 */
export default defineEventHandler(async (event) => {
  const model = await loadExportModel(event, { content: true })
  const body = await exportParseBody(event, schema, 12 * 1024 * 1024)
  const ms = buildManuscript(model, body)
  if (!ms.sceneCount) throw createError({ statusCode: 422, message: 'No scene with text matches these options', data: { reason: 'empty' } })

  const name = (extension: string) => exportFileName(ms.title, model.day, extension)
  let file: { name: string, mime: string, data: Uint8Array | Buffer | string }
  if (body.format === 'docx') file = { name: name('docx'), mime: EXPORT_MIME.docx, data: await manuscriptDocx(ms) }
  else if (body.format === 'epub') {
    const bytes = body.cover ? Buffer.from(body.cover.replace(/^data:[^,]*,/, ''), 'base64') : null
    const type = bytes ? documentImageType(bytes) : null
    if (bytes && type !== 'jpg' && type !== 'png') throw createError({ statusCode: 415, message: 'The cover must be a JPEG or PNG image' })
    const cover = bytes && (type === 'jpg' || type === 'png') ? { data: new Uint8Array(bytes), type } : undefined
    file = { name: name('epub'), mime: EXPORT_MIME.epub, data: manuscriptEpub(ms, model.project.id, model.t, cover) }
  }
  else file = { name: name('txt'), mime: EXPORT_MIME.txt, data: manuscriptTxt(ms) }

  await recordExport(model, 'manuscript', body.format)
  return sendExportFile(event, file.name, file.mime, file.data)
})
