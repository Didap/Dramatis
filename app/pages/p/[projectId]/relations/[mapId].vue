<script setup lang="ts">
import type { MapNodes, RelationKind } from '#shared/types/domain'
import type { Relation } from '#shared/types/entities'
import { RELATION_KINDS, WORLD_REF_TYPES } from '#shared/utils/constants'
import { parseMentionId } from '#shared/utils/richtext'
import type { MapSelection } from '~/components/relations/Selection.vue'
import type { Point } from '~/components/relations/MapNode.vue'

/**
 * A relation map (spec 4.4, 5.4): the canvas, the inspector with the selection and the legend
 * (desktop), drawers for both (phone, where the map is for viewing and linking goes through
 * "Collega a..."). Every relationship drawn here is a global one; the map only keeps positions.
 */
const route = useRoute()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const toast = useToast()
// The window's width is read at once (a media query only answers after mounting): no phone flash on desktop.
const { width } = useWindowSize()
const desktop = computed(() => width.value >= 1024)

const mapId = computed(() => String(route.params.mapId))
const map = computed(() => store.get('maps', mapId.value))
const relationsPath = computed(() => `/p/${store.projectId}/relations`)
const mapName = computed(() => map.value?.name || t('common.untitled.map'))

const canvas = ref<{
  fit: () => void
  zoomIn: () => void
  zoomOut: () => void
  placeNew: (keys: string[], anchor?: string | null) => Record<string, Point>
  layoutAll: () => void
  focusNode: (key: string) => void
  reveal: (key: string) => void
} | null>(null)
const editor = ref<{ show: (state: { relationId?: string | null, a?: string | null, b?: string | null }) => void } | null>(null)

// ---------------------------------------------------------------- what the map shows

const sourceOf = (r: Relation) => `${r.sourceType}:${r.sourceId}`
const targetOf = (r: Relation) => `${r.targetType}:${r.targetId}`

/** The map's entities; those in the trash are hidden and come back on restore (spec 7.13). */
const keys = computed(() => Object.keys(map.value?.nodes ?? {}).filter((key) => {
  const ref = parseMentionId(key)
  return !!ref && (WORLD_REF_TYPES as readonly string[]).includes(ref.type) && !!store.getRef(ref)
}))
const onMap = computed(() => new Set(keys.value))
const mapRelations = computed(() => store.rows.relations.filter(r => onMap.value.has(sourceOf(r)) && onMap.value.has(targetOf(r))))
const hidden = ref<RelationKind[]>([])
const shown = computed(() => mapRelations.value.filter(r => !hidden.value.includes(r.kind)))
/** Relationships from the map to entities outside it (and not in the trash). */
const outside = computed(() => store.rows.relations.filter(r =>
  onMap.value.has(sourceOf(r)) !== onMap.value.has(targetOf(r))
  && !!store.getRef({ type: r.sourceType, id: r.sourceId }) && !!store.getRef({ type: r.targetType, id: r.targetId })))
const outsideCounts = computed(() => {
  const out: Record<string, number> = {}
  for (const r of outside.value) {
    const inside = onMap.value.has(sourceOf(r)) ? sourceOf(r) : targetOf(r)
    out[inside] = (out[inside] ?? 0) + 1
  }
  return out
})
const kindsInUse = computed(() => RELATION_KINDS
  .map(kind => ({ kind, count: mapRelations.value.filter(r => r.kind === kind).length }))
  .filter(k => k.count))

// ---------------------------------------------------------------- selection

const selection = ref<MapSelection>(null)
const focusKey = typeof route.query.focus === 'string' ? route.query.focus : null

// A selection that is gone (an entity left the map, the last relationship of an edge went to the trash) is dropped.
watch([keys, shown], ([list, relations]) => {
  const s = selection.value
  if (s?.type === 'node' && !list.includes(s.key)) selection.value = null
  if (s?.type === 'edge') {
    const between = (r: Relation) => [sourceOf(r), targetOf(r)].sort().join('|') === [s.a, s.b].sort().join('|')
    if (!list.includes(s.a) || !list.includes(s.b) || !relations.some(between)) selection.value = null
  }
})

const drawer = computed({
  get: () => !desktop.value && !!selection.value,
  set: (value: boolean) => { if (!value) selection.value = null },
})

/** Enter on a node (or a tap on a label on a phone): its actions, in the inspector or the drawer. */
function onActivate() {
  if (desktop.value) nextTick(() => document.getElementById('relations-selection-title')?.focus())
}

function onInspectorKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !selection.value) return
  const s = selection.value
  selection.value = null
  if (s.type === 'node') canvas.value?.focusNode(s.key)
}

// ---------------------------------------------------------------- nodes

function saveNodes(nodes: Record<string, Point>) {
  if (map.value) store.patchSoon('maps', map.value.id, { nodes }, 300)
}

/** Entities tied by a relationship to `key` that are not on the map yet. */
function linkedOutside(key: string): string[] {
  const out = new Set<string>()
  for (const r of outside.value) {
    if (sourceOf(r) === key) out.add(targetOf(r))
    else if (targetOf(r) === key) out.add(sourceOf(r))
  }
  return [...out]
}

/** Adds entities in free places next to an anchor (a node of the map) or in the middle of the screen. */
async function place(newKeys: string[], anchor?: string | null) {
  const fresh = newKeys.filter(k => !onMap.value.has(k))
  if (!fresh.length || !map.value || !canvas.value) return
  saveNodes({ ...map.value.nodes, ...canvas.value.placeNew(fresh, anchor) })
  await nextTick()
}

/**
 * Adds the entities tied to the given nodes: they arrive at 0,0 and the map lays them out among
 * their relationships, the nodes already there staying where they are.
 */
async function bringLinked(anchors: string[]) {
  if (!map.value) return
  const fresh = [...new Set(anchors.flatMap(linkedOutside))].filter(k => !onMap.value.has(k))
  if (!fresh.length) return
  saveNodes({ ...map.value.nodes, ...Object.fromEntries(fresh.map(k => [k, { x: 0, y: 0 }])) })
  await nextTick()
}

const picker = ref(false)

async function addNodes(added: string[], withLinked: boolean) {
  picker.value = false
  await place(added)
  if (withLinked) await bringLinked(added)
}

/** "Aggiungi i collegati" (spec 5.4, P1): of one node, or of every node of the map. */
const addLinked = (key: string | null) => bringLinked(key ? [key] : [...keys.value])

function removeNode(key: string) {
  if (!map.value) return
  const previous = map.value.nodes[key]
  const { [key]: _removed, ...rest } = map.value.nodes
  selection.value = null
  saveNodes(rest)
  const name = store.refLabel(parseMentionId(key))
  toast.add({
    title: t('relations.map.removed', { name }),
    icon: 'i-lucide-circle-minus',
    actions: [{
      label: t('common.actions.undo'),
      onClick: () => { if (map.value && previous) saveNodes({ ...map.value.nodes, [key]: previous }) },
    }],
  })
}

// ---------------------------------------------------------------- relationships

function link(key: string) {
  if (!desktop.value) selection.value = null
  editor.value?.show({ a: key })
}

function openRelation(id: string) {
  if (!desktop.value) selection.value = null
  editor.value?.show({ relationId: id })
}

function createBetween(a: string, b: string) {
  if (!desktop.value) selection.value = null
  editor.value?.show({ a, b })
}

/** A relationship made from here to an entity outside the map brings that entity in (spec 5.4). */
async function onSaved(relation: Relation, created: boolean) {
  if (!created) return
  const source = sourceOf(relation)
  const target = targetOf(relation)
  const added = onMap.value.has(source) && !onMap.value.has(target) ? target : onMap.value.has(target) && !onMap.value.has(source) ? source : null
  if (!added) return
  await place([added], added === target ? source : target)
  canvas.value?.reveal(added)
}

// ---------------------------------------------------------------- the map itself

function rename(value: string) {
  if (map.value) store.patchSoon('maps', map.value.id, { name: value })
}

const nameInput = ref<HTMLElement | null>(null)
/** "Rinomina" from the menu: once the menu has closed, the focus goes to the name. */
let renaming = false

function onMenuClosed(event: Event) {
  if (!renaming) return
  renaming = false
  event.preventDefault()
  nameInput.value?.querySelector('input')?.select()
}

/**
 * "Disponi automaticamente" moves every node at once: the toast can put the hand-made arrangement
 * back (nodes added or removed since keep their place).
 */
