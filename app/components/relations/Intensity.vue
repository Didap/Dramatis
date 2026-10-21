<script setup lang="ts">
import type { RelationIntensity } from '#shared/types/domain'

/**
 * How strong a bond is, as one side feels it, from 1 to 10: a strip of ten cells filled up to the
 * value, with the number beside it. It is a slider: a tap or a drag along the strip sets it (saved
 * when the pointer lets go), the arrow keys move it by one, Page Up and Page Down by three, Home and
 * End go to 1 and 10.
 */
defineProps<{ label: string }>()
const model = defineModel<RelationIntensity>({ required: true })

const { t } = useI18n()
const uid = useId()
const MAX = 10
const strip = ref<HTMLElement | null>(null)
/** The value under the pointer while it is down, saved when it lets go. */
const live = ref<RelationIntensity | null>(null)
const shown = computed(() => live.value ?? model.value)

const clamp = (n: number) => Math.min(MAX, Math.max(1, Math.round(n))) as RelationIntensity

function under(event: PointerEvent) {
  const box = strip.value!.getBoundingClientRect()
  return clamp(Math.ceil(((event.clientX - box.left) / box.width) * MAX))
}

function onPointerDown(event: PointerEvent) {
  // Ctrl and a click is the context menu on a Mac: its release never reaches the page.
  if (event.button !== 0 || event.ctrlKey) return
  strip.value?.setPointerCapture(event.pointerId)
  live.value = under(event)
}

function onPointerMove(event: PointerEvent) {
  if (live.value === null) return
  // No button held: the release was lost; the value goes back to the saved one.
  live.value = event.buttons ? under(event) : null
}

function onPointerUp() {
  if (live.value !== null && live.value !== model.value) model.value = live.value
  live.value = null
}

const KEYS: Record<string, (n: number) => number> = {
  ArrowRight: n => n + 1,
  ArrowUp: n => n + 1,
  ArrowLeft: n => n - 1,
  ArrowDown: n => n - 1,
  PageUp: n => n + 3,
  PageDown: n => n - 3,
  Home: () => 1,
  End: () => MAX,
}

function onKeydown(event: KeyboardEvent) {
  const move = KEYS[event.key]
  if (!move) return
  event.preventDefault()
  const value = clamp(move(model.value))
  if (value !== model.value) model.value = value
}
</script>

<template>
  <div class="min-w-0">
    <div class="mb-1.5 flex items-baseline justify-between gap-3">
      <span :id="`${uid}-label`" class="text-sm font-medium text-default">{{ label }}</span>
      <span class="tabular shrink-0 text-sm text-muted" aria-hidden="true"><span class="font-semibold text-highlighted">{{ shown }}</span>/{{ MAX }}</span>
    </div>
    <div
      ref="strip"
      role="slider"
      tabindex="0"
      class="intensity-strip"
      :aria-labelledby="`${uid}-label`"
      aria-valuemin="1"
      :aria-valuemax="MAX"
      :aria-valuenow="shown"
      :aria-valuetext="t('relations.intensity.valueText', { n: shown })"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="live = null"
      @keydown="onKeydown"
    >
      <span v-for="n in MAX" :key="n" class="intensity-strip__cell" :class="{ 'is-on': n <= shown }" />
    </div>
  </div>
</template>

<style>
/* A meter you can set: the empty cells are the track (bg-accented), the filled ones the author's hand. */
.intensity-strip {
  display: flex;
  gap: 3px;
  height: 1.75rem;
  padding: 0.3125rem 0;
  border-radius: 4.5px;
  cursor: pointer;
  user-select: none;
  /* A sideways drag sets the value; an upward or downward one still scrolls. */
  touch-action: pan-y;
}
.intensity-strip:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}
.intensity-strip__cell {
  flex: 1;
  border-radius: 2px;
  background: var(--ui-bg-accented);
  transition: background-color 120ms var(--ease-out-expo);
}
.intensity-strip__cell.is-on {
  background: var(--ui-primary);
}
@media (pointer: coarse) {
  .intensity-strip {
    height: 2.75rem;
    padding: 0.5rem 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .intensity-strip__cell {
    transition: none;
  }
}
</style>
