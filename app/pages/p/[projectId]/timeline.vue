<script setup lang="ts">
import { useStoryCalendar } from '~/components/timeline/story-calendar'
import {
  activeFilters,
  compareEntries,
  emptyFilters,
  eventEntry,
  exclusiveScenes,
  findFlashbacks,
  findOverlaps,
  groupEntries,
  matchesFilters,
  sceneEntry,
} from '~/components/timeline/timeline-model'
import type { SceneDatePatch, TimelineEntry, TimelineFilters } from '~/components/timeline/timeline-model'

/**
 * The timeline (spec 4.5): scenes and events in story order, grouped by year, month and day as density
 * requires, with filters, the undated tray, dates given inline, the event panel (?event=), and two
 * checks: a character in two places at once, and the order of the telling beside the order of the story.
 */
const route = useRoute()
const router = useRouter()
const store = useProjectStore()
const toast = useToast()
const { t } = useI18n()
const { term } = useTerms()
const { scenes: scenesText } = useFormat()
const { analysis } = useFlow()
const { yearText, fullDate } = useStoryCalendar()
/** One solid control per view: on a phone it is the bar's "Aggiungi". */
const desktop = useIsDesktop()

const guidance = computed(() => store.project?.settings.guidance !== false)

const filters = ref<TimelineFilters>(emptyFilters())
const filtersOpen = ref(false)
const narrativeOrder = ref(false)
const editing = ref<string | null>(null)
/** What the date editor starts from after a save that failed: what the author had typed. */
const editingDraft = ref<SceneDatePatch | null>(null)
const announcement = ref('')

const sceneEntries = computed(() => store.orderedScenes.map((scene, i) => sceneEntry(scene, i)))
const eventEntries = computed(() => store.rows.events.map(eventEntry))
const visible = computed(() => [...sceneEntries.value, ...eventEntries.value].filter(entry => matchesFilters(entry, filters.value)))
const dated = computed(() => visible.value.filter(entry => entry.sortKey !== null).sort(compareEntries))
const undated = computed(() => visible.value.filter(entry => entry.sortKey === null))
const sections = computed(() => groupEntries(dated.value))
const filtered = computed(() => activeFilters(filters.value) > 0)
const shownKeys = computed(() => new Set(dated.value.map(entry => entry.key)))
/** Dates written in the story's own words need a wider column than "lun 12". */
const labelled = computed(() => dated.value.some(entry => entry.label.trim()))

/**
 * Contradictions are found among every dated item: the filters only choose what is on screen, so a
 * row still warns about an item they hide. In a branching story, alternative paths never happen together.
 */
const overlaps = computed(() => findOverlaps(
  [...sceneEntries.value, ...eventEntries.value].filter(entry => entry.sortKey !== null),
  store.modules.branching && analysis.value ? exclusiveScenes(analysis.value.edges) : undefined,
))
/** Pairs with at least one item on screen: each of them shows its warning on a row. */
const overlapCount = computed(() => {
  let pairs = 0
  for (const [key, list] of overlaps.value) {
    for (const overlap of list) if (key < overlap.key && (shownKeys.value.has(key) || shownKeys.value.has(overlap.key))) pairs++
  }
  return pairs
})
const flashbacks = computed(() => {
  if (!narrativeOrder.value) return new Set<string>()
  const flow = store.modules.branching && analysis.value ? { edges: analysis.value.edges, startId: store.project?.startSceneId } : undefined
  return findFlashbacks(sceneEntries.value, flow)
})

function narrative(entry: TimelineEntry) {
  if (!narrativeOrder.value || !entry.scene) return undefined
  const index = store.chapterScenes(entry.scene.chapterId).findIndex(s => s.id === entry.id) + 1
  return t('timeline.order.position', {
    chapter: term('chapter'),
    number: store.chapterNumber(entry.scene.chapterId),
    scene: term('scene').toLocaleLowerCase(),
    index,
  })
}

/** A date to start from: the nearest dated scene before this one in the manuscript, or after it. */
function suggest(sceneId: string): string | null {
  const list = store.orderedScenes
  const at = list.findIndex(s => s.id === sceneId)
  for (let i = at - 1; i >= 0; i--) if (list[i]!.storyAt) return list[i]!.storyAt
  for (let i = at + 1; i < list.length; i++) if (list[i]!.storyAt) return list[i]!.storyAt
  return null
}

