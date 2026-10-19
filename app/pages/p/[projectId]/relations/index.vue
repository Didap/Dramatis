<script setup lang="ts">
import type { RelationKind } from '#shared/types/domain'
import { RELATION_KINDS } from '#shared/utils/constants'

/**
 * Relations (spec 4.4): the maps, and the Elenco with every relationship, the full keyboard and
 * screen-reader alternative to the maps. Tabs, filters and the open relationship live in the query
 * string (?tab=maps|list&entity=&kind=&relation=). On a phone the list is the default tab.
 */
const route = useRoute()
const router = useRouter()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { number } = useFormat()
// The window's width is read at once (a media query only answers after mounting): no phone flash on desktop.
const { width } = useWindowSize()
const desktop = computed(() => width.value >= 1024)

const editor = ref<{ show: (state: { relationId?: string | null, a?: string | null, b?: string | null }) => void } | null>(null)
const guidance = computed(() => store.project?.settings.guidance !== false)

function setQuery(patch: Record<string, string | undefined>) {
  void router.replace({ query: { ...route.query, ...patch } })
}

type Tab = 'maps' | 'list'
const tab = computed<Tab>({
  get: () => (route.query.tab === 'maps' || route.query.tab === 'list' ? route.query.tab : desktop.value ? 'maps' : 'list'),
  set: value => setQuery({ tab: value }),
})

const entity = computed<string | null>({
  get: () => (typeof route.query.entity === 'string' ? route.query.entity : null),
  set: value => setQuery({ entity: value ?? undefined }),
})

const kinds = computed<RelationKind[]>({
  get: () => String(route.query.kind ?? '').split(',').filter((k): k is RelationKind => (RELATION_KINDS as readonly string[]).includes(k)),
  set: value => setQuery({ kind: value.length ? value.join(',') : undefined }),
})

const mapCount = computed(() => store.rows.maps.length)
/** Relationships whose two sides exist (a side in the trash hides them). */
const relationCount = computed(() => store.rows.relations.filter(r =>
  !!store.getRef({ type: r.sourceType, id: r.sourceId }) && !!store.getRef({ type: r.targetType, id: r.targetId })).length)

const tabs = computed(() => [
  { label: t('relations.tabs.maps'), value: 'maps', slot: 'maps' as const, count: mapCount.value },
  { label: t('relations.tabs.list'), value: 'list', slot: 'list' as const, count: relationCount.value },
])

/** The tab panel can take the focus (from the tabs, with Tab): it shows it. */
const panel = 'rounded-[calc(var(--ui-radius)*2)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--ui-primary)'

// UTabs gives its attributes to the root, not to the tablist: the list gets its name here.
const tabsBox = ref<HTMLElement | null>(null)
watchPostEffect(() => tabsBox.value?.querySelector('[role="tablist"]')?.setAttribute('aria-label', t('relations.tabs.label')))

const creating = ref(false)

/** The first map is "Mappa principale" (spec 5.4), the next ones are numbered. */
async function newMap() {
  if (creating.value) return
  creating.value = true
  try {
    const name = mapCount.value ? t('relations.maps.nthName', { n: mapCount.value + 1 }) : t('relations.maps.firstName')
    const map = await store.create('maps', { name, nodes: {} })
    await navigateTo(`/p/${store.projectId}/relations/${map.id}`)
  }
  catch {
    // The store has already shown the error.
  }
  finally {
    creating.value = false
  }
}

const newRelation = () => editor.value?.show({ a: entity.value })
const openRelation = (id: string) => editor.value?.show({ relationId: id })
</script>

<template>
  <DPage :title="term('relations')">
    <DPageHeader :title="term('relations')" :description="guidance ? t('relations.intro') : undefined">
      <template #actions>
        <UButton
          v-if="tab === 'maps' && mapCount"
          color="primary"
          variant="solid"
          icon="i-lucide-plus"
          class="max-lg:min-h-11"
          :loading="creating"
          :label="t('relations.maps.new')"
          @click="newMap"
        />
        <UButton
          v-else-if="tab === 'list' && relationCount"
          color="primary"
          variant="solid"
          icon="i-lucide-plus"
          class="max-lg:min-h-11"
          :label="t('relations.list.new')"
          @click="newRelation"
        />
      </template>
    </DPageHeader>

    <div ref="tabsBox">
      <UTabs
        v-model="tab"
        :items="tabs"
        :variant="desktop ? 'link' : 'pill'"
        color="neutral"
        :ui="desktop
          ? { root: 'gap-6', list: 'border-b border-default', trigger: 'px-3', content: panel }
          : { root: 'w-full gap-6', list: 'w-full', trigger: 'min-h-11 flex-1 data-[state=active]:text-highlighted', indicator: 'bg-default ring ring-default', content: panel }"
      >
        <template #trailing="{ item }">
          <span class="tabular text-xs font-normal text-muted">{{ number((item as { count: number }).count) }}</span>
        </template>
        <template #maps>
          <RelationsMapList @create="newMap" />
        </template>
        <template #list>
          <RelationsList v-model:entity="entity" v-model:kinds="kinds" @open="openRelation" @create="newRelation" />
        </template>
      </UTabs>
    </div>

    <RelationsEditor ref="editor" routed />
  </DPage>
</template>
