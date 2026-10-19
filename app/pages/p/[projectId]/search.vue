<script setup lang="ts">
import type { SceneStatus } from '#shared/types/domain'
import { SCENE_STATUSES } from '#shared/utils/constants'
import type { SearchGroup, SearchResponse, SearchType } from '~~/server/api/projects/[projectId]/search.get'

/**
 * Project search (spec 4.6, 5.9): a word or a name anywhere in the project, case and accent
 * insensitive. Results grouped by kind with counts; scenes with where they sit, their status and the
 * passage. Filters by kind, chapter and status (in a drawer on a phone). `?q=` holds the query.
 */
const store = useProjectStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { term } = useTerms()
const { options } = useEnums()
const { number } = useFormat()

/** The search endpoint takes up to 200 characters. */
const MAX_QUERY = 200

const query = ref(String(route.query.q ?? '').slice(0, MAX_QUERY))
const result = ref<SearchResponse | null>(null)
const loading = ref(false)
const failed = ref(false)
let ticket = 0

async function search(text: string) {
  const mine = ++ticket
  const q = text.trim().slice(0, MAX_QUERY)
  if (!q) {
    result.value = null
    loading.value = false
    return
  }
  loading.value = true
  failed.value = false
  try {
    const found = await $fetch<SearchResponse>(`/api/projects/${store.projectId}/search`, { query: { q, limit: 200 } })
    if (mine === ticket) result.value = found
  }
  catch (error) {
    if (mine === ticket) {
      failed.value = true
      notifyError(error)
    }
  }
  finally {
    if (mine === ticket) loading.value = false
  }
}

const debounced = useDebounceFn((q: string) => {
  void router.replace({ query: { ...route.query, q: q.trim().slice(0, MAX_QUERY) || undefined } })
  void search(q)
}, 250)
watch(query, q => debounced(q))
// Another search started from the palette while this page is open.
watch(() => route.query.q, (q) => {
  const value = String(q ?? '').slice(0, MAX_QUERY)
  if (value.trim() !== query.value.trim()) query.value = value
})
onMounted(() => { void search(query.value) })

// ---------------------------------------------------------------- filters

const type = ref<'all' | SearchType>('all')
// Select items cannot have an empty value: 'all' means no filter.
const chapterId = ref<string>('all')
const status = ref<'all' | SceneStatus>('all')
watch(result, () => {
  if (type.value !== 'all' && !result.value?.groups.some(g => g.type === type.value)) type.value = 'all'
})

function groupLabel(kind: SearchType) {
  switch (kind) {
    case 'scene': return term('scene', 2)
    case 'architecture': return term('architecture')
    case 'character': return term('characters')
    case 'group': return term('groups')
    case 'location': return term('locations')
    case 'object': return term('objects')
    case 'strand': return term('strands')
    case 'chapter': return term('chapter', 2)
    case 'part': return term('part', 2)
    case 'event': return term('event', 2)
    case 'note': return term('notes')
    case 'variable': return term('variables')
    default: return t(`search.types.${kind}`)
  }
}

const sceneFilters = computed(() => chapterId.value !== 'all' || status.value !== 'all')
const groups = computed<SearchGroup[]>(() => {
  let list = result.value?.groups ?? []
  if (sceneFilters.value) {
    list = list
      .filter(g => g.type === 'scene')
      .map(g => ({ ...g, items: g.items.filter(i => (chapterId.value === 'all' || i.chapterId === chapterId.value) && (status.value === 'all' || i.status === status.value)) }))
      .map(g => ({ ...g, total: g.items.length }))
      .filter(g => g.items.length)
  }
  if (type.value !== 'all') list = list.filter(g => g.type === type.value)
  return list
})
const shown = computed(() => groups.value.reduce((n, g) => n + g.total, 0))

/** What the search found, said once in the live region: how many, nothing, or nothing with these filters. */
const statusText = computed(() => {
  const found = result.value
  if (!found) return ''
  if (!found.total) return t('search.none', { q: found.q })
  if (!shown.value) return t('search.noneFiltered')
  return t('search.summary', { n: number(shown.value), q: found.q }, shown.value)
})

const typeOptions = computed(() => [
  { value: 'all' as const, label: t('search.filters.all'), count: result.value?.total ?? 0 },
  ...(result.value?.groups ?? []).map(g => ({ value: g.type, label: groupLabel(g.type), count: g.total })),
])
const chapterOptions = computed(() => [
  { value: 'all', label: t('search.filters.anyChapter') },
  ...store.orderedChapters.map((c, i) => ({ value: c.id, label: `${i + 1}. ${c.title || t('common.untitled.chapter')}` })),
])
const statusOptions = computed(() => [
  { value: 'all', label: t('search.filters.anyStatus') },
  ...options('sceneStatus', SCENE_STATUSES).map(o => ({ ...o, icon: statusIcon('scene', o.value) })),
])
const activeFilters = computed(() => Number(type.value !== 'all') + Number(chapterId.value !== 'all') + Number(status.value !== 'all'))
function clearFilters() {
  type.value = 'all'
  chapterId.value = 'all'
  status.value = 'all'
}
const filtersOpen = ref(false)