function edit(sceneId: string) {
  editingDraft.value = null
  editing.value = sceneId
}

/** Smooth scrolling, unless the author asked for less motion. */
const scrollBehavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

/** Focuses a row after it moved, so the keyboard stays where the author is looking. */
async function focusRow(key: string, block: ScrollLogicalPosition = 'nearest') {
  await nextTick()
  const row = document.querySelector<HTMLElement>(`[data-timeline-key="${key}"]`)
  row?.scrollIntoView({ block, behavior: scrollBehavior() })
  row?.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true })
}

const titleOf = (type: 'scene' | 'event', item: { title: string }) => item.title || t(type === 'scene' ? 'common.untitled.scene' : 'common.untitled.event')

/** The editor closes first: the optimistic change moves the scene, and the editor with it. */
async function saveDate(sceneId: string, patch: SceneDatePatch) {
  editing.value = null
  editingDraft.value = null
  const scene = store.get('scenes', sceneId)
  if (!scene) return
  const title = titleOf('scene', scene)
  try {
    await store.update('scenes', sceneId, patch)
  }
  catch {
    // The store has put the scene back and said why; the editor opens again on what was typed.
    editingDraft.value = patch
    editing.value = sceneId
    return
  }
  // Said the way the row says it: the date as written in the story, when there is one.
  announcement.value = patch.storyAt
    ? t('timeline.dating.moved', { title, date: patch.storyTimeLabel || fullDate(patch.storyAt) })
    : t('timeline.dating.cleared', { title })
  await focusRow(`scene:${sceneId}`)
}

/** Sets the story date of a scene or an event (`at` of events, `storyAt` of scenes). */
function setDate(type: 'scene' | 'event', id: string, value: string | null) {
  return type === 'scene' ? store.update('scenes', id, { storyAt: value }) : store.update('events', id, { at: value })
}

/** Back to the tray ("Togli la data"), with the keyboard following the item and a way back. */
async function undate(key: string) {
  const [type, id] = key.split(':') as ['scene' | 'event', string]
  const item = type === 'scene' ? store.get('scenes', id) : store.get('events', id)
  if (!item) return
  const previous = 'storyAt' in item ? item.storyAt : item.at
  const title = titleOf(type, item)
  // The change shows at once: the item is already in the tray.
  const saving = setDate(type, id, null)
  void focusRow(key)
  try {
    await saving
  }
  catch {
    void focusRow(key)
    return
  }
  toast.add({
    title: t('timeline.dating.cleared', { title }),
    icon: 'i-lucide-calendar-x',
    actions: [{ label: t('common.actions.undo'), onClick: () => { void redate(type, id, previous) } }],
  })
}

async function redate(type: 'scene' | 'event', id: string, value: string | null) {
  const item = type === 'scene' ? store.get('scenes', id) : store.get('events', id)
  if (!item || !value) return
  try {
    await setDate(type, id, value)
  }
  catch {
    return
  }
  const label = 'storyTimeLabel' in item ? item.storyTimeLabel : item.timeLabel
  announcement.value = t('timeline.dating.moved', { title: titleOf(type, item), date: label || fullDate(value) })
  await focusRow(`${type}:${id}`)
}

function cancelDate() {
  const id = editing.value
  editing.value = null
  editingDraft.value = null
  if (id) void focusRow(`scene:${id}`)
}

// ---------------------------------------------------------------- the event panel (?event=<id> or ?event=new)

const eventParam = computed(() => (typeof route.query.event === 'string' && route.query.event) || null)
const panelEventId = computed(() => (eventParam.value && eventParam.value !== 'new' ? eventParam.value : null))
let pushed = false

const panelOpen = computed({
  get: () => !!eventParam.value,
  // Opened by the panel itself when a new event could not be saved: it comes back with its draft.
  set: (open) => {
    if (!open) closeEvent()
    else if (!eventParam.value) openEvent('new')
  },
})

function openEvent(id: string) {
  pushed = true
  void router.push({ query: { ...route.query, event: id } })
}

function closeEvent() {
  if (pushed) {
    pushed = false
    router.back()
    return
  }
  const { event: _, ...rest } = route.query
  void router.replace({ query: rest })
}

