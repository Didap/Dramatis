<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import { FILTER_KEYS, NO_FILTERS, passes, provideOutlineContext, sortableOptions, useAnnouncement, useDragging, useManuscriptStructure, useRenaming, type OutlineFilters, type RowActionGroup } from '~/components/manuscript/Structure.vue'
import type { LocationQueryRaw } from 'vue-router'
import type { Scene } from '#shared/types/entities'

/**
 * The outline of the manuscript (the script, in a game; spec 4.5): parts or acts when the project
 * uses them, chapters, scenes. Shape the structure here: create at a position, drag, Alt+Up/Down
 * or "Sposta", rename in place, change status; open a scene to write it.
 */
const { t } = useI18n()
const store = useProjectStore()
const { term } = useTerms()
const { words, scenes: sceneCount, chapters: chapterCount, number } = useFormat()
const structure = useManuscriptStructure()
const renaming = useRenaming()
const dragging = useDragging()
const live = useAnnouncement()
const desktop = useMediaQuery('(min-width: 1024px)')

const storageKey = (name: string) => `dramatis:manuscript:${store.projectId}:${name}`
const showSynopsis = useLocalStorage(storageKey('synopsis'), false)
const collapsed = useLocalStorage<string[]>(storageKey('collapsed'), [])
const hintHidden = useLocalStorage('dramatis:manuscript:hint-hidden', false)

// ---------------------------------------------------------------- filters (P1), kept in the query string

const route = useRoute()
const router = useRouter()
const listOf = (value: unknown) => (typeof value === 'string' && value ? value.split(',') : [])
const filters = computed<OutlineFilters>({
  get: () => Object.fromEntries(FILTER_KEYS.map(key => [key, listOf(route.query[key])])) as unknown as OutlineFilters,
  set: (next) => {
    const query: LocationQueryRaw = { ...route.query }
    for (const key of FILTER_KEYS) query[key] = next[key].length ? next[key].join(',') : undefined
    void router.replace({ query })
  },
})
const filtering = computed(() => FILTER_KEYS.some(key => filters.value[key].length > 0))
const showFilters = ref(filtering.value)
const visible = (scene: Scene) => passes(scene, filters.value)
const selected = ref<string[]>([])

/** Closing the filters also clears them: hidden filters must not hide scenes. */
function toggleFilters() {
  if (showFilters.value || filtering.value) {
    showFilters.value = false
    if (filtering.value) filters.value = { ...NO_FILTERS }
  }
  else {
    showFilters.value = true
  }
}

provideOutlineContext({ showSynopsis, collapsed, filtering, visible, selected })

// The selection holds only scenes in sight: those that leave (trash, another device) or that a
// filter hides leave it too, so a bulk action never reaches a scene the author cannot see.
watch([() => store.rows.scenes.length, filters], () => {
  const kept = selected.value.filter((id) => {
    const scene = store.get('scenes', id)
    return !!scene && visible(scene)
  })
  if (kept.length !== selected.value.length) selected.value = kept
})

const guidance = computed(() => store.project?.settings.guidance ?? true)
const usesParts = structure.usesParts
// With filters on, only the parts and chapters that hold a matching scene are shown.
const hasMatch = (chapterId: string) => store.chapterScenes(chapterId).some(visible)
const parts = computed(() => (filtering.value ? store.orderedParts.filter(p => structure.chaptersOf(p.id).some(c => hasMatch(c.id))) : store.orderedParts))
const partIds = computed(() => parts.value.map(p => p.id))
const looseChapters = computed(() => (usesParts.value ? structure.chaptersOf(null).filter(c => !filtering.value || hasMatch(c.id)) : []))
const chapters = computed(() => (filtering.value ? store.orderedChapters.filter(c => hasMatch(c.id)) : store.orderedChapters))
const chapterIds = computed(() => chapters.value.map(c => c.id))
const scenes = computed(() => store.orderedScenes)
const shown = computed(() => (filtering.value ? scenes.value.filter(visible).length : scenes.value.length))
const empty = computed(() => !store.rows.chapters.length && !store.rows.scenes.length && !store.rows.parts.length)
const busy = ref(false)

