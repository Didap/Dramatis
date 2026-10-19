<script setup lang="ts">
import type { SceneStatus } from '#shared/types/domain'
import { SCENE_STATUSES } from '#shared/utils/constants'

/**
 * The four scene statuses as one segmented control of glyphs with labels (DESIGN.md "Status control"):
 * one tap, states told apart by shape. Arrow keys move between them.
 */
const model = defineModel<SceneStatus>({ required: true })
const { t } = useI18n()
const { label } = useEnums()
const buttons = useTemplateRef<HTMLButtonElement[]>('buttons')

function onKeydown(event: KeyboardEvent, index: number) {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
  if (!step) return
  event.preventDefault()
  const next = (index + step + SCENE_STATUSES.length) % SCENE_STATUSES.length
  model.value = SCENE_STATUSES[next]!
  buttons.value?.[next]?.focus()
}
</script>

<template>
  <div class="grid grid-cols-4 gap-1" role="radiogroup" :aria-label="t('editor.details.status')">
    <button
      v-for="(status, index) in SCENE_STATUSES"
      ref="buttons"
      :key="status"
      type="button"
      role="radio"
      :aria-checked="model === status"
      :tabindex="model === status ? 0 : -1"
      class="flex min-h-12 flex-col items-center justify-center gap-1 rounded-[calc(var(--ui-radius)*1.5)] px-1 py-1.5 text-xs ring-1 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
      :class="model === status ? 'bg-elevated font-medium text-highlighted ring-(--ui-primary)' : 'text-muted ring-(--ui-border) hover:bg-elevated/60 hover:text-highlighted'"
      @click="model = status"
      @keydown="onKeydown($event, index)"
    >
      <UIcon :name="statusIcon('scene', status)" class="size-4" :style="{ color: `var(--status-${status})` }" aria-hidden="true" />
      <span class="leading-none">{{ label('sceneStatus', status) }}</span>
    </button>
  </div>
</template>