const input = useTemplateRef<{ inputRef: HTMLInputElement | null }>('input')
defineShortcuts({ '/': () => input.value?.inputRef?.focus() })
</script>

<template>
  <DPage :title="t('search.title')">
    <h1 class="sr-only">{{ t('search.title') }}</h1>
    <form role="search" class="mb-6" @submit.prevent="search(query)">
      <label for="project-search" class="sr-only">{{ t('search.label') }}</label>
      <UInput
        id="project-search"
        ref="input"
        v-model="query"
        type="search"
        size="xl"
        icon="i-lucide-search"
        :loading="loading"
        :placeholder="t('search.placeholder')"
        :maxlength="MAX_QUERY"
        autofocus
        enterkeyhint="search"
        class="w-full"
        :ui="{ base: 'text-base' }"
      />
    </form>

    <!-- Before the first word: what can be found. -->
    <p v-if="!query.trim()" class="max-w-prose text-pretty text-muted">{{ t('search.intro') }}</p>

    <template v-else>
      <!-- In place before the first answer, so the live region reads out the count or why there is nothing. -->
      <div class="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <p role="status" :class="shown ? 'text-sm text-muted' : 'max-w-prose text-pretty text-toned'">
          {{ statusText }}
          <UButton
            v-if="result?.total && !shown"
            :label="t('search.filters.clear')"
            color="primary"
            variant="link"
            class="px-0 align-baseline underline underline-offset-3"
            @click="clearFilters"
          />
        </p>

        <!-- Desktop: the filters inline. -->
        <div v-if="result?.total" class="hidden flex-1 flex-wrap items-center justify-end gap-2 sm:flex">
          <USelect v-model="type" :items="typeOptions" size="sm" class="w-44" :aria-label="t('search.filters.type')">
            <template #item-trailing="{ item }">
              <span class="tabular text-xs text-dimmed">{{ (item as { count: number }).count }}</span>
            </template>
          </USelect>
          <USelect v-model="chapterId" :items="chapterOptions" size="sm" class="w-52" :aria-label="t('search.filters.chapter')" />
          <USelect v-model="status" :items="statusOptions" size="sm" class="w-40" :aria-label="t('search.filters.status')" />
          <UButton v-if="activeFilters" :label="t('search.filters.clear')" color="primary" variant="link" size="sm" class="underline underline-offset-3 max-lg:min-h-11" @click="clearFilters" />
        </div>

        <!-- Phone: the filters in a drawer. -->
        <UDrawer v-if="result?.total" v-model:open="filtersOpen" :title="t('search.filters.title')" class="sm:hidden">
          <UButton
            icon="i-lucide-sliders-horizontal"
            :label="activeFilters ? t('search.filters.buttonActive', { n: activeFilters }) : t('search.filters.button')"
            color="neutral"
            variant="outline"
            size="sm"
            class="ms-auto min-h-11 sm:hidden"
          />
          <template #body>
            <div class="space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <UFormField :label="t('search.filters.type')">
                <USelect v-model="type" :items="typeOptions" class="w-full" />
              </UFormField>
              <UFormField :label="t('search.filters.chapter')">
                <USelect v-model="chapterId" :items="chapterOptions" class="w-full" />
              </UFormField>
              <UFormField :label="t('search.filters.status')">
                <USelect v-model="status" :items="statusOptions" class="w-full" />
              </UFormField>
              <div class="flex gap-2">
                <UButton :label="t('search.filters.clear')" color="neutral" variant="ghost" block :disabled="!activeFilters" @click="clearFilters" />
                <UButton :label="t('search.filters.show', { n: shown }, shown)" color="primary" variant="solid" block @click="filtersOpen = false" />
              </div>
            </div>
          </template>
        </UDrawer>
      </div>

      <div v-if="result && groups.length" class="space-y-8">
        <section v-for="group in groups" :key="group.type" :aria-labelledby="`search-${group.type}`">
          <h2 :id="`search-${group.type}`" class="mb-1 flex items-baseline gap-2 px-2 text-sm font-medium text-muted">
            {{ groupLabel(group.type) }}
            <span class="tabular text-xs text-dimmed">{{ number(group.total) }}</span>
          </h2>
          <ul>
            <li v-for="match in group.items" :key="`${match.type}:${match.id}`">
              <SearchResult :match="match" :query="result.q" />
            </li>
          </ul>
          <p v-if="group.total > group.items.length" class="px-2 pt-1 text-xs text-muted">
            {{ t('search.more', { n: number(group.total - group.items.length) }, group.total - group.items.length) }}
          </p>
        </section>
      </div>
      <div v-else-if="loading && !result" class="space-y-3" aria-busy="true">
        <USkeleton v-for="i in 4" :key="i" class="h-14 w-full" />
      </div>
      <p v-else-if="failed && !result" class="text-muted">{{ t('search.failed') }}</p>
    </template>
  </DPage>
</template>