// ---------------------------------------------------------------- creating

async function newScene() {
  // A new scene would hide behind the filters: show everything first.
  if (filtering.value) filters.value = { ...NO_FILTERS }
  const scene = await structure.createScene().catch(() => null)
  if (!scene) return
  collapsed.value = collapsed.value.filter(id => id !== scene.chapterId && id !== store.get('chapters', scene.chapterId)?.partId)
  renaming.value = scene.id
}

async function firstItem() {
  busy.value = true
  try {
    if (store.isGame) await newScene()
    else {
      const chapter = await structure.createChapter().catch(() => null)
      if (chapter) renaming.value = chapter.id
    }
  }
  finally {
    busy.value = false
  }
}

async function addChapter(title: string) {
  await structure.createChapter({ title })
}

async function addPart(title: string) {
  await structure.createPart({ title })
}

// ---------------------------------------------------------------- parts on and off (spec 7.15)

async function setParts(enabled: boolean) {
  try {
    await Promise.all([store.flush(), store.flushProject()])
    await $fetch(`/api/projects/${store.projectId}/manuscript/parts`, { method: 'POST', body: { enabled } })
    await store.reload()
    useToast().add({
      title: t(enabled ? `manuscript.outline.partsOnDone.${store.kind}` : `manuscript.outline.partsOffDone.${store.kind}`),
      icon: enabled ? 'i-lucide-layers' : 'i-lucide-rows-3',
      actions: enabled ? undefined : [{ label: t('common.actions.undo'), onClick: () => { void setParts(true) } }],
    })
  }
  catch (error) {
    notifyError(error)
  }
}

// ---------------------------------------------------------------- drag and drop of parts and chapters

function onStart(kind: 'part' | 'chapter', event: { item: HTMLElement }) {
  const id = event.item.dataset.id
  if (id) dragging.value = { kind, id }
}

function onEnd() {
  dragging.value = null
}

function dropParts(ids: string[]) {
  const moving = dragging.value
  if (moving?.kind !== 'part' || !ids.includes(moving.id)) return
  void store.reorder('parts', ids).catch(() => {})
  structure.announce(t('manuscript.live.movedTop', { title: structure.titleOf('part', moving.id), n: ids.indexOf(moving.id) + 1, total: ids.length }))
}

/** Chapters without parts, or the chapters left outside any part (only reordered among themselves). */
function dropChapters(ids: string[]) {
  const moving = dragging.value
  if (moving?.kind !== 'chapter' || !ids.includes(moving.id)) return
  void store.reorder('chapters', ids, { partId: null }).catch(() => {})
  structure.announce(t('manuscript.live.movedTop', { title: structure.titleOf('chapter', moving.id), n: ids.indexOf(moving.id) + 1, total: ids.length }))
}

// ---------------------------------------------------------------- header

const expandable = computed(() => [...store.rows.chapters.map(c => c.id), ...(usesParts.value ? partIds.value : [])])

// A dropdown on desktop, a drawer on phones, like the row menus.
const pageMenu = computed<RowActionGroup[]>(() => [
  {
    key: 'view',
    actions: [
      { key: 'expand', label: t('manuscript.outline.expandAll'), icon: 'i-lucide-chevrons-up-down', disabled: !collapsed.value.length, onSelect: () => { collapsed.value = [] } },
      { key: 'collapse', label: t('manuscript.outline.collapseAll'), icon: 'i-lucide-chevrons-down-up', disabled: !expandable.value.length, onSelect: () => { collapsed.value = expandable.value } },
    ],
  },
  {
    key: 'parts',
    actions: [
      usesParts.value
        ? { key: 'off', label: t(`manuscript.outline.partsOff.${store.kind}`), icon: 'i-lucide-rows-3', onSelect: () => { void setParts(false) } }
        : { key: 'on', label: t(`manuscript.outline.partsOn.${store.kind}`), icon: 'i-lucide-layers', onSelect: () => { void setParts(true) } },
    ],
  },
])

