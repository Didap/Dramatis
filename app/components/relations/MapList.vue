<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { StoryMap } from '#shared/types/entities'
import { parseMentionId } from '#shared/utils/richtext'

/**
 * The relation maps (spec 4.4, tab Mappe): rows with the name, the number of elements and of the
 * relationships drawn among them; open, rename in place, reorder (drag by the handle, Alt+Up/Down or
 * the menu), trash.
 */
const emit = defineEmits<{ create: [] }>()

const store = useProjectStore()
const { t } = useI18n()
const { number } = useFormat()

const guidance = computed(() => store.project?.settings.guidance !== false)
const maps = computed(() => [...store.rows.maps].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)))

/** The working order, rearranged by the drag and drop. */
const order = ref<StoryMap[]>([])
watchEffect(() => { order.value = [...maps.value] })

async function onDragEnd() {
  await nextTick()
  const ids = order.value.map(m => m.id)
  if (ids.join() !== maps.value.map(m => m.id).join()) await store.reorder('maps', ids).catch(() => {})
}

/** Nodes whose entity is in the trash are hidden (spec 7.13), so they are not counted either. */
function visibleKeys(map: StoryMap) {
  return Object.keys(map.nodes).filter(key => !!store.getRef(parseMentionId(key)))
}

const stats = computed(() => new Map(maps.value.map((map) => {
  const keys = new Set(visibleKeys(map))
  const relations = store.rows.relations.filter(r => keys.has(`${r.sourceType}:${r.sourceId}`) && keys.has(`${r.targetType}:${r.targetId}`)).length
  return [map.id, { nodes: keys.size, relations }]
})))

const rowOf = (id: string) => document.querySelector<HTMLElement>(`[data-map-row="${id}"]`)

const renaming = ref<string | null>(null)

function startRename(id: string) {
  renaming.value = id
}

/** The menu gives the focus back to its button when it closes: after "Rinomina" it goes to the name instead. */
function onMenuClosed(event: Event, id: string) {
  if (renaming.value !== id) return
  event.preventDefault()
  document.querySelector<HTMLInputElement>(`[data-map-name="${id}"] input`)?.focus()
}

function rename(map: StoryMap, value: string) {
  store.patchSoon('maps', map.id, { name: value })
}

/** Enter or Esc leave the name: the focus goes back to the row (a click elsewhere keeps its own target). */
function endRename(id: string) {
  renaming.value = null
  setTimeout(() => {
    if (!document.activeElement || document.activeElement === document.body) rowOf(id)?.focus()
  })
}

async function move(id: string, delta: number) {
  const ids = maps.value.map(m => m.id)
  const from = ids.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return
  ids.splice(to, 0, ids.splice(from, 1)[0]!)
  await store.reorder('maps', ids).catch(() => {})
  nextTick(() => rowOf(id)?.focus())
}

function onKeydown(event: KeyboardEvent, id: string) {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  event.preventDefault()
  void move(id, event.key === 'ArrowUp' ? -1 : 1)
}

/**
 * A rename or a move still waiting to be sent goes first: sent after the map is gone it would come
 * back as "not found" and a false "Non salvato".
 */
async function trash(id: string) {
  const index = maps.value.findIndex(m => m.id === id)
  await store.flush()
  await store.remove('maps', id).catch(() => {})
  await nextTick()
  const next = maps.value[Math.min(index, maps.value.length - 1)]
  if (next) rowOf(next.id)?.focus()
}

