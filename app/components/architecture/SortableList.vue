<script setup lang="ts" generic="T extends { id: string }">
import { VueDraggable } from 'vue-draggable-plus'

/**
 * An ordered list of the story pages (strands, notes, codex, objectives...). The author reorders it by
 * dragging a row's handle (long press on touch), with Alt+Up/Down on the focused row, or from the row
 * menu through the slot's `move`. Emits the complete new order; the page saves it. Moves made from
 * the keyboard keep the focus and are announced to screen readers.
 */
const props = withDefaults(defineProps<{
  items: T[]
  /** Name of an item, for the announcement ("Le lettere, posizione 2 di 5"). */
  itemLabel: (item: T) => string
  /** Selector of the drag handle inside a row. */
  handle?: string
  disabled?: boolean
  /** Accessible name of the list. */
  label?: string
  itemClass?: string
  /** Lists sharing a group trade items by drag (codex entries between categories). */
  group?: string
}>(), { handle: '.d-sortable-handle', disabled: false, label: undefined, itemClass: '', group: undefined })

const emit = defineEmits<{
  reorder: [ids: string[]]
  /** An item dragged in from another list of the group, and the new order. */
  enter: [id: string, ids: string[]]
}>()

defineSlots<{
  default(props: { item: T, index: number, first: boolean, last: boolean, move: (delta: number) => void }): unknown
}>()

const { t } = useI18n()
const reducedMotion = usePreferredReducedMotion()

// A copy for the drag to rearrange; it follows the items, also when their array changes in place.
const local = ref([]) as Ref<T[]>
watch(() => [...props.items], (items) => { local.value = items }, { immediate: true })

const announcement = ref('')

async function move(id: string, delta: number) {
  const from = local.value.findIndex(i => i.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= local.value.length) return
  const focused = document.activeElement as HTMLElement | null
  const next = [...local.value]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  local.value = next
  emit('reorder', next.map(i => i.id))
  announcement.value = t('architecture.sortable.moved', { name: props.itemLabel(item!), n: to + 1, total: next.length })
  await nextTick()
  // Moving a row in the DOM can drop the focus: give it back to the same control.
  if (focused?.isConnected && document.activeElement !== focused) focused.focus()
}

function onKeydown(event: KeyboardEvent, id: string) {
  if (props.disabled || event.defaultPrevented || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  // Text fields keep their own Alt+arrows; a list nested in a row has already moved its own item.
  if ((event.target as HTMLElement).closest('textarea, [contenteditable="true"]')) return
  event.preventDefault()
  void move(id, event.key === 'ArrowUp' ? -1 : 1)
}

function onEnd() {
  const ids = local.value.map(i => i.id)
  if (ids.join() !== props.items.map(i => i.id).join()) emit('reorder', ids)
}

function onAdd(event: { item: HTMLElement }) {
  const id = event.item.dataset.sortableId
  if (id) emit('enter', id, local.value.map(i => i.id))
}
</script>

<template>
  <div class="d-sortable-list">
    <VueDraggable
      v-model="local"
      tag="ul"
      role="list"
      :aria-label="label"
      :handle="handle"
      :disabled="disabled"
      :animation="reducedMotion === 'reduce' ? 0 : 150"
      :delay="180"
      :delay-on-touch-only="true"
      ghost-class="opacity-40"
      :group="group"
      :class="group ? 'min-h-2' : ''"
      @end="onEnd"
      @add="onAdd"
    >
      <li
        v-for="(item, index) in local"
        :key="item.id"
        :data-sortable-id="item.id"
        :class="itemClass"
        @keydown="onKeydown($event, item.id)"
      >
        <slot :item="item" :index="index" :first="index === 0" :last="index === local.length - 1" :move="(delta: number) => move(item.id, delta)" />
      </li>
    </VueDraggable>
    <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
  </div>
</template>