watch(eventParam, (value) => { if (!value) pushed = false })

/** The new event exists: the address now names it (only while the panel is still on it). */
function onCreated(id: string) {
  if (eventParam.value === 'new') void router.replace({ query: { ...route.query, event: id } })
}

// ---------------------------------------------------------------- what the header says

const hasScenes = computed(() => store.orderedScenes.length > 0)
const nothingYet = computed(() => !hasScenes.value && !store.rows.events.length)
const emptyTimeline = computed(() => !dated.value.length)
const firstUndatedScene = computed(() => undated.value.find(entry => entry.type === 'scene'))
/** One solid button per view: the empty state's own action wins when it has one, the bar's "Aggiungi" on a phone. */
const headerPrimary = computed(() => desktop.value && (!emptyTimeline.value || filtered.value || !firstUndatedScene.value))

const summary = computed(() => {
  if (!dated.value.length) return ''
  const sceneCount = dated.value.filter(e => e.type === 'scene').length
  const eventCount = dated.value.length - sceneCount
  const parts = [sceneCount ? scenesText(sceneCount) : '', eventCount ? t('timeline.units.events', { n: eventCount }, eventCount) : ''].filter(Boolean)
  const items = parts.length === 2 ? t('timeline.summary.both', { scenes: parts[0], events: parts[1] }) : parts[0]!
  const from = dated.value[0]!.parts!.year
  const to = dated.value.at(-1)!.parts!.year
  const span = from === to ? t('timeline.summary.single', { year: yearText(from) }) : t('timeline.summary.span', { from: yearText(from), to: yearText(to) })
  return t('timeline.summary.line', { items, span })
})

function giveFirstDate() {
  if (!firstUndatedScene.value) return
  edit(firstUndatedScene.value.id)
  void nextTick(() => document.getElementById('undated')?.scrollIntoView({ block: 'start', behavior: scrollBehavior() }))
}

function showFirstOverlap() {
  const first = dated.value.find(entry => overlaps.value.get(entry.key)?.length)
  if (first) void focusRow(first.key, 'center')
}
</script>