function menu(map: StoryMap, index: number) {
  return [
    [
      { label: t('relations.maps.open'), icon: 'i-lucide-network', to: `/p/${store.projectId}/relations/${map.id}` },
      { label: t('relations.maps.rename'), icon: 'i-lucide-pencil', onSelect: () => startRename(map.id) },
    ],
    [
      { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', kbds: ['alt', 'arrowup'], disabled: index === 0, onSelect: () => { void move(map.id, -1) } },
      { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', kbds: ['alt', 'arrowdown'], disabled: index === maps.value.length - 1, onSelect: () => { void move(map.id, 1) } },
    ],
    [
      { label: t('relations.maps.trash'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { void trash(map.id) } },
    ],
  ]
}
</script>

<template>
  <div class="relations-map-list">
    <VueDraggable
      v-if="maps.length"
      v-model="order"
      tag="ul"
      role="list"
      handle=".relations-map-handle"
      :disabled="order.length < 2"
      :animation="150"
      :delay="200"
      :delay-on-touch-only="true"
      ghost-class="opacity-40"
      @end="onDragEnd"
    >
      <li
        v-for="(map, index) in order"
        :key="map.id"
        class="group flex items-center gap-1 rounded-[calc(var(--ui-radius)*2)] pe-1 transition-colors duration-150 hover:bg-elevated focus-within:bg-elevated"
      >
        <span
          class="relations-map-handle flex h-11 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-dimmed opacity-0 select-none group-hover:opacity-100 active:cursor-grabbing pointer-coarse:w-7 pointer-coarse:opacity-60"
          :class="order.length < 2 ? 'invisible' : ''"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-grip-vertical" class="size-4" />
        </span>
        <div v-if="renaming === map.id" class="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-1.5 pe-2" :data-map-name="map.id">
          <span class="grid size-8 shrink-0 place-items-center rounded-[calc(var(--ui-radius)*2)] bg-elevated text-toned" aria-hidden="true">
            <UIcon name="i-lucide-network" class="size-4" />
          </span>
          <DInlineText
            :model-value="map.name"
            required
            :maxlength="200"
            :aria-label="t('relations.maps.nameLabel')"
            class="voice-author font-semibold"
            @update:model-value="rename(map, $event)"
            @commit="endRename(map.id)"
          />
        </div>
        <NuxtLink
          v-else
          :to="`/p/${store.projectId}/relations/${map.id}`"
          :data-map-row="map.id"
          class="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] py-1.5 pe-2 sm:min-h-11"
          :aria-keyshortcuts="'Alt+ArrowUp Alt+ArrowDown'"
          @keydown="onKeydown($event, map.id)"
        >
          <span class="grid size-8 shrink-0 place-items-center rounded-[calc(var(--ui-radius)*2)] bg-elevated text-toned" aria-hidden="true">
            <UIcon name="i-lucide-network" class="size-4" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
            <span class="voice-author min-w-0 truncate font-semibold text-highlighted">{{ map.name || t('common.untitled.map') }}</span>
            <DLeader class="hidden sm:block" />
            <span class="tabular flex shrink-0 flex-wrap items-center gap-x-3 text-sm text-muted">
              <span class="whitespace-nowrap">{{ t('relations.maps.nodes', { n: number(stats.get(map.id)?.nodes ?? 0) }, stats.get(map.id)?.nodes ?? 0) }}</span>
              <span class="whitespace-nowrap">{{ t('relations.maps.relations', { n: number(stats.get(map.id)?.relations ?? 0) }, stats.get(map.id)?.relations ?? 0) }}</span>
            </span>
          </span>
        </NuxtLink>
        <UDropdownMenu :items="menu(map, index)" :content="{ align: 'end', onCloseAutoFocus: (event: Event) => onMenuClosed(event, map.id) }">
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="ghost"
            class="max-lg:min-h-11 max-lg:min-w-11 max-lg:justify-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 data-[state=open]:opacity-100"
            :aria-label="t('relations.maps.menu', { name: map.name })"
          />
        </UDropdownMenu>
      </li>
    </VueDraggable>

    <div v-else class="relations-empty">
      <div class="mb-2 space-y-1 opacity-60" aria-hidden="true">
        <div v-for="i in 2" :key="i" class="flex h-11 items-center gap-3 px-2">
          <span class="size-8 rounded-[calc(var(--ui-radius)*2)] bg-elevated" />
          <span class="h-3 rounded-sm bg-elevated" :class="i === 1 ? 'w-36' : 'w-24'" />
          <span class="leader h-3 self-center" />
          <span class="h-3 w-20 rounded-sm bg-elevated" />
        </div>
      </div>
      <DEmptyState
        icon="i-lucide-network"
        :title="t('relations.maps.empty.title')"
        :description="guidance ? t(store.isGame ? 'relations.maps.empty.bodyGame' : 'relations.maps.empty.body') : undefined"
        :actions="[{ label: t('relations.maps.empty.action'), icon: 'i-lucide-plus', color: 'primary', variant: 'solid', onClick: () => emit('create') }]"
      />
    </div>
  </div>
</template>
