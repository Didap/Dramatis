<script lang="ts">
/**
 * The new order of a whole collection when some of its items (the visible ones, in their new order)
 * move among themselves: every other item keeps its slot.
 */
export function reorderSubset(all: readonly string[], subset: readonly string[]): string[] {
  const wanted = new Set(subset)
  const next = [...all]
  let cursor = 0
  all.forEach((id, slot) => {
    if (wanted.has(id)) next[slot] = subset[cursor++]!
  })
  return next
}
</script>

<script setup lang="ts" generic="T extends { id: string, name: string }">
import type { Ref } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { WorldAction } from './ActionMenu.vue'

/**
 * An ordered list of world entities (groups, locations, objects). Rows move by dragging the handle,
 * with Alt+Up/Down on a focused row, or from the row menu (up, down, top, bottom), which also moves
 * a row to the trash. The rows may be a filtered part of the collection: moving them never disturbs
 * the others. Every keyboard or menu move is announced to screen readers; the focus stays on the
 * moved row, and goes to the next one when a row leaves.
 */
const props = withDefaults(defineProps<{
  collection: 'groups' | 'locations' | 'objects'
  /** The rows shown, in display order. */
  items: T[]
  /** Accessible name of the list. */
  label: string
  /** The side column of a sheet: no handle and no menu; the keyboard still moves rows. */
  compact?: boolean
}>(), { compact: false })

defineSlots<{ row(props: { item: T, index: number }): unknown }>()

const { t } = useI18n()
const store = useProjectStore()
const root = ref<HTMLElement | null>(null)
const local = ref([...props.items]) as Ref<T[]>
// The store sorts its rows in place: follow the order of the ids, not the array.
watch(() => props.items.map(item => item.id).join('|'), () => { local.value = [...props.items] })
const announcement = ref('')

function focusRow(id: string) {
  root.value?.querySelector<HTMLElement>(`[data-row-id="${id}"] a`)?.focus()
}

async function commit(visible: string[], moved?: string) {
  const all = (store.rows[props.collection] as { id: string }[]).map(row => row.id)
  const next = reorderSubset(all, visible)
  if (next.every((id, i) => id === all[i])) return
  // The store reorders at once; the request follows.
  const saving = store.reorder(props.collection, next)
  if (moved) {
    await nextTick()
    focusRow(moved)
    const name = props.items.find(item => item.id === moved)?.name ?? ''
    announcement.value = t('world.list.moved', { name, position: visible.indexOf(moved) + 1, total: visible.length })
  }
  await saving.catch(() => {})
}

function moveTo(id: string, to: number) {
  const ids = props.items.map(item => item.id)
  const from = ids.indexOf(id)
  if (from < 0 || to < 0 || to >= ids.length || to === from) return
  ids.splice(to, 0, ids.splice(from, 1)[0]!)
  void commit(ids, id)
}

function moveBy(id: string, step: number) {
  moveTo(id, props.items.findIndex(item => item.id === id) + step)
}

function onDragEnd(event: { oldIndex?: number, newIndex?: number }) {
  if (event.oldIndex === event.newIndex) return
  void commit(local.value.map(item => item.id))
}

/**
 * Moves a row to the trash; undo is in the toast, and a failure puts the row back and says why.
 * The focus goes to the next row on the page (the previous one after the last), or, with no row
 * left, to the button that creates one.
 */
async function trash(item: T) {
  const scope = root.value?.closest<HTMLElement>('aside, main') ?? document.body
  const rows = [...scope.querySelectorAll<HTMLElement>('[data-row-id]')]
  const at = rows.findIndex(row => row.dataset.rowId === item.id)
  const neighbour = rows[at + 1] ?? rows[at - 1]
  const removing = store.remove(props.collection, item.id).catch(() => {})
  await nextTick()
  const target = neighbour?.isConnected
    ? neighbour.querySelector<HTMLElement>('a')
    : scope.querySelector<HTMLElement>('[data-world-create]')
  target?.focus()
  await removing
}

function actions(item: T, index: number): WorldAction[][] {
  const last = props.items.length - 1
  return [
    [
      { key: 'up', label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', kbds: ['alt', 'arrowup'], disabled: index === 0, onSelect: () => moveBy(item.id, -1) },
      { key: 'down', label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', kbds: ['alt', 'arrowdown'], disabled: index === last, onSelect: () => moveBy(item.id, 1) },
      { key: 'top', label: t('world.list.moveTop'), icon: 'i-lucide-arrow-up-to-line', disabled: index === 0, onSelect: () => moveTo(item.id, 0) },
      { key: 'bottom', label: t('world.list.moveBottom'), icon: 'i-lucide-arrow-down-to-line', disabled: index === last, onSelect: () => moveTo(item.id, props.items.length - 1) },
    ],
    [{ key: 'trash', label: t('world.list.trash'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void trash(item) } }],
  ]
}
</script>

<template>
  <div ref="root">
    <VueDraggable
      v-model="local"
      tag="ul"
      role="list"
      :aria-label="label"
      handle=".d-drag-handle"
      :animation="150"
      :disabled="compact"
      ghost-class="d-world-ghost"
      class="flex flex-col gap-px"
      @end="onDragEnd"
    >
      <li
        v-for="(item, index) in local"
        :key="item.id"
        :data-row-id="item.id"
        class="d-world-row relative flex items-center rounded-[calc(var(--ui-radius)*2)] transition-colors duration-150 hover:bg-elevated"
        @keydown.alt.up.prevent="moveBy(item.id, -1)"
        @keydown.alt.down.prevent="moveBy(item.id, 1)"
      >
        <span
          v-if="!compact"
          class="d-drag-handle absolute -start-6 top-1/2 h-8 w-5 -translate-y-1/2 cursor-grab place-items-center rounded text-dimmed active:cursor-grabbing"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-grip-vertical" class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <slot name="row" :item="item" :index="index" />
        </div>
        <WorldActionMenu
          v-if="!compact"
          quiet
          :groups="actions(item, index)"
          :label="t('world.list.actionsFor', { name: item.name })"
          class="me-1"
        />
      </li>
    </VueDraggable>
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
  </div>
</template>

<style scoped>
/* The handle and the menu appear on hover or focus where there is a pointer; touch keeps the menu visible. */
.d-drag-handle {
  display: none;
}
.d-drag-handle,
.d-world-row :deep(.d-action-quiet) {
  transition: opacity 150ms var(--ease-out-expo);
}
@media (hover: hover) {
  .d-drag-handle,
  .d-world-row :deep(.d-action-quiet) {
    opacity: 0;
  }
  .d-world-row:hover .d-drag-handle,
  .d-world-row:hover :deep(.d-action-quiet),
  .d-world-row:focus-within :deep(.d-action-quiet),
  .d-world-row :deep(.d-action-quiet[data-state='open']) {
    opacity: 1;
  }
}
@media (hover: hover) and (min-width: 640px) {
  .d-drag-handle {
    display: grid;
  }
}
:deep(.d-world-ghost) {
  opacity: 0.4;
  background: var(--ui-bg-elevated);
}
</style>
