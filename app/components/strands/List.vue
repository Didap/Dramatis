<script setup lang="ts">
import type { StrandKind } from '#shared/types/domain'
import type { Strand } from '#shared/types/entities'
import { QUEST_KINDS, STRAND_KINDS } from '#shared/utils/constants'

/**
 * The strands of the story (spec 4.3; in games, storylines and quests): rows in the author's order,
 * a filter by kind, a new strand created in place (title and kind, Enter opens it), reorder by drag,
 * Alt+Up/Down or menu, trash with undo. `pane` is the narrow list kept beside an open strand from xl.
 */
withDefaults(defineProps<{ pane?: boolean }>(), { pane: false })

const store = useProjectStore()
const route = useRoute()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const { number } = useFormat()
const desktop = useMediaQuery('(min-width: 1024px)')

const guidance = computed(() => store.project?.settings.guidance ?? true)
const medium = computed(() => store.kind)
const filter = useState<StrandKind | null>(`dramatis:strands-kind:${store.projectId}`, () => null)

const sceneCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const scene of store.rows.scenes) for (const id of scene.strandIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
})

/** Required objectives of a quest whose completing scene is written (at least a draft). */
function progress(strand: Strand) {
  if (!store.modules.quests || !QUEST_KINDS.includes(strand.kind)) return null
  const required = (strand.quest?.objectives ?? []).filter(o => !o.optional)
  if (!required.length) return null
  const done = required.filter((o) => {
    const scene = store.get('scenes', o.sceneId)
    return !!scene && scene.status !== 'planned'
  }).length
  return { done, total: required.length }
}

/** Kinds the author can pick: quests only with the module (or when a strand already is one). */
const kinds = computed(() =>
  STRAND_KINDS.filter(k => store.modules.quests || !QUEST_KINDS.includes(k) || store.rows.strands.some(s => s.kind === k)),
)
const kindCounts = computed(() => {
  const counts = new Map<StrandKind, number>()
  for (const strand of store.rows.strands) counts.set(strand.kind, (counts.get(strand.kind) ?? 0) + 1)
  return counts
})
const showFilter = computed(() => kindCounts.value.size > 1 || !!filter.value)
const visible = computed(() => (filter.value ? store.rows.strands.filter(s => s.kind === filter.value) : store.rows.strands))

watch(kindCounts, (counts) => {
  if (filter.value && !counts.has(filter.value)) filter.value = null
})

/** Puts the reordered visible strands back into the places they held among all of them. */
function onReorder(ids: string[]) {
  const moved = new Set(ids)
  const queue = [...ids]
  const all = store.rows.strands.map(s => (moved.has(s.id) ? queue.shift()! : s.id))
  store.reorder('strands', all).catch(() => {})
}

// ---------------------------------------------------------------- creating

const root = ref<HTMLElement | null>(null)
const creating = ref(false)
const busy = ref(false)
const draft = reactive({ name: '', kind: 'plot' as StrandKind })
const nameInput = ref<{ inputRef?: HTMLInputElement } | null>(null)
/** The button that opened the form gets the focus back when it closes (or, redrawn meanwhile, its twin). */
let opener: HTMLElement | null = null

function defaultKind(): StrandKind {
  if (filter.value) return filter.value
  const has = (kind: StrandKind) => store.rows.strands.some(s => s.kind === kind)
  if (store.isGame && store.modules.quests) return has('quest') ? 'side_quest' : 'quest'
  return has('plot') ? 'subplot' : 'plot'
}

async function startCreating(kind?: StrandKind) {
  const active = document.activeElement
  opener = active instanceof HTMLElement && active !== document.body ? active : null
  draft.name = ''
  draft.kind = kind ?? defaultKind()
  creating.value = true
  await nextTick()
  nameInput.value?.inputRef?.focus()
}

async function stopCreating() {
  creating.value = false
  await nextTick()
  const target = opener?.isConnected ? opener : root.value?.querySelector<HTMLElement>('.d-new-strand')
  target?.focus()
  opener = null
}

async function create() {
  const name = draft.name.trim()
  if (!name || busy.value) return
  busy.value = true
  try {
    const row = await store.create('strands', { name, kind: draft.kind })
    creating.value = false
    await navigateTo(store.refPath({ type: 'strand', id: row.id }))
  }
  catch {
    // The store has already said what went wrong.
  }
  finally {
    busy.value = false
  }
}

const kindItems = computed(() => kinds.value.map(k => ({ value: k, label: label('strandKind', k) })))
const firstKind = computed<StrandKind>(() => (store.isGame && store.modules.quests ? 'quest' : 'plot'))
/** A game without the quests module starts from its main plot, like a novel, in the words of a game. */
const emptyCopy = computed(() => (store.isGame ? (store.modules.quests ? 'game' : 'gameNoQuests') : 'novel'))
</script>

