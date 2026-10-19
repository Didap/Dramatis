<script setup lang="ts">
import type { ImageOwnerType } from '#shared/types/domain'

/**
 * The images of an entity: add (several at once), caption, alternative text, make primary,
 * reorder (with buttons, no drag needed), move to the trash. The first image is the primary one.
 */
const props = defineProps<{
  ownerType: ImageOwnerType
  ownerId: string
  name: string
}>()

const { t } = useI18n()
const store = useProjectStore()
const { attach, uploading } = useMediaUpload()
const input = ref<HTMLInputElement | null>(null)
const open = ref<string | null>(null)

const images = computed(() => store.imagesOf(props.ownerType, props.ownerId))
const dragging = ref(false)

async function onDrop(event: DragEvent) {
  dragging.value = false
  const files = [...(event.dataTransfer?.files ?? [])].filter(f => f.type.startsWith('image/'))
  for (const file of files) await attach(file, { type: props.ownerType, id: props.ownerId }).catch(() => {})
}

async function onChange(event: Event) {
  const target = event.target as HTMLInputElement
  const files = [...(target.files ?? [])]
  target.value = ''
  for (const file of files) await attach(file, { type: props.ownerType, id: props.ownerId }).catch(() => {})
}

function move(id: string, delta: number) {
  const ids = images.value.map(i => i.id)
  const from = ids.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return
  ids.splice(to, 0, ids.splice(from, 1)[0]!)
  void store.reorder('images', ids)
}

function makePrimary(id: string) {
  const ids = images.value.map(i => i.id).filter(i => i !== id)
  void store.reorder('images', [id, ...ids])
}
</script>

<template>
  <section
    class="d-image-gallery rounded-[calc(var(--ui-radius)*2)] transition-shadow"
    :class="dragging ? 'ring-2 ring-(--ui-primary) ring-offset-4 ring-offset-(--ui-bg)' : ''"
    @dragover.prevent="dragging = true"
    @dragleave.self="dragging = false"
    @drop.prevent="onDrop"
  >
    <ul v-if="images.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="list">
      <li v-for="(image, index) in images" :key="image.id" class="group relative">
        <button
          type="button"
          class="block aspect-[4/5] w-full overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
          :aria-label="image.caption || t('common.image.open', { n: index + 1 })"
          @click="open = image.id"
        >
          <img :src="mediaUrl(image.mediaId, 'thumb')" :alt="image.alt || image.caption || name" class="size-full object-cover" loading="lazy">
        </button>
        <p v-if="index === 0" class="mt-1.5 text-xs font-medium text-toned">{{ t('common.image.primary') }}</p>
        <p v-else-if="image.caption" class="mt-1.5 truncate text-xs text-muted">{{ image.caption }}</p>

        <USlideover
          :open="open === image.id"
          :title="image.caption || name"
          @update:open="(v: boolean) => { if (!v) open = null }"
        >
          <template #body>
            <div class="space-y-4">
              <img :src="mediaUrl(image.mediaId)" :alt="image.alt || image.caption || name" class="w-full rounded-lg bg-muted">
              <UFormField :label="t('common.image.caption')">
                <UInput :model-value="image.caption" class="w-full" @update:model-value="(v: string | number) => store.patchSoon('images', image.id, { caption: String(v) })" />
              </UFormField>
              <UFormField :label="t('common.image.alt')" :hint="t('common.image.altHint')">
                <UInput :model-value="image.alt" class="w-full" @update:model-value="(v: string | number) => store.patchSoon('images', image.id, { alt: String(v) })" />
              </UFormField>
              <div class="flex flex-wrap gap-2">
                <UButton v-if="index > 0" color="neutral" variant="outline" icon="i-lucide-star" :label="t('common.image.makePrimary')" @click="makePrimary(image.id)" />
                <UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" :label="t('common.actions.moveUp')" :disabled="index === 0" @click="move(image.id, -1)" />
                <UButton color="neutral" variant="outline" icon="i-lucide-arrow-right" :label="t('common.actions.moveDown')" :disabled="index === images.length - 1" @click="move(image.id, 1)" />
                <UButton color="error" variant="soft" icon="i-lucide-trash-2" :label="t('common.actions.delete')" @click="() => { open = null; store.remove('images', image.id) }" />
              </div>
            </div>
          </template>
        </USlideover>
      </li>
    </ul>
    <UButton
      class="mt-3"
      color="neutral"
      variant="outline"
      icon="i-lucide-image-plus"
      :loading="uploading"
      :label="t('common.image.add')"
      @click="input?.click()"
    />
    <input ref="input" type="file" accept="image/png,image/jpeg,image/webp" multiple class="sr-only" tabindex="-1" @change="onChange">
  </section>
</template>
