import { MAX_UPLOAD_BYTES } from '#shared/utils/constants'

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * Uploads an image: multipart field "file" (resized on the client to at most 2400 px), optional
 * "thumb" (at most 320 px), "projectId", "width", "height". Attach it to an entity by creating an
 * item of the `images` collection with the returned id as mediaId.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file')
  if (!file?.data?.length || !file.type) throw createError({ statusCode: 400, message: 'No file' })
  if (!ALLOWED.has(file.type)) throw createError({ statusCode: 415, message: 'Use JPEG, PNG or WebP images' })
  if (file.data.length > MAX_UPLOAD_BYTES) throw createError({ statusCode: 413, message: 'The image is too large' })
  const thumb = parts?.find(p => p.name === 'thumb')
  if (thumb && (!ALLOWED.has(thumb.type ?? '') || thumb.data.length > MAX_UPLOAD_BYTES)) throw createError({ statusCode: 415, message: 'Invalid thumbnail' })

  const field = (name: string) => parts?.find(p => p.name === name)?.data.toString('utf8')
  const projectId = field('projectId')
  if (projectId) await requireProject(event, projectId)
  const width = Number.parseInt(field('width') ?? '0', 10) || 0
  const height = Number.parseInt(field('height') ?? '0', 10) || 0

  const [row] = await useDb()
    .insert(tables.media)
    .values({ ownerId: user.id, projectId: projectId || null, mime: file.type, data: file.data, thumb: thumb?.data ?? null, width, height, size: file.data.length })
    .returning({ id: tables.media.id })
  return { id: row!.id, url: `/api/media/${row!.id}`, thumbUrl: `/api/media/${row!.id}?size=thumb`, width, height }
})
