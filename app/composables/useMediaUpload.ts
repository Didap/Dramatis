import type { ImageOwnerType } from '#shared/types/domain'
import type { EntityImageRow } from '#shared/types/entities'
import { IMAGE_MAX_SIDE, THUMB_MAX_SIDE } from '#shared/utils/constants'

interface UploadResult {
  id: string
  url: string
  thumbUrl: string
  width: number
  height: number
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unreadable image'))
    }
    img.src = url
  })
}

async function resize(img: HTMLImageElement, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Encoding failed'))), 'image/webp', quality),
  )
  return { blob, width, height }
}

/**
 * Uploads images: resized on the client (longest side 2400 px, WebP) with a 320 px thumbnail.
 * `upload` returns the media; `attach` also adds it to an entity's images (first = primary).
 */
export function useMediaUpload() {
  const uploading = ref(false)
  const store = useProjectStore()

  async function upload(file: File, options: { projectId?: string } = {}): Promise<UploadResult> {
    uploading.value = true
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw Object.assign(new Error('Unsupported'), { statusCode: 415 })
      if (file.size > 10 * 1024 * 1024) throw Object.assign(new Error('Too large'), { statusCode: 413 })
      const img = await loadImage(file)
      const full = await resize(img, IMAGE_MAX_SIDE, 0.88)
      const thumb = await resize(img, THUMB_MAX_SIDE, 0.82)
      const form = new FormData()
      form.append('file', new File([full.blob], 'image.webp', { type: 'image/webp' }))
      form.append('thumb', new File([thumb.blob], 'thumb.webp', { type: 'image/webp' }))
      form.append('width', String(full.width))
      form.append('height', String(full.height))
      if (options.projectId) form.append('projectId', options.projectId)
      return await $fetch<UploadResult>('/api/media', { method: 'POST', body: form })
    }
    catch (error) {
      notifyError(error)
      throw error
    }
    finally {
      uploading.value = false
    }
  }

  /** Uploads a file and adds it to an entity's gallery; `primary` puts it first. */
  async function attach(file: File, owner: { type: ImageOwnerType, id: string }, options: { primary?: boolean, caption?: string } = {}): Promise<EntityImageRow> {
    const media = await upload(file, { projectId: store.projectId })
    const image = await store.create('images', { ownerType: owner.type, ownerId: owner.id, mediaId: media.id, caption: options.caption ?? '' })
    if (options.primary) {
      const others = store.imagesOf(owner.type, owner.id).filter(i => i.id !== image.id).map(i => i.id)
      await store.reorder('images', [image.id, ...others])
    }
    return image
  }

  return { upload, attach, uploading }
}

/** URL of an uploaded image, or of its thumbnail. */
export function mediaUrl(id: string | null | undefined, size: 'full' | 'thumb' = 'full'): string | undefined {
  if (!id) return undefined
  return size === 'thumb' ? `/api/media/${id}?size=thumb` : `/api/media/${id}`
}
