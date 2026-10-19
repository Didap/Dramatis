import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { exportParseBody } from '../../../../utils/export/limits'

/** The primary images converted by the browser travel in the body: a few megabytes each at most. */
const MAX_BODY_BYTES = 100 * 1024 * 1024
const MAX_IMAGES = 500

const schema = z.object({
  includeImages: z.boolean().default(true),
  /**
   * Images Word cannot read (WebP), converted by the browser to JPEG or PNG, by media id. Base64, with or
   * without the data: prefix, and the size in pixels.
   */
  images: z.record(z.string().max(40), z.object({
    data: z.string().max(12_000_000),
    width: z.number().int().min(1).max(20_000),
    height: z.number().int().min(1).max(20_000),
  })).refine(images => Object.keys(images).length <= MAX_IMAGES, 'Too many images').optional(),
})

/** The project document (story bible or narrative design document) as DOCX (appendix D.4). */
export default defineEventHandler(async (event) => {
  const model = await loadExportModel(event, { content: true })
  const body = await exportParseBody(event, schema, MAX_BODY_BYTES)

  const images = new Map<string, DocumentImage>()
  if (body.includeImages) {
    // The primary image of each entity: the first by position.
    const primary = new Map<string, string>()
    for (const image of [...model.bundle.images].sort((a, b) => a.position - b.position)) {
      const owner = `${image.ownerType}:${image.ownerId}`
      if (!primary.has(owner)) primary.set(owner, image.mediaId)
    }
    const ids = [...new Set(primary.values())]
    const rows = ids.length
      ? await useDb()
          .select({ id: tables.media.id, data: tables.media.data, width: tables.media.width, height: tables.media.height })
          .from(tables.media)
          .where(and(eq(tables.media.ownerId, model.user.id), inArray(tables.media.id, ids)))
      : []
    for (const row of rows) {
      const type = documentImageType(row.data)
      if (type && row.width && row.height) {
        images.set(row.id, { data: row.data, type, width: row.width, height: row.height })
        continue
      }
      const converted = body.images?.[row.id]
      if (!converted) continue
      const data = Buffer.from(converted.data.replace(/^data:[^,]*,/, ''), 'base64')
      const convertedType = documentImageType(data)
      if (convertedType) images.set(row.id, { data, type: convertedType, width: converted.width, height: converted.height })
    }
  }

  const file = await projectDocumentDocx(model, images)
  await recordExport(model, 'document', 'docx')
  const name = exportFileName(model.project.title, model.day, 'docx', model.t(`export.file.document.${model.project.kind}`))
  return sendExportFile(event, name, EXPORT_MIME.docx, file)
})
