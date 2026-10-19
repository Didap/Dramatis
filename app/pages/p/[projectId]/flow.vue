<script setup lang="ts">
import { useEventListener, useMediaQuery } from '@vueuse/core'
import type { LocationQuery } from 'vue-router'
import { CHOICE_FORM, type ChoiceFormRequest } from '~/components/flow/ChoiceForm.vue'

/**
 * Flow (spec 4.5, 5.5): every path through the game, in three views. Grafo (desktop default), Elenco
 * (phone default, the accessible route), Controlli. The view, the selected scene and the choice form
 * live in the query string (?view=graph|list|checks, ?scene=, ?choice=), so back closes what it opened.
 * A selected scene opens its flow panel: docked beside the graph or the list on desktop, a drawer on
 * the phone.
 */
const route = useRoute()
const router = useRouter()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { scenes: sceneCount } = useFormat()
const desktop = useMediaQuery('(min-width: 1024px)')
const { analysis, problems } = useFlow()

type View = 'graph' | 'list' | 'checks'
const VIEWS: View[] = ['graph', 'list', 'checks']

// ---------------------------------------------------------------- the query string

/** Keys this page pushed onto the history: closing them goes back instead of replacing. */
const pushed = new Set<string>()
watch(() => route.query, (query) => {
  for (const key of [...pushed]) if (query[key] === undefined) pushed.delete(key)
})

function setQuery(change: Record<string, string | undefined>, push = false) {
  const query: LocationQuery = { ...route.query }
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) delete query[key]
    else query[key] = value
  }
  if (push) {
    pushed.add(Object.keys(change)[0]!)
    return router.push({ query })
  }
  return router.replace({ query })
}

function closeQuery(keys: string[]) {
  if (pushed.has(keys[0]!)) {
    pushed.delete(keys[0]!)
    return router.back()
  }
  return setQuery(Object.fromEntries(keys.map(k => [k, undefined])))
}

const view = computed<View>({
  get: () => {
    const value = route.query.view
    if (typeof value === 'string' && (VIEWS as string[]).includes(value)) return value as View
    return desktop.value ? 'graph' : 'list'
  },
  set: value => setQuery({ view: value }),
})

const selected = computed<string | null>({
  get: () => {
    const id = route.query.scene
    return typeof id === 'string' && store.get('scenes', id) ? id : null
  },
  set: id => (id ? setQuery({ scene: id }) : closeQuery(['scene'])),
})

// ---------------------------------------------------------------- the choice form (one for every view)

const formOpen = computed({
  get: () => {
    const choice = route.query.choice
    return choice === 'new' || (typeof choice === 'string' && !!store.get('links', choice))
  },
  set: (open) => { if (!open) closeQuery(['choice', 'from', 'to']) },
})
const formLinkId = computed(() => (typeof route.query.choice === 'string' && route.query.choice !== 'new' ? route.query.choice : null))
const formFrom = computed(() => (typeof route.query.from === 'string' ? route.query.from : null))
const formTo = computed(() => (typeof route.query.to === 'string' ? route.query.to : null))

function openChoice(request: ChoiceFormRequest) {
  setQuery({
    choice: request.linkId ?? 'new',
    from: request.linkId ? undefined : request.fromSceneId ?? undefined,
    to: request.linkId ? undefined : request.toSceneId ?? undefined,
  }, true)
}
provide(CHOICE_FORM, openChoice)

// ---------------------------------------------------------------- the scene panel and drawer

const graph = ref<{ centerOn: (id: string) => Promise<void> } | null>(null)
const inspector = ref<{ focusTitle: () => void } | null>(null)

/** Phone: the drawer of a tapped scene; it pushes, so back closes it. */
const drawerOpen = computed({
  get: () => !desktop.value && !!selected.value,
  set: (open) => { if (!open) closeQuery(['scene']) },
})

/** Desktop: the panel docked beside the graph or the list. */
const panel = computed(() => desktop.value && !!selected.value && view.value !== 'checks')

async function inspect(id: string, viaKeyboard = false) {
  if (!desktop.value) return setQuery({ scene: id }, true)
  // In the list the title opens and closes its panel.
  if (view.value === 'list' && selected.value === id) return closePanel()
  await setQuery({ scene: id })
  await nextTick()
  // Enter on a scene moves the focus into its panel; a click leaves it where it was.
  if (viaKeyboard) inspector.value?.focusTitle()
}

