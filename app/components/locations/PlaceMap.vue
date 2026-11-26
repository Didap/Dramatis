<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { EntityRef } from '#shared/types/domain'
import type { StoryMap } from '#shared/types/entities'
import { mentionId, parseMentionId } from '#shared/utils/richtext'

/**
 * A map of places (VRS-598, DESIGN.md "Maps of places"): the author's picture with a pin for each
 * place on it. A click on the picture, or `addPin()` from the page's button, asks which place is there:
 * one of the places already written, or a new one. A pin leads to its place; it moves by dragging (a
 * mouse or a pen), with the arrow keys, or with "Sposta il segnaposto" then a tap (on a phone a swipe
 * over a pin scrolls the page), and its menu (or Delete) takes it off. Pins sit at fractions of the
 * picture, so they keep their spot at any width; near an edge they reach past the picture.
 * In a game with a bestiary (VRS-683) a pin can also be a collectible, with its own icon.
 */
const props = defineProps<{ map: StoryMap }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const toast = useToast()

type At = { x: number, y: number }
/** A pin, keyed in the map's nodes as everywhere ("location:<id>", "object:<id>"): a purge takes its pins off by it. */
interface Pin { key: string, ref: EntityRef, at: At, name: string, icon: string }

/** What a pin stands for (its name and its icon), or null when it is gone or is neither a place nor an object. */
function pinOf(ref: EntityRef | null): { name: string, icon: string } | null {
  if (ref?.type === 'location') {
    const place = store.get('locations', ref.id)
    return place ? { name: place.name, icon: REF_ICONS.location! } : null
  }
  if (ref?.type === 'object') {
    const object = store.get('objects', ref.id)
    return object ? { name: object.name, icon: SECTION_ICONS[OBJECT_SHELVES[object.category]] } : null
  }
  return null
}

const pins = computed<Pin[]>(() => Object.entries(props.map.nodes).flatMap(([key, at]) => {
  const ref = parseMentionId(key)
  const shown = pinOf(ref)
  return ref && shown ? [{ key, ref, at, ...shown }] : []
}))
const placedOf = (type: EntityRef['type']) => pins.value.filter(pin => pin.ref.type === type).map(pin => pin.ref.id)
const placedPlaces = computed(() => placedOf('location'))
/** The objects the picker leaves out: those on the map and those that are not collectibles. */
const notOffered = computed(() => [...placedOf('object'), ...store.rows.objects.filter(o => o.category !== 'collectible').map(o => o.id)])

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const percent = (value: number) => `${(value * 100).toFixed(3)}%`
const nodesNow = () => store.get('maps', props.map.id)?.nodes ?? props.map.nodes
/** The map's nodes with this pin at this spot. */
const withPin = (key: string, at: At) => ({ nodes: { ...nodesNow(), [key]: at } })

const frame = useTemplateRef<HTMLElement>('frame')

/** The point of the picture under the pointer (`box`: measured once for a whole drag). */
function pointOf(event: { clientX: number, clientY: number }, box = frame.value!.getBoundingClientRect()): At {
  return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) }
}

async function focusPin(key: string) {
  await nextTick()
  frame.value?.querySelector<HTMLElement>(`[data-pin="${key}"] a`)?.focus()
}

// ---------------------------------------------------------------- which place is here

const asking = reactive({ open: false, at: { x: 0.5, y: 0.5 } as At })
const anchor = useTemplateRef<HTMLElement>('anchor')
const picked = ref<string | null>(null)
const pickedCollectible = ref<string | null>(null)
/** What had the keyboard when the question opened: it gets it back when the question closes unanswered. */
let opener: HTMLElement | null = null

function ask(at: At) {
  asking.at = at
  picked.value = null
  pickedCollectible.value = null
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
    if (!picked.value && !pickedCollectible.value) (opener?.isConnected ? opener : frame.value)?.focus()
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

/** The answer to the question: a pin for that place or collectible, where the question pointed. */
const onPick = (type: 'location' | 'object') => (id: string | null) => {
  if (!id) return
  asking.open = false
  void place(mentionId(type, id), asking.at, true)
}
watch(picked, onPick('location'))
watch(pickedCollectible, onPick('object'))

// ---------------------------------------------------------------- moving and removing pins

/** Puts a pin at a spot (and, with `focus`, the keyboard on it once it is there). */
function place(key: string, at: At, focus = false) {
  return store.update('maps', props.map.id, withPin(key, at)).then(() => { if (focus) void focusPin(key) }, () => {})
}

/** "Sposta il segnaposto": the next click or tap on the picture puts this pin there. */
const moving = ref<string | null>(null)

/**
 * A drag: the pin, where the pointer went down, how far it was from the pin's spot (the pin does not
 * jump to it), the picture's box, and where the pin is now once it has moved (saved on release).
 */
const drag = ref<{ key: string, from: { x: number, y: number }, offset: At, box: DOMRect, at?: At } | null>(null)
/** A drag just ended: the click that follows neither opens the place nor asks for a new one. */
let dragged = false

function onPointerDown(event: PointerEvent, pin: Pin) {
  // A finger scrolls the page; touch moves a pin with "Sposta il segnaposto".
  if (event.button !== 0 || event.pointerType === 'touch') return
  const box = frame.value!.getBoundingClientRect()
  const point = pointOf(event, box)
  drag.value = { key: pin.key, from: { x: event.clientX, y: event.clientY }, offset: { x: point.x - pin.at.x, y: point.y - pin.at.y }, box }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  const d = drag.value
  if (!d || (!d.at && Math.hypot(event.clientX - d.from.x, event.clientY - d.from.y) < 5)) return
  const point = pointOf(event, d.box)
  d.at = { x: clamp(point.x - d.offset.x), y: clamp(point.y - d.offset.y) }
}

function onPointerUp() {
  const d = drag.value
  drag.value = null
  if (!d?.at) return
  dragged = true
  setTimeout(() => {
    dragged = false
  })
  void place(d.key, d.at)
}

/** Caught before the link sees it: the click that ends a drag opens nothing. */
function onPinClickCapture(event: MouseEvent) {
  if (!dragged) return
  event.preventDefault()
  event.stopPropagation()
}

const STEP = 0.01
const LONG_STEP = 0.05
const KEYS: Record<string, At> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }

function onPinKeydown(event: KeyboardEvent, pin: Pin) {
  // Alt, Ctrl and ⌘ with an arrow are the browser's (back, forward): left alone.
  if (event.altKey || event.ctrlKey || event.metaKey) return
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    void unpin(pin)
    return
  }
  const direction = KEYS[event.key]
  if (!direction) return
  event.preventDefault()
  const step = event.shiftKey ? LONG_STEP : STEP
  const at = { x: clamp(pin.at.x + direction.x * step), y: clamp(pin.at.y + direction.y * step) }
  store.patchSoon('maps', props.map.id, withPin(pin.key, at))
}

async function unpin(pin: Pin) {
  const { [pin.key]: at, ...rest } = nodesNow()
  try {
    await store.update('maps', props.map.id, { nodes: rest })
  }
  catch {
    return
  }
  frame.value?.focus()
  toast.add({
    title: t('locations.map.unpinned', { name: pin.name }),
    icon: 'i-lucide-map-pin-off',
    actions: [{
      label: t('common.actions.undo'),
      onClick: () => {
        if (at) void place(pin.key, at, true)
      },
    }],
  })
}

const PIN_MENU = { align: 'start' as const }
const menuOf = (pin: Pin): DropdownMenuItem[][] => [[
  { label: t(pin.ref.type === 'object' ? 'locations.map.openObject' : 'locations.map.open'), icon: 'i-lucide-arrow-right', to: store.refPath(pin.ref) },
  { label: t('locations.map.move'), icon: 'i-lucide-move', onSelect: () => { moving.value = pin.key } },
  { label: t('locations.map.unpin'), icon: 'i-lucide-map-pin-off', onSelect: () => void unpin(pin) },
]]
const movingName = computed(() => pins.value.find(pin => pin.key === moving.value)?.name ?? '')

const where = (pin: Pin) => (drag.value?.key === pin.key && drag.value.at ? drag.value.at : pin.at)

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
      <img :src="mediaUrl(map.settings.image)" :alt="map.name" class="block h-auto w-full rounded-[calc(var(--ui-radius)*2)] border border-default bg-muted" draggable="false">

      <div
        v-for="pin in pins"
        :key="pin.key"
        :data-pin="pin.key"
        @click.capture="onPinClickCapture"
        class="group/pin absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center"
        :style="{ left: percent(where(pin).x), top: percent(where(pin).y) }"
      >
        <span class="flex items-center gap-0.5 rounded-[calc(var(--ui-radius)*1.5)] bg-(--ui-bg-floating) py-0.5 ps-2 pe-0.5 shadow-(--shadow-floating) ring-1 ring-(--ui-border)">
          <NuxtLink
            :to="store.refPath(pin.ref)"
            class="voice-author inline-flex cursor-grab items-center whitespace-nowrap text-sm font-semibold text-highlighted active:cursor-grabbing max-lg:min-h-11 max-lg:min-w-11"
            draggable="false"
            aria-describedby="place-map-hint"
            @pointerdown="onPointerDown($event, pin)"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="drag = null"
            @keydown="onPinKeydown($event, pin)"
          >{{ pin.name }}</NuxtLink>
          <UDropdownMenu :items="menuOf(pin)" :content="PIN_MENU">
            <UButton
              icon="i-lucide-ellipsis"
              size="xs"
              color="neutral"
              variant="ghost"
              class="max-lg:size-11 max-lg:justify-center lg:opacity-0 lg:group-hover/pin:opacity-100 lg:focus-visible:opacity-100 lg:data-[state=open]:opacity-100"
              :aria-label="t('locations.map.pinActions', { name: pin.name })"
              @click.stop
            />
          </UDropdownMenu>
        </span>
        <UIcon :name="pin.icon" class="-mt-0.5 size-6 text-primary drop-shadow-sm" aria-hidden="true" />
      </div>

      <!-- Where the question points: the popover hangs from here. -->
      <span ref="anchor" class="pointer-events-none absolute size-0" :style="{ left: percent(asking.at.x), top: percent(asking.at.y) }" aria-hidden="true" />
    </div>

    <UPopover v-model:open="asking.open" :reference="anchor ?? undefined" :content="askContent">
      <template #content>
        <div class="w-72 max-w-[calc(100vw-2rem)] space-y-2 p-3">
          <p class="text-sm font-medium text-default">{{ t(store.bestiary ? 'locations.map.whichPin' : 'locations.map.whichPlace') }}</p>
          <DEntityPicker
            v-model="picked"
            type="location"
            creatable
            :exclude="placedPlaces"
            :placeholder="t(store.bestiary ? 'locations.map.pickPlace' : 'locations.map.pick')"
            :aria-label="store.bestiary ? term('location') : t('locations.map.whichPlace')"
            class="w-full"
          />
          <DEntityPicker
            v-if="store.bestiary"
            v-model="pickedCollectible"
            type="object"
            creatable
            :create-with="{ category: 'collectible' }"
            :exclude="notOffered"
            :placeholder="t('locations.map.pickCollectible')"
            :aria-label="t('common.enums.objectCategory.collectible')"
            class="w-full"
          />
        </div>
      </template>
    </UPopover>
  </div>
</template>
