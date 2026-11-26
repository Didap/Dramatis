<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { StoryMap } from '#shared/types/entities'

/**
 * A map of places (VRS-598, DESIGN.md "Maps of places"): the author's picture with a pin for each
 * place on it. A click on the picture, or `addPin()` from the page's button, asks which place is there:
 * one of the places already written, or a new one. A pin leads to its place; it moves by dragging or
 * with the arrow keys, and its menu (or Delete) takes it off. Pins sit at fractions of the picture,
 * so they keep their spot at any width.
 */
const props = defineProps<{ map: StoryMap }>()

const store = useProjectStore()
const { t } = useI18n()
const toast = useToast()

const PIN = 'location:'
type At = { x: number, y: number }

const pins = computed(() => Object.entries(props.map.nodes)
  .filter(([key]) => key.startsWith(PIN))
  .map(([key, at]) => ({ key, id: key.slice(PIN.length), at, place: store.get('locations', key.slice(PIN.length)) }))
  .filter(pin => !!pin.place))
const placed = computed(() => pins.value.map(pin => pin.id))

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const percent = (value: number) => `${(value * 100).toFixed(3)}%`
const nodesNow = () => store.get('maps', props.map.id)?.nodes ?? props.map.nodes

const frame = useTemplateRef<HTMLElement>('frame')

/** The point of the picture under the pointer. */
function pointOf(event: { clientX: number, clientY: number }): At {
  const box = frame.value!.getBoundingClientRect()
  return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) }
}

async function focusPin(id: string) {
  await nextTick()
  frame.value?.querySelector<HTMLElement>(`[data-pin="${id}"] a`)?.focus()
}

// ---------------------------------------------------------------- which place is here

const asking = reactive({ open: false, at: { x: 0.5, y: 0.5 } as At })
const anchor = useTemplateRef<HTMLElement>('anchor')
const picked = ref<string | null>(null)

function ask(at: At) {
  asking.at = at
  picked.value = null
  asking.open = true
}

function onFrameClick(event: MouseEvent) {
  if (dragged || (event.target as HTMLElement).closest('[data-pin]')) return
  ask(pointOf(event))
}

watch(picked, async (id) => {
  if (!id) return
  asking.open = false
  try {
    await store.update('maps', props.map.id, { nodes: { ...nodesNow(), [`${PIN}${id}`]: asking.at } })
  }
  catch {
    return
  }
  void focusPin(id)
})

// ---------------------------------------------------------------- moving and removing pins

/** The pin being dragged and where it is now (saved on release). */
const dragging = ref<{ id: string, at: At } | null>(null)
let start: { x: number, y: number } | null = null
/** A drag just ended: the click that follows neither opens the place nor asks for a new one. */
let dragged = false

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  start = { x: event.clientX, y: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent, id: string) {
  if (!start) return
  if (!dragging.value && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return
  dragging.value = { id, at: pointOf(event) }
}

async function onPointerUp(id: string) {
  start = null
  const moved = dragging.value
  dragging.value = null
  if (!moved) return
  dragged = true
  setTimeout(() => {
    dragged = false
  })
  await store.update('maps', props.map.id, { nodes: { ...nodesNow(), [`${PIN}${id}`]: moved.at } }).catch(() => {})
}

function onPinClick(event: MouseEvent) {
  if (dragged) event.preventDefault()
}

const STEP = 0.01
const LONG_STEP = 0.05
const KEYS: Record<string, At> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }

function onPinKeydown(event: KeyboardEvent, pin: { id: string, at: At }) {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    void unpin(pin.id)
    return
  }
  const direction = KEYS[event.key]
  if (!direction) return
  event.preventDefault()
  const step = event.shiftKey ? LONG_STEP : STEP
  const at = { x: clamp(pin.at.x + direction.x * step), y: clamp(pin.at.y + direction.y * step) }
  store.patchSoon('maps', props.map.id, { nodes: { ...nodesNow(), [`${PIN}${pin.id}`]: at } })
}

async function unpin(id: string) {
  const key = `${PIN}${id}`
  const at = nodesNow()[key]
  const name = store.get('locations', id)?.name ?? ''
  const { [key]: _gone, ...rest } = nodesNow()
  try {
    await store.update('maps', props.map.id, { nodes: rest })
  }
  catch {
    return
  }
  frame.value?.focus()
  toast.add({
    title: t('locations.map.unpinned', { name }),
    icon: 'i-lucide-map-pin-off',
    actions: [{
      label: t('common.actions.undo'),
      onClick: () => {
        if (at) void store.update('maps', props.map.id, { nodes: { ...nodesNow(), [key]: at } }).then(() => focusPin(id)).catch(() => {})
      },
    }],
  })
}