/** "Mostra": the graph, centred on the scene (selected on desktop; on a phone that would cover it with the drawer). */
async function show(id: string) {
  await setQuery({ view: 'graph', scene: desktop.value ? id : undefined })
  await nextTick()
  graph.value?.centerOn(id)
}

/** Closes the panel and gives the focus back to the scene it was opened from. */
function closePanel() {
  const id = selected.value
  selected.value = null
  if (!id) return
  const target = view.value === 'graph' ? `.vue-flow__node[data-id="${id}"]` : `[data-scene-button="${id}"]`
  nextTick(() => document.querySelector<HTMLElement>(target)?.focus())
}

onMounted(() => {
  if (!selected.value) return
  if (view.value === 'graph') graph.value?.centerOn(selected.value)
  else if (view.value === 'list') nextTick(() => document.querySelector(`[data-scene="${selected.value}"]`)?.scrollIntoView({ block: 'center' }))
})

/** One act and one strand at a time, shared by the graph and the list (P1). */
const filters = reactive<{ act: string | null, strand: string | null }>({ act: null, strand: null })

// ---------------------------------------------------------------- header

const tabs = computed(() => [
  { value: 'graph', label: t('flow.views.graph'), icon: 'i-lucide-waypoints' },
  { value: 'list', label: t('flow.views.list'), icon: 'i-lucide-list' },
  { value: 'checks', label: t('flow.views.checks'), icon: 'i-lucide-list-checks' },
])

const counts = computed(() => ({
  scenes: store.rows.scenes.length,
  choices: store.rows.links.length,
  endings: analysis.value?.endings.length ?? 0,
}))
const start = computed(() => store.get('scenes', store.project?.startSceneId))
/** The graph takes the whole width and the height left under the header. */
const canvas = computed(() => view.value === 'graph' && store.modules.branching && counts.value.scenes > 0)
const guidance = computed(() => store.project?.settings.guidance !== false)

function onConnect(from: string, to: string) {
  openChoice({ fromSceneId: from, toSceneId: to })
}

// Esc closes the docked panel. A plain listener, not defineShortcuts, which would swallow every Esc
// on the page: menus, lists and the form close first, by themselves.
useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.defaultPrevented || !panel.value || formOpen.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]')) return
  closePanel()
})
</script>

