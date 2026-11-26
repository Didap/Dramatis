<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { StoryMap } from '#shared/types/entities'

/**
 * A map of places (VRS-598, DESIGN.md "Maps of places"): the author's picture with a pin for each
 * place on it. A click on the picture, or `addPin()` from the page's button, asks which place is there:
 * one of the places already written, or a new one. A pin leads to its place; it moves by dragging (a
 * mouse or a pen), with the arrow keys, or with "Sposta il segnaposto" then a tap (on a phone a swipe
 * over a pin scrolls the page), and its menu (or Delete) takes it off. Pins sit at fractions of the
 * picture, so they keep their spot at any width; near an edge they reach past the picture.
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
/** What had the keyboard when the question opened: it gets it back when the question closes unanswered. */
let opener: HTMLElement | null = null

function ask(at: At) {
  asking.at = at
  picked.value = null
  opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  asking.open = true
}

const askContent = {
  side: 'bottom' as const,
  align: 'start' as const,
  sideOffset: 8,
  collisionPadding: 12,
  // The question hangs from a point of the picture, not from a button: focus goes back by hand.
  onCloseAutoFocus: (event: Event) => {
    event.preventDefault()
    if (!picked.value) (opener?.isConnected ? opener : frame.value)?.focus()
  },
}

function onFrameClick(event: MouseEvent) {
  if (dragged || (event.target as HTMLElement).closest('[data-pin]')) return
  if (moving.value) {
    void place(moving.value, pointOf(event))
    moving.value = null
    return
  }
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

function place(id: string, at: At) {
  return store.update('maps', props.map.id, { nodes: { ...nodesNow(), [`${PIN}${id}`]: at } }).catch(() => {})
}

/** "Sposta il segnaposto": the next click or tap on the picture puts this pin there. */
const moving = ref<string | null>(null)

/** The pin being dragged and where it is now (saved on release). */
const dragging = ref<{ id: string, at: At } | null>(null)
/** Where the drag started, and how far the pointer was from the pin's spot (the pin does not jump to it). */
let start: { x: number, y: number, offset: At } | null = null
/** A drag just ended: the click that follows neither opens the place nor asks for a new one. */
let dragged = false

function onPointerDown(event: PointerEvent, pin: { at: At }) {
  // A finger scrolls the page; touch moves a pin with "Sposta il segnaposto".
  if (event.button !== 0 || event.pointerType === 'touch') return
  const point = pointOf(event)
  start = { x: event.clientX, y: event.clientY, offset: { x: point.x - pin.at.x, y: point.y - pin.at.y } }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent, id: string) {
  if (!start) return
  if (!dragging.value && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return
  const point = pointOf(event)
  dragging.value = { id, at: { x: clamp(point.x - start.offset.x), y: clamp(point.y - start.offset.y) } }
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
  await place(id, moved.at)
}

/** The system took the pointer away (a call, a gesture): the pin goes back where it was. */
function onPointerCancel() {
  start = null
  dragging.value = null
}

function onPinClick(event: MouseEvent) {
  if (dragged) event.preventDefault()
}

const STEP = 0.01
const LONG_STEP = 0.05
const KEYS: Record<string, At> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }

function onPinKeydown(event: KeyboardEvent, pin: { id: string, at: At }) {
  // Alt, Ctrl and ⌘ with an arrow are the browser's (back, forward): left alone.
  if (event.altKey || event.ctrlKey || event.metaKey) return
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
  { label: t('locations.map.move'), icon: 'i-lucide-move', onSelect: () => { moving.value = pin.id } },
  { label: t('locations.map.unpin'), icon: 'i-lucide-map-pin-off', onSelect: () => void unpin(pin.id) },
]]
const movingName = computed(() => (moving.value ? store.get('locations', moving.value)?.name ?? '' : ''))

const where = (pin: { id: string, at: At }) => (dragging.value?.id === pin.id ? dragging.value.at : pin.at)

defineExpose({
  /** "Aggiungi un segnaposto": the same question, for the middle of the picture (then the arrow keys). */
  addPin: () => ask({ x: 0.5, y: 0.5 }),
})
</script>

<template>
  <div>
    <p id="place-map-hint" class="sr-only">{{ t('locations.map.pinHint') }}</p>
    <p v-if="moving" class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-default" role="status">
      <UIcon name="i-lucide-move" class="size-4 text-muted" aria-hidden="true" />
      {{ t('locations.map.movePrompt', { name: movingName }) }}
      <UButton size="xs" color="neutral" variant="link" class="max-lg:min-h-11" :label="t('locations.map.cancelMove')" @click="moving = null" />
    </p>
    <!--
      The picture: a click asks which place is there. tabindex -1: focus can rest here after a pin goes.
      Not clipped: a pin near the top or a side reaches past the picture rather than out of sight.
    -->
    <div
      ref="frame"
      class="relative cursor-crosshair select-none rounded-[calc(var(--ui-radius)*2)] outline-none focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
      tabindex="-1"
      @click="onFrameClick"
    >
      <img :src="`/api/media/${map.settings.image}`" :alt="map.name" class="block h-auto w-full rounded-[calc(var(--ui-radius)*2)] border border-default bg-muted" draggable="false">

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
            class="voice-author inline-flex cursor-grab items-center whitespace-nowrap text-sm font-semibold text-highlighted active:cursor-grabbing max-lg:min-h-11 max-lg:min-w-11"
            draggable="false"
            aria-describedby="place-map-hint"
            @pointerdown="onPointerDown($event, pin)"
            @pointermove="onPointerMove($event, pin.id)"
            @pointerup="onPointerUp(pin.id)"
            @pointercancel="onPointerCancel"
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

    <UPopover v-model:open="asking.open" :reference="anchor ?? undefined" :content="askContent">
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
