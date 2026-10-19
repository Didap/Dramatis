<script setup lang="ts">
/**
 * The cover of the EPUB (P1): an image chosen on this device, turned into a JPEG of at most 2400 pixels
 * on the long side, which travels with the export and is not kept.
 */
export interface ExportCover {
  data: string
  name: string
}

const cover = defineModel<ExportCover | null>({ default: null })

const { t } = useI18n()
const input = ref<HTMLInputElement | null>(null)
const failed = ref(false)
const busy = ref(false)

async function onChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  failed.value = false
  busy.value = true
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')!
    // JPEG has no transparency: the paper goes behind the picture.
    context.fillStyle = 'white'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    cover.value = { data: canvas.toDataURL('image/jpeg', 0.9), name: file.name }
  }
  catch {
    failed.value = true
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="export-cover">
    <p class="mb-1.5 text-sm font-medium text-highlighted">{{ t('export.options.cover') }}</p>
    <div v-if="cover" class="flex items-center gap-3">
      <img :src="cover.data" :alt="t('export.options.coverPreview')" class="h-20 w-auto rounded-[1.5px] shadow-(--shadow-floating)">
      <div class="min-w-0">
        <p class="truncate text-sm text-toned">{{ cover.name }}</p>
        <UButton variant="link" color="neutral" size="sm" icon="i-lucide-x" :label="t('export.options.coverRemove')" class="min-h-11 px-0 sm:min-h-0" @click="cover = null" />
      </div>
    </div>
    <template v-else>
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-image-plus"
        :loading="busy"
        :label="t('export.options.coverChoose')"
        class="min-h-11 sm:min-h-0"
        @click="input?.click()"
      />
      <p class="mt-1.5 text-sm text-pretty text-muted">{{ t('export.options.coverHint') }}</p>
    </template>
    <p v-if="failed" class="mt-1.5 flex items-center gap-1.5 text-sm text-error">
      <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />{{ t('export.options.coverFailed') }}
    </p>
    <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" tabindex="-1" aria-hidden="true" @change="onChange">
  </div>
</template>