function layoutAll() {
  if (!map.value || !canvas.value) return
  const id = map.value.id
  const before = JSON.parse(JSON.stringify(map.value.nodes)) as MapNodes
  canvas.value.layoutAll()
  toast.add({
    title: t('relations.map.laidOut'),
    icon: 'i-lucide-orbit',
    actions: [{
      label: t('common.actions.undo'),
      onClick: () => {
        const current = store.get('maps', id)
        if (!current) return
        store.patchSoon('maps', id, { nodes: Object.fromEntries(Object.entries(current.nodes).map(([key, p]) => [key, before[key] ?? p])) }, 300)
        nextTick(() => setTimeout(() => canvas.value?.fit(), 50))
      },
    }],
  })
}

/**
 * A move or a rename still waiting to be sent goes first: sent after the map is gone it would come
 * back as "not found" and a false "Non salvato".
 */
async function trashMap() {
  if (!map.value) return
  const id = map.value.id
  await store.flush()
  await navigateTo(relationsPath.value)
  await store.remove('maps', id).catch(() => {})
}

const menu = computed(() => [
  [
    ...(desktop.value ? [{ label: t('relations.map.layout'), icon: 'i-lucide-orbit', onSelect: layoutAll, disabled: keys.value.length < 2 }] : []),
    { label: t('relations.maps.rename'), icon: 'i-lucide-pencil', onSelect: () => { renaming = true } },
    { label: t('relations.map.openList'), icon: 'i-lucide-list', to: { path: relationsPath.value, query: { tab: 'list' } } },
  ],
  [{ label: t('relations.maps.trash'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: trashMap }],
])

const legend = ref(false)
</script>

<template>
  <DPage :title="mapName" :back="relationsPath" :back-label="term('relations')" width="full" bare>
    <template #breadcrumb>
      <div v-if="map" class="flex min-w-0 items-center gap-2">
        <NuxtLink :to="relationsPath" class="hidden shrink-0 text-sm text-muted hover:text-default lg:inline">{{ term('relations') }}</NuxtLink>
        <span class="hidden text-dimmed lg:inline" aria-hidden="true">/</span>
        <div ref="nameInput" class="min-w-0 flex-1 lg:max-w-md" data-map-title>
          <DInlineText
            :model-value="map.name"
            required
            :maxlength="200"
            :aria-label="t('relations.maps.nameLabel')"
            variant="small"
            class="voice-author truncate font-semibold text-highlighted"
            @update:model-value="rename"
          />
        </div>
      </div>
      <p v-else class="truncate text-sm text-muted">{{ term('relationMap') }}</p>
    </template>

    <template v-if="map" #actions>
      <UPopover v-if="desktop" v-model:open="picker" :content="{ align: 'end', sideOffset: 8 }">
        <UButton color="primary" variant="solid" icon="i-lucide-plus" :label="t('relations.map.add')" />
        <template #content>
          <div class="w-[22rem]">
            <RelationsEntityPicker :on-map="keys" @add="addNodes" />
          </div>
        </template>
      </UPopover>
      <UButton v-else color="neutral" variant="ghost" icon="i-lucide-plus" class="min-h-11 min-w-11 justify-center" :aria-label="t('relations.map.addTitle')" @click="picker = true" />
      <UDropdownMenu :items="menu" :content="{ align: 'end', onCloseAutoFocus: onMenuClosed }">
        <UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis" class="max-lg:min-h-11 max-lg:min-w-11 max-lg:justify-center" :aria-label="t('relations.map.menu')" />
      </UDropdownMenu>
    </template>

    <h1 v-if="map" class="sr-only">{{ mapName }}</h1>
    <div v-if="map" class="relations-map-page flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-3.5rem)]">
      <div class="relative min-w-0 flex-1">
        <RelationsMapCanvas
          :key="map.id"
          ref="canvas"
          v-model:selection="selection"
          :map="map"
          :keys="keys"
          :relations="shown"
          :outside="outsideCounts"
          :editable="desktop"
          :focus-key="focusKey"
          @connect="createBetween"
          @activate="onActivate"
          @pick="openRelation"
        >
          <template #controls>
            <div class="flex flex-col overflow-hidden rounded-md bg-(--ui-bg-floating) shadow-(--shadow-floating) ring ring-default">
              <UTooltip :text="t('relations.map.zoomIn')">
                <UButton color="neutral" variant="ghost" icon="i-lucide-plus" class="min-h-11 min-w-11 justify-center rounded-none lg:min-h-8 lg:min-w-8" :aria-label="t('relations.map.zoomIn')" @click="canvas?.zoomIn()" />
              </UTooltip>
              <UTooltip :text="t('relations.map.zoomOut')">
                <UButton color="neutral" variant="ghost" icon="i-lucide-minus" class="min-h-11 min-w-11 justify-center rounded-none lg:min-h-8 lg:min-w-8" :aria-label="t('relations.map.zoomOut')" @click="canvas?.zoomOut()" />
              </UTooltip>
              <UTooltip :text="t('relations.map.fit')">
                <UButton color="neutral" variant="ghost" icon="i-lucide-scan" class="min-h-11 min-w-11 justify-center rounded-none lg:min-h-8 lg:min-w-8" :aria-label="t('relations.map.fit')" @click="canvas?.fit()" />
              </UTooltip>
            </div>
          </template>
        </RelationsMapCanvas>

        <!-- The empty map teaches what to do (spec 4.4). -->
        <div v-if="!keys.length" class="pointer-events-none absolute inset-0 grid place-items-center p-6">
          <div class="pointer-events-auto max-w-md">
            <DEmptyState
              icon="i-lucide-network"
              :title="desktop ? t(store.isGame ? 'relations.map.empty.titleGame' : 'relations.map.empty.title') : t(store.isGame ? 'relations.map.empty.phoneGame' : 'relations.map.empty.phone')"
              :actions="[{ label: t('relations.map.empty.action'), icon: 'i-lucide-plus', color: 'neutral', variant: 'outline', onClick: () => { picker = true } }]"
            />
          </div>
        </div>

        <UButton
          v-if="!desktop && kindsInUse.length"
          color="neutral"
          variant="outline"
          icon="i-lucide-list"
          :label="t('relations.map.legend')"
          class="absolute bottom-3 left-3 min-h-11 bg-(--ui-bg-floating) shadow-(--shadow-floating)"
          @click="legend = true"
        />
      </div>

      <!-- Desktop inspector: the selection, then the legend (a named region: it sits inside the page's main). -->
      <section
        v-if="desktop"
        class="flex w-80 shrink-0 flex-col border-s border-default/70 bg-muted"
        :aria-label="t('relations.selection.label')"
        @keydown="onInspectorKeydown"
      >
        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <RelationsSelection
            :selection="selection"
            :keys="keys"
            :relations="mapRelations"
            :outside="outside"
            :editable="desktop"
            @link="link"
            @remove="removeNode"
            @open="openRelation"
            @create="createBetween"
            @add-linked="addLinked"
            @focus-node="key => canvas?.focusNode(key)"
          />
        </div>
        <div class="max-h-[45%] shrink-0 overflow-y-auto border-t border-default/70 px-4 py-4">
          <RelationsLegend v-model:hidden="hidden" :kinds="kindsInUse" />
        </div>
      </section>
    </div>

    <div v-else class="grid min-h-[60dvh] place-items-center p-6">
      <DEmptyState
        icon="i-lucide-network"
        :title="t('relations.map.notFound')"
        :actions="[{ label: term('relations'), to: relationsPath, color: 'neutral', variant: 'outline' }, { label: term('trash'), to: `/p/${store.projectId}/trash`, color: 'neutral', variant: 'ghost' }]"
      />
    </div>

    <!-- Phone: the selection and the legend in drawers; adding in a drawer. -->
    <UDrawer v-if="!desktop" v-model:open="drawer" :title="t('relations.selection.label')" :ui="{ header: 'sr-only', body: 'pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]' }">
      <template #body>
        <RelationsSelection
          :selection="selection"
          :keys="keys"
          :relations="mapRelations"
          :outside="outside"
          :editable="false"
          @link="link"
          @remove="removeNode"
          @open="openRelation"
          @create="createBetween"
          @add-linked="addLinked"
          @focus-node="key => canvas?.focusNode(key)"
        />
      </template>
    </UDrawer>
    <UDrawer v-if="!desktop" v-model:open="legend" :title="t('relations.map.legend')" :ui="{ header: 'sr-only', body: 'pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]' }">
      <template #body>
        <RelationsLegend v-model:hidden="hidden" :kinds="kindsInUse" />
      </template>
    </UDrawer>
    <UDrawer v-if="!desktop" v-model:open="picker" :title="t('relations.map.addTitle')" :ui="{ body: 'p-0 pb-[env(safe-area-inset-bottom)]' }">
      <template #body>
        <RelationsEntityPicker :on-map="keys" :autofocus="false" @add="addNodes" />
      </template>
    </UDrawer>

    <RelationsEditor ref="editor" routed @saved="onSaved" />
  </DPage>
</template>
