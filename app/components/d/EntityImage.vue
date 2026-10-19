<script setup lang="ts">
import type { ImageOwnerType } from '#shared/types/domain'

/**
 * The primary image of an entity (portrait, place, object), with upload, replace and remove.
 * Replacing adds the new image first in the gallery; removing moves it to the trash.
 */
const props = withDefaults(defineProps<{
  ownerType: ImageOwnerType
  ownerId: string
  name: string
  color?: string | null
  icon?: string
  size?: 'md' | 'lg' | 'xl'
  shape?: 'portrait' | 'square' | 'round'
}>(), { color: null, icon: undefined, size: 'xl', shape: 'portrait' })

const { t } = useI18n()
const store = useProjectStore()
const { attach, uploading } = useMediaUpload()
const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

const primary = computed(() => store.imagesOf(props.ownerType, props.ownerId)[0] ?? null)

async function handle(file: File | undefined | null) {
  if (!file) return
  await attach(file, { type: props.ownerType, id: props.ownerId }, { primary: true }).catch(() => {})
}

function onChange(event: Event) {
  const target = event.target as HTMLInputElement
  void handle(target.files?.[0])
  target.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void handle(event.dataTransfer?.files?.[0])
}

const items = computed(() => [
  [{ label: primary.value ? t('common.image.change') : t('common.image.upload'), icon: 'i-lucide-image-up', onSelect: () => input.value?.click() }],
  ...(primary.value ? [[{ label: t('common.image.remove'), icon: 'i-lucide-image-off', color: 'error' as const, onSelect: () => { store.remove('images', primary.value!.id) } }]] : []),
])
</script>

<template>
  <div
    class="d-entity-image group relative inline-flex"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <UDropdownMenu :items="items">
      <button
        type="button"
        class="relative rounded-[2px] outline-none"
        :class="dragging ? 'ring-2 ring-(--ui-primary)' : ''"
        :aria-label="primary ? t('common.image.change') : t('common.image.upload')"
      >
        <DEntityAvatar :name="name" :image-id="primary?.mediaId" :color="color" :icon="icon" :size="size" :shape="shape" :alt="primary?.alt || primary?.caption || name" />
        <span
          class="absolute inset-0 grid place-items-center rounded-[2px] bg-inverted/40 text-inverted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          aria-hidden="true"
        >
          <UIcon :name="uploading ? 'i-lucide-loader-circle' : 'i-lucide-camera'" class="size-5" :class="uploading ? 'animate-spin' : ''" />
        </span>
      </button>
    </UDropdownMenu>
    <input ref="input" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" tabindex="-1" @change="onChange">
  </div>
</template>