<template>
  <section ref="root" class="@container" :class="pane ? 'pb-10' : ''">
    <!-- Header: the page's own, or the pane's compact bar. -->
    <template v-if="!pane">
      <DPageHeader :title="term('strands')" :description="guidance ? t(`strands.intro.${medium}`) : undefined">
        <template v-if="store.rows.strands.length" #actions>
          <UButton color="primary" :variant="desktop ? 'solid' : 'outline'" icon="i-lucide-plus" :label="t(`strands.new.${medium}`)" class="d-new-strand max-lg:min-h-11" @click="startCreating()" />
        </template>
      </DPageHeader>
      <DGuide v-if="guidance" :topic="store.isGame && store.modules.quests ? 'quests' : 'strands'" :default-open="false" class="-mt-3 mb-6" />
    </template>
    <div v-else class="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-default/60 bg-default px-4">
      <NuxtLink :to="`/p/${store.projectId}/strands`" class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ term('strands') }}</NuxtLink>
      <UTooltip :text="t(`strands.new.${medium}`)">
        <UButton icon="i-lucide-plus" color="neutral" variant="ghost" :aria-label="t(`strands.new.${medium}`)" class="d-new-strand" @click="startCreating()" />
      </UTooltip>
    </div>

    <div :class="pane ? 'px-2 pt-3' : ''">
      <!-- Filter by kind: a row of chips, scrolling sideways on a phone. -->
      <div
        v-if="showFilter"
        role="group"
        :aria-label="t('strands.filter.label')"
        class="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1"
        :class="pane ? 'flex-wrap' : 'sm:flex-wrap'"
      >
        <UButton
          size="sm"
          color="neutral"
          :variant="filter === null ? 'soft' : 'ghost'"
          :class="filter === null ? 'text-highlighted' : 'text-muted'"
          :aria-pressed="filter === null"
          class="shrink-0 max-lg:min-h-11"
          @click="filter = null"
        >
          {{ t('strands.filter.all') }}
          <span class="tabular text-dimmed">{{ number(store.rows.strands.length) }}</span>
        </UButton>
        <template v-for="kind in kinds" :key="kind">
          <UButton
            v-if="kindCounts.get(kind)"
            size="sm"
            color="neutral"
            :variant="filter === kind ? 'soft' : 'ghost'"
            :class="filter === kind ? 'text-highlighted' : 'text-muted'"
            :aria-pressed="filter === kind"
            class="shrink-0 max-lg:min-h-11"
            @click="filter = filter === kind ? null : kind"
          >
            {{ label('strandKind', kind) }}
            <span class="tabular text-dimmed">{{ number(kindCounts.get(kind) ?? 0) }}</span>
          </UButton>
        </template>
      </div>

      <!-- A new strand, in place. -->
      <form
        v-if="creating"
        class="mb-3 flex flex-col gap-2 rounded-[calc(var(--ui-radius)*2)] bg-muted p-3 @xl:flex-row @xl:items-end"
        @submit.prevent="create"
        @keydown.esc.stop="stopCreating"
      >
        <UFormField :label="t('strands.create.name')" class="min-w-0 flex-1">
          <UInput
            ref="nameInput"
            v-model="draft.name"
            :placeholder="t(`strands.create.placeholder.${medium}`)"
            maxlength="200"
            class="w-full"
            :ui="{ base: 'voice-author text-base max-lg:min-h-11' }"
          />
        </UFormField>
        <UFormField :label="t('strands.sheet.kind')" class="@xl:w-56">
          <USelect v-model="draft.kind" :items="kindItems" class="w-full max-lg:min-h-11" />
        </UFormField>
        <div class="flex gap-2">
          <UButton type="submit" color="neutral" variant="outline" :loading="busy" :disabled="!draft.name.trim()" :label="t('common.actions.create')" class="max-lg:min-h-11" />
          <UButton color="neutral" variant="ghost" :label="t('common.actions.cancel')" class="max-lg:min-h-11" @click="stopCreating" />
        </div>
      </form>

      <ArchitectureSortableList
        v-if="visible.length"
        :items="visible"
        :item-label="(s: Strand) => s.name"
        :label="term('strands')"
        :class="pane ? '' : '-mx-2'"
        @reorder="onReorder"
      >
        <template #default="{ item, first, last, move }">
          <StrandsRow
            :strand="item"
            :scenes="sceneCounts.get(item.id) ?? 0"
            :progress="progress(item)"
            :first="first"
            :last="last"
            :active="route.params.strandId === item.id"
            @move="move"
          />
        </template>
      </ArchitectureSortableList>

      <!-- Filtered to nothing. -->
      <div v-else-if="store.rows.strands.length" class="py-6 text-sm text-muted">
        {{ t('strands.filter.none') }}
        <UButton color="neutral" variant="link" :label="t('strands.filter.showAll')" class="px-1" @click="filter = null" />
      </div>

      <!-- Nothing yet: the shape of the list, what it is for, the first action. -->
      <div v-else-if="!pane && !creating">
        <ArchitectureGhostRows class="-mx-2" />
        <DEmptyState
          :title="t(`strands.empty.title.${medium}`)"
          :description="guidance ? t(`strands.empty.body.${emptyCopy}`) : undefined"
          :actions="[
            { label: t(`strands.empty.action.${emptyCopy}`), icon: 'i-lucide-plus', color: 'primary', variant: desktop ? 'solid' : 'outline', class: 'd-new-strand max-lg:min-h-11', onClick: () => startCreating(firstKind) },
            { label: t('strands.empty.wayOut'), color: 'neutral', variant: 'link', to: `/p/${store.projectId}/architecture/fabula`, class: 'max-lg:min-h-11' },
          ]"
        />
      </div>
    </div>
  </section>
</template>