// The totals of the whole manuscript, whatever the filters show.
const meta = computed(() => {
  const partCount = store.orderedParts.length
  return [
    ...(usesParts.value && partCount ? [t(`manuscript.units.parts.${store.kind}`, { n: number(partCount) }, partCount)] : []),
    chapterCount(store.orderedChapters.length),
    sceneCount(scenes.value.length),
    words(store.totalWords),
  ]
})

// A rename or an announcement belongs to this visit of the page.
onBeforeUnmount(() => {
  renaming.value = null
  live.value = ''
})
</script>

<template>
  <DPage :title="term('manuscript')">
    <DPageHeader :title="term('manuscript')">
      <template v-if="!empty" #meta>
        <ManuscriptFigures :text="meta.join(' · ')" />
        <ManuscriptStatusLine :scenes="scenes" />
      </template>
      <template v-if="!empty" #actions>
        <UButton
          icon="i-lucide-list-filter"
          :label="t('manuscript.filters.label')"
          color="neutral"
          :variant="showFilters || filtering ? 'soft' : 'ghost'"
          :aria-expanded="showFilters || filtering"
          aria-controls="manuscript-filters"
          class="max-lg:min-h-11"
          @click="toggleFilters"
        />
        <UButton
          icon="i-lucide-align-left"
          :label="t('manuscript.outline.synopsis')"
          color="neutral"
          :variant="showSynopsis ? 'soft' : 'ghost'"
          :aria-pressed="showSynopsis"
          class="max-lg:min-h-11"
          @click="showSynopsis = !showSynopsis"
        />
        <ManuscriptRowMenu :groups="pageMenu" :label="t('manuscript.outline.pageMenu')" size="md" :quiet="false" />
        <UButton
          icon="i-lucide-file-plus"
          :label="t('manuscript.scene.new')"
          color="primary"
          :variant="desktop ? 'solid' : 'outline'"
          class="max-lg:min-h-11"
          @click="newScene"
        />
      </template>
    </DPageHeader>

    <p v-if="!empty && guidance && !hintHidden" class="-mt-3 mb-6 flex max-w-prose items-start gap-2 text-sm text-muted">
      <i18n-t v-if="desktop" keypath="manuscript.outline.hint" tag="span" scope="global">
        <template #up><UKbd value="alt" size="sm" /> <UKbd value="arrowup" size="sm" /></template>
        <template #down><UKbd value="alt" size="sm" /> <UKbd value="arrowdown" size="sm" /></template>
      </i18n-t>
      <span v-else>{{ t('manuscript.outline.hintTouch') }}</span>
      <!-- 44px on touch layouts, without making the line taller. -->
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" class="-mt-0.5 shrink-0 max-lg:-my-3 max-lg:-me-3 max-lg:size-11 max-lg:justify-center" :aria-label="t('manuscript.outline.hideHint')" @click="hintHidden = true" />
    </p>

    <div v-if="!empty && (showFilters || filtering)" id="manuscript-filters" class="mb-6 space-y-2">
      <ManuscriptFilters v-model="filters" :shown="shown" :total="scenes.length" />
      <p v-if="filtering" class="text-xs text-dimmed">{{ t('manuscript.filters.dragOff') }}</p>
    </div>

    <!-- Empty: the shape of an outline first, then what it is for and one way in. -->
    <div v-if="empty" class="mx-auto max-w-xl pt-4 sm:pt-10">
      <div class="space-y-1.5 opacity-70" aria-hidden="true">
        <div class="flex items-baseline gap-3 px-2 py-2">
          <span class="tabular w-5 text-end text-sm text-dimmed">1</span>
          <span class="h-3 w-40 rounded-sm bg-elevated" />
          <DLeader />
          <span class="h-3 w-16 rounded-sm bg-elevated" />
        </div>
        <div class="flex items-baseline gap-3 py-2 ps-12 pe-2">
          <UIcon name="i-lucide-circle-dashed" class="size-4 self-center text-dimmed" />
          <span class="h-3 w-52 rounded-sm bg-elevated" />
          <DLeader />
          <span class="h-3 w-12 rounded-sm bg-elevated" />
        </div>
      </div>
      <div class="mt-8 space-y-3 text-center">
        <p class="text-pretty text-highlighted">{{ t(`manuscript.outline.empty.${store.kind}`) }}</p>
        <p v-if="guidance" class="mx-auto max-w-prose text-sm text-pretty text-muted">{{ t(`manuscript.outline.emptyExplain.${store.kind}`) }}</p>
        <div class="flex flex-col items-center gap-2 pt-3">
          <UButton
            color="primary"
            :variant="desktop ? 'solid' : 'outline'"
            size="lg"
            :icon="store.isGame ? 'i-lucide-file-plus' : 'i-lucide-book-plus'"
            :label="t(`manuscript.outline.emptyAction.${store.kind}`)"
            :loading="busy"
            @click="firstItem"
          />
          <UButton color="neutral" variant="link" size="sm" :to="`/p/${store.projectId}/architecture/premise`" :label="t('manuscript.outline.emptyWayOut')" />
        </div>
      </div>
    </div>

    <div v-else class="manuscript-outline">
      <!-- Parts (acts) on: chapters left outside any part come first, then part by part. -->
      <template v-if="usesParts">
        <section v-if="looseChapters.length" class="mb-6" :aria-label="t(`manuscript.outline.loose.${store.kind}`)">
          <h2 class="px-2 text-sm font-medium text-muted">{{ t(`manuscript.outline.loose.${store.kind}`) }}</h2>
          <p class="mb-1 px-2 text-xs text-dimmed">{{ t(`manuscript.outline.looseHint.${store.kind}`) }}</p>
          <VueDraggable
            tag="ul"
            :model-value="looseChapters.map(c => c.id)"
            :group="{ name: 'chapters', put: false }"
            v-bind="sortableOptions('chapter', !filtering)"
            class="space-y-1"
            @start="onStart('chapter', $event)"
            @update:model-value="dropChapters"
            @end="onEnd"
          >
            <ManuscriptOutlineChapter v-for="chapter in looseChapters" :key="chapter.id" :chapter="chapter" />
          </VueDraggable>
        </section>
        <VueDraggable
          tag="ul"
          :model-value="partIds"
          :group="{ name: 'parts' }"
          v-bind="sortableOptions('part', !filtering)"
          @start="onStart('part', $event)"
          @update:model-value="dropParts"
          @end="onEnd"
        >
          <ManuscriptOutlinePart v-for="part in parts" :key="part.id" :part="part" />
        </VueDraggable>
        <ManuscriptAddRow
          v-if="!filtering"
          class="mt-4"
          :label="t(`manuscript.part.new.${store.kind}`)"
          :placeholder="t(`manuscript.part.titlePlaceholder.${store.kind}`)"
          :create="addPart"
        />
      </template>

      <!-- Parts off: one list of chapters. -->
      <template v-else>
        <VueDraggable
          tag="ul"
          :model-value="chapterIds"
          :group="{ name: 'chapters' }"
          v-bind="sortableOptions('chapter', !filtering)"
          class="space-y-1"
          @start="onStart('chapter', $event)"
          @update:model-value="dropChapters"
          @end="onEnd"
        >
          <ManuscriptOutlineChapter v-for="chapter in chapters" :key="chapter.id" :chapter="chapter" />
        </VueDraggable>
        <ManuscriptAddRow
          v-if="!filtering"
          class="mt-2"
          :label="t('manuscript.chapter.new')"
          :placeholder="t('manuscript.chapter.titlePlaceholder')"
          :create="addChapter"
        />
      </template>

      <p v-if="filtering && !shown" class="px-2 py-6 text-sm text-muted">{{ t('manuscript.filters.none') }}</p>

      <ManuscriptSelectionBar />

      <div class="mt-8 flex items-baseline gap-3 px-2 text-sm">
        <span class="font-medium text-toned">{{ t('manuscript.outline.total') }}</span>
        <DLeader />
        <ManuscriptFigures class="text-muted" :text="`${sceneCount(scenes.length)} · ${words(store.totalWords)}`" />
      </div>
    </div>

    <ManuscriptStructure />
  </DPage>
</template>