const menuOf = (pin: { id: string }): DropdownMenuItem[][] => [[
  { label: t('locations.map.open'), icon: 'i-lucide-arrow-right', to: store.refPath({ type: 'location', id: pin.id }) },
  { label: t('locations.map.unpin'), icon: 'i-lucide-map-pin-off', onSelect: () => void unpin(pin.id) },
]]

const where = (pin: { id: string, at: At }) => (dragging.value?.id === pin.id ? dragging.value.at : pin.at)

defineExpose({
  /** "Aggiungi un segnaposto": the same question, for the middle of the picture (then the arrow keys). */
  addPin: () => ask({ x: 0.5, y: 0.5 }),
})
</script>

<template>
  <div>
    <p id="place-map-hint" class="sr-only">{{ t('locations.map.pinHint') }}</p>
    <!-- The picture: a click asks which place is there. tabindex -1: focus can rest here after a pin goes. -->
    <div
      ref="frame"
      class="relative cursor-crosshair touch-pan-y select-none overflow-hidden rounded-[calc(var(--ui-radius)*2)] border border-default bg-muted outline-none"
      tabindex="-1"
      @click="onFrameClick"
    >
      <img :src="`/api/media/${map.settings.image}`" :alt="map.name" class="block h-auto w-full" draggable="false">

      <div
        v-for="pin in pins"
        :key="pin.key"
        :data-pin="pin.id"
        class="group/pin absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center"
        :style="{ left: percent(where(pin).x), top: percent(where(pin).y) }"
      >
        <span class="flex items-center gap-0.5 rounded-[calc(var(--ui-radius)*1.5)] bg-(--ui-bg-floating) py-0.5 ps-2 pe-0.5 shadow-(--shadow-floating) ring-1 ring-(--ui-border)">
          <NuxtLink
            :to="store.refPath({ type: 'location', id: pin.id })"
            class="voice-author cursor-grab touch-none whitespace-nowrap text-sm font-semibold text-highlighted active:cursor-grabbing max-lg:py-2.5"
            draggable="false"
            aria-describedby="place-map-hint"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove($event, pin.id)"
            @pointerup="onPointerUp(pin.id)"
            @pointercancel="onPointerUp(pin.id)"
            @click="onPinClick"
            @keydown="onPinKeydown($event, pin)"
          >{{ pin.place!.name }}</NuxtLink>
          <UDropdownMenu :items="menuOf(pin)" :content="{ align: 'start' }">
            <UButton
              icon="i-lucide-ellipsis"
              size="xs"
              color="neutral"
              variant="ghost"
              class="max-lg:size-11 max-lg:justify-center lg:opacity-0 lg:group-hover/pin:opacity-100 lg:focus-visible:opacity-100 lg:data-[state=open]:opacity-100"
              :aria-label="t('locations.map.pinActions', { name: pin.place!.name })"
              @click.stop
            />
          </UDropdownMenu>
        </span>
        <UIcon name="i-lucide-map-pin" class="-mt-0.5 size-6 text-primary drop-shadow-sm" aria-hidden="true" />
      </div>

      <!-- Where the question points: the popover hangs from here. -->
      <span ref="anchor" class="pointer-events-none absolute size-0" :style="{ left: percent(asking.at.x), top: percent(asking.at.y) }" aria-hidden="true" />
    </div>

    <UPopover v-model:open="asking.open" :reference="anchor ?? undefined" :content="{ side: 'bottom', align: 'start', sideOffset: 8, collisionPadding: 12 }">
      <template #content>
        <div class="w-72 max-w-[calc(100vw-2rem)] space-y-2 p-3">
          <p class="text-sm font-medium text-default">{{ t('locations.map.whichPlace') }}</p>
          <DEntityPicker
            v-model="picked"
            type="location"
            creatable
            :exclude="placed"
            :placeholder="t('locations.map.pick')"
            :aria-label="t('locations.map.whichPlace')"
            class="w-full"
          />
        </div>
      </template>
    </UPopover>
  </div>
</template>