<template>
  <!--
    shrink-0: keeps the page bar sticky past the first screen (DPage's root shrinks to the viewport).
    relative: keeps absolutely positioned bits (sr-only text) inside the scrolling page, so focusing
    a row never shifts the whole workspace frame.
  -->
  <DPage :title="term('timeline')" width="wide" class="relative shrink-0">
    <DPageHeader :title="term('timeline')" :description="guidance ? t('timeline.description') : undefined">
      <template v-if="summary || undated.length || overlapCount" #meta>
        <span v-if="summary">{{ summary }}</span>
        <a v-if="undated.length" href="#undated" class="underline underline-offset-3 hover:text-default">
          {{ t('timeline.summary.undated', { n: undated.length }, undated.length) }}
        </a>
        <button
          v-if="overlapCount"
          type="button"
          class="inline-flex items-center gap-1.5 text-warning underline underline-offset-3 max-lg:min-h-11"
          @click="showFirstOverlap"
        >
          <UIcon name="i-lucide-triangle-alert" class="size-4" />
          {{ t('timeline.checks.count', { n: overlapCount }, overlapCount) }}
        </button>
      </template>
      <template v-if="!nothingYet" #actions>
        <UButton
          icon="i-lucide-calendar-plus"
          :color="headerPrimary || !desktop ? 'primary' : 'neutral'"
          :variant="headerPrimary ? 'solid' : 'outline'"
          :label="t('timeline.newEvent')"
          class="max-lg:min-h-11"
          @click="openEvent('new')"
        />
      </template>
    </DPageHeader>

    <div v-if="!nothingYet" class="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
      <TimelineFilters v-model="filters" class="hidden lg:flex" />
      <UButton
        class="min-h-11 lg:hidden"
        icon="i-lucide-list-filter"
        color="neutral"
        variant="outline"
        :label="filtered ? t('timeline.filters.titleCount', { n: activeFilters(filters) }) : t('timeline.filters.title')"
        @click="filtersOpen = true"
      />
      <USwitch
        v-model="narrativeOrder"
        :label="t('timeline.order.label')"
        :description="t('timeline.order.description')"
        class="lg:ms-auto"
        :ui="{ root: 'items-center', description: 'sr-only', label: 'max-lg:py-3' }"
      />
    </div>

    <div class="grid gap-x-12 gap-y-10 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div class="min-w-0" :style="{ '--tl-when': labelled ? '9rem' : '5.5rem' }">
        <template v-if="sections.length">
          <TimelinePeriod
            v-for="section in sections"
            :key="section.id"
            :section="section"
            :editing="editing"
            :draft="editingDraft"
            :suggest="suggest"
            :overlaps="overlaps"
            :shown="filtered ? shownKeys : null"
            :flashbacks="flashbacks"
            :narrative="narrative"
            @edit="edit"
            @save="saveDate"
            @cancel="cancelDate"
            @open="openEvent"
            @undate="undate"
          />
        </template>

        <div v-else-if="filtered" class="py-6">
          <DEmptyState
            icon="i-lucide-list-filter"
            :title="t('timeline.empty.filtered')"
            :actions="[{ label: t('timeline.filters.clear'), color: 'neutral', variant: 'outline', class: 'max-lg:min-h-11', onClick: () => { filters = emptyFilters() } }]"
            size="sm"
          />
        </div>

        <div v-else class="max-w-xl">
          <ol class="pointer-events-none mb-6 select-none opacity-60" aria-hidden="true">
            <li v-for="ghost in [11, 7]" :key="ghost" class="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-2.5 py-2.5 sm:grid-cols-[5.5rem_1.5rem_minmax(0,1fr)] sm:gap-x-3">
              <span class="ms-auto hidden h-2.5 w-10 rounded-sm bg-elevated sm:block" />
              <span class="mx-auto size-6 rounded-full border border-default" />
              <span class="flex items-center gap-3">
                <span class="h-3 rounded-sm bg-elevated" :style="{ width: `${ghost}rem` }" />
                <span class="leader" />
                <span class="h-2.5 w-12 rounded-sm bg-elevated" />
              </span>
            </li>
          </ol>
          <p class="text-pretty text-highlighted">{{ t('timeline.empty.title') }}</p>
          <p v-if="guidance" class="mt-2 max-w-prose text-pretty text-sm text-muted">{{ t('timeline.empty.guide') }}</p>
          <div class="mt-5 flex flex-wrap items-center gap-3">
            <UButton
              v-if="firstUndatedScene"
              color="primary"
              :variant="desktop ? 'solid' : 'outline'"
              icon="i-lucide-calendar-plus"
              :label="t('timeline.empty.dateFirst')"
              class="max-lg:min-h-11"
              @click="giveFirstDate"
            />
            <UButton
              v-else-if="nothingYet"
              color="primary"
              :variant="desktop ? 'solid' : 'outline'"
              icon="i-lucide-calendar-plus"
              :label="t('timeline.newEvent')"
              class="max-lg:min-h-11"
              @click="openEvent('new')"
            />
            <UButton
              v-if="!hasScenes"
              :to="`/p/${store.projectId}/manuscript`"
              color="neutral"
              variant="link"
              trailing-icon="i-lucide-arrow-right"
              :label="t('timeline.empty.toManuscript', { manuscript: term('manuscript').toLocaleLowerCase() })"
              class="max-lg:min-h-11"
            />
          </div>
        </div>
      </div>

      <aside v-if="!nothingYet" class="min-w-0 xl:pt-1">
        <TimelineUndatedTray
          :entries="undated"
          :editing="editing"
          :draft="editingDraft"
          :suggest="suggest"
          :has-scenes="hasScenes"
          :filtered="filtered"
          @edit="edit"
          @save="saveDate"
          @cancel="cancelDate"
          @open="openEvent"
        />
      </aside>
    </div>

    <p id="timeline-announcement" class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <UDrawer v-model:open="filtersOpen" :title="t('timeline.filters.title')" :ui="{ body: 'pb-2' }">
      <template #body>
        <TimelineFilters v-model="filters" stacked />
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          block
          class="min-h-11"
          :label="t('timeline.filters.show', { n: visible.length }, visible.length)"
          @click="filtersOpen = false"
        />
      </template>
    </UDrawer>

    <TimelineEventSlideover v-model:open="panelOpen" :event-id="panelEventId" @created="onCreated" />
  </DPage>
</template>