<template>
  <DPage :title="term('flow')" :width="canvas ? 'full' : 'default'" :bare="canvas">
    <template v-if="!store.modules.branching">
      <DPageHeader :title="term('flow')" />
      <DEmptyState
        icon="i-lucide-split"
        :title="t('flow.page.offTitle')"
        :description="t('flow.page.offBody')"
        :actions="[{ label: t('flow.page.openSettings'), to: `/p/${store.projectId}/settings`, color: 'neutral', variant: 'outline' }]"
        class="py-12"
      />
    </template>

    <template v-else-if="!counts.scenes">
      <DPageHeader :title="term('flow')" />
      <div class="space-y-2 py-2" aria-hidden="true">
        <div v-for="i in 2" :key="i" class="flex h-11 items-center gap-3 px-2 opacity-60">
          <span class="h-3 w-10 rounded bg-elevated" />
          <span class="h-3 w-40 rounded bg-elevated" />
          <DLeader />
          <span class="h-3 w-16 rounded bg-elevated" />
        </div>
      </div>
      <DEmptyState
        icon="i-lucide-split"
        :title="t('flow.page.emptyTitle')"
        :description="guidance ? t('flow.page.emptyBody') : undefined"
        :actions="[{ label: t('flow.page.openManuscript', { manuscript: term('manuscript') }), to: `/p/${store.projectId}/manuscript`, color: 'primary', variant: 'solid' }]"
        class="py-10"
      />
    </template>

    <template v-else>
      <div :class="canvas ? 'flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] flex-col lg:h-[calc(100dvh-3.5rem)]' : ''">
        <div :class="canvas ? 'shrink-0 px-4 pt-5 sm:px-6 lg:px-8 lg:pt-6' : ''">
          <DPageHeader :title="term('flow')" :description="guidance ? t('flow.page.lead') : undefined" class="!pb-4">
            <template #meta>
              <span class="tabular">{{ sceneCount(counts.scenes) }}</span>
              <span class="tabular">{{ t('flow.page.choices', { n: counts.choices }, counts.choices) }}</span>
              <span class="tabular">{{ t('flow.page.endings', { n: counts.endings }, counts.endings) }}</span>
              <span v-if="start" class="inline-flex min-w-0 items-center gap-1.5">
                <UIcon name="i-lucide-play" class="size-3.5 shrink-0 text-primary" />
                <i18n-t keypath="flow.page.startsAt" tag="span" scope="global">
                  <template #scene><span class="voice-author text-toned">{{ start.title || t('common.untitled.scene') }}</span></template>
                </i18n-t>
              </span>
            </template>
          </DPageHeader>
          <div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <UTabs v-model="view" :items="tabs" :content="false" variant="link" size="sm" class="-mb-px" :ui="{ list: 'border-b-0', trigger: 'max-lg:min-h-11' }">
              <template #trailing="{ item }">
                <UBadge v-if="item.value === 'checks' && problems" color="neutral" variant="subtle" size="sm" class="tabular">
                  <span aria-hidden="true">{{ problems }}</span>
                  <span class="sr-only">{{ ' ' }}{{ t('common.nav.flowProblems', { n: problems }, problems) }}</span>
                </UBadge>
              </template>
            </UTabs>
            <FlowFilters v-if="view !== 'checks'" v-model:act="filters.act" v-model:strand="filters.strand" class="pb-1.5" />
          </div>
        </div>

        <div v-if="canvas" class="relative flex min-h-0 flex-1 border-t border-default">
          <FlowGraph
            ref="graph"
            v-model:selected="selected"
            :act="filters.act"
            :strand="filters.strand"
            :interactive="desktop"
            class="min-w-0 flex-1"
            @connect="onConnect"
            @edit="(id: string) => openChoice({ linkId: id })"
            @inspect="inspect"
          />
          <aside
            v-if="panel"
            id="flow-scene-panel"
            class="w-80 shrink-0 overflow-y-auto border-s border-default bg-muted px-5 pt-4 pb-8"
            :aria-label="t('flow.inspector.label')"
          >
            <div class="-me-2 mb-1 flex justify-end">
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :aria-label="t('flow.inspector.close')" @click="closePanel" />
            </div>
            <FlowSceneInspector ref="inspector" :key="selected!" :scene-id="selected!" />
          </aside>
        </div>

        <div v-else class="border-t border-default pt-6" :class="panel ? 'flex items-start gap-6' : ''">
          <div class="min-w-0 flex-1">
            <FlowListView
              v-if="view === 'list'"
              :act="filters.act"
              :strand="filters.strand"
              :selected="desktop ? selected : null"
              @show="show"
              @inspect="inspect"
            />
            <FlowChecks v-else @show="show" />
          </div>
          <aside
            v-if="panel"
            id="flow-scene-panel"
            class="sticky top-20 max-h-[calc(100dvh-6rem)] w-80 shrink-0 overflow-y-auto border-s border-default ps-6 pb-6"
            :aria-label="t('flow.inspector.label')"
          >
            <div class="-me-2 mb-1 flex justify-end">
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :aria-label="t('flow.inspector.close')" @click="closePanel" />
            </div>
            <FlowSceneInspector ref="inspector" :key="selected!" :scene-id="selected!" />
          </aside>
        </div>
      </div>
    </template>

    <UDrawer v-if="!desktop" v-model:open="drawerOpen" :ui="{ content: 'max-h-[88dvh]', body: 'pb-[calc(1.5rem+env(safe-area-inset-bottom))]' }">
      <template #title><span class="sr-only">{{ t('flow.inspector.label') }}</span></template>
      <template #body>
        <FlowSceneInspector v-if="selected" :key="selected" :scene-id="selected" />
      </template>
    </UDrawer>

    <FlowChoiceForm
      v-model:open="formOpen"
      :link-id="formLinkId"
      :from-scene-id="formFrom"
      :to-scene-id="formTo"
    />
  </DPage>
</template>
