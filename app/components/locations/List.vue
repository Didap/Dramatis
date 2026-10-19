<script setup lang="ts">
import type { StoryLocation } from '#shared/types/entities'

/**
 * The locations of the project in the author's order: create inline, filter (name, kind, city, region,
 * nation), reorder, move to the trash. When they span more than one region or nation they can be
 * grouped by nation and region (spec 6, P1); rows then move within their group. `compact` is the side
 * column of a sheet, from xl.
 */
const props = withDefaults(defineProps<{
  compact?: boolean
  activeId?: string
}>(), { compact: false, activeId: undefined })

const creating = defineModel<boolean>('creating', { default: false })

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const mt = (key: string) => t(`locations.${store.kind}.${key}`)
const query = ref('')
const filter = ref<{ focus: () => void } | null>(null)
const grouped = useLocalStorage(`dramatis:locations:grouped:${store.projectId}`, true)

/** Scenes set in each location (tags, manual or from mentions). */
const scenes = computed(() => {
  const counts = new Map<string, number>()
  for (const scene of store.rows.scenes) {
    for (const id of scene.locationIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
})

const needle = computed(() => query.value.trim().toLocaleLowerCase())
const visible = computed<StoryLocation[]>(() => {
  if (!needle.value) return store.rows.locations
  return store.rows.locations.filter(l =>
    [l.name, l.kind, l.city, l.region, l.nation].some(text => text.toLocaleLowerCase().includes(needle.value)))
})

const placeKey = (l: StoryLocation) => `${l.nation.trim().toLocaleLowerCase()}|${l.region.trim().toLocaleLowerCase()}`

/** Grouping is offered when the places span at least two nation and region pairs. */
const canGroup = computed(() => new Set(store.rows.locations.map(placeKey)).size > 1)
const showGrouped = computed(() => canGroup.value && grouped.value)

interface Section {
  key: string
  title: string
  items: StoryLocation[]
}

/** Groups in the order of their first location; the one without a place last. */
const sections = computed<Section[]>(() => {
  const map = new Map<string, Section>()
  for (const location of visible.value) {
    const key = placeKey(location)
    let section = map.get(key)
    if (!section) {
      const title = [location.region.trim(), location.nation.trim()].filter(Boolean).join(', ')
      section = { key, title: title || t('locations.noPlace'), items: [] }
      map.set(key, section)
    }
    section.items.push(location)
  }
  const list = [...map.values()]
  return [...list.filter(s => s.key !== '|'), ...list.filter(s => s.key === '|')]
})

function clearFilter() {
  query.value = ''
  filter.value?.focus()
}

async function create(name: string) {
  const row = await store.create('locations', { name })
  creating.value = false
  query.value = ''
  await navigateTo(store.refPath({ type: 'location', id: row.id }))
}
</script>

<template>
  <div class="d-locations-list">
    <div v-if="props.compact" class="mb-2 flex items-center justify-between gap-2 ps-2">
      <NuxtLink :to="`/p/${store.projectId}/locations`" class="text-sm font-medium text-muted hover:text-default">
        {{ term('locations') }}
      </NuxtLink>
      <UButton icon="i-lucide-plus" size="sm" color="neutral" variant="ghost" :aria-label="mt('add')" data-world-create @click="creating = true" />
    </div>

    <div v-if="store.rows.locations.length > 7 || (canGroup && !props.compact)" class="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2">
      <WorldFilter
        v-if="store.rows.locations.length > 7"
        ref="filter"
        v-model="query"
        :placeholder="t('world.list.filterByNameKindOrPlace')"
        :compact="props.compact"
      />
      <USwitch v-if="canGroup && !props.compact" v-model="grouped" :label="t('locations.groupByPlace')" class="max-lg:min-h-11" />
    </div>

    <WorldCreateRow
      v-if="creating"
      :placeholder="mt('namePlaceholder')"
      :create="create"
      icon="i-lucide-map-pin"
      @cancel="creating = false"
    />

    <template v-if="visible.length">
      <div v-if="showGrouped" class="space-y-5">
        <section v-for="section in sections" :key="section.key">
          <component :is="props.compact ? 'p' : 'h2'" class="mb-1 flex items-baseline gap-2 px-2 pt-1" :class="props.compact ? 'text-sm' : ''">
            <span :class="section.key === '|' ? 'text-sm font-medium text-muted' : 'voice-author text-toned'">{{ section.title }}</span>
            <span class="tabular text-xs text-dimmed" aria-hidden="true">{{ section.items.length }}</span>
          </component>
          <WorldList collection="locations" :items="section.items" :label="section.title" :compact="props.compact">
            <template #row="{ item }">
              <LocationsRow
                :location="item"
                :scenes="scenes.get(item.id) ?? 0"
                :compact="props.compact"
                :active="item.id === props.activeId"
                :omit="{ region: true, nation: true }"
              />
            </template>
          </WorldList>
        </section>
      </div>
      <WorldList v-else collection="locations" :items="visible" :label="term('locations')" :compact="props.compact">
        <template #row="{ item }">
          <LocationsRow :location="item" :scenes="scenes.get(item.id) ?? 0" :compact="props.compact" :active="item.id === props.activeId" />
        </template>
      </WorldList>
    </template>

    <WorldNoMatch v-else-if="needle" :query="query" @clear="clearFilter" />

    <WorldEmptyList
      v-else-if="!creating && !props.compact"
      :text="mt('empty')"
      :question="mt('emptyQuestion')"
      :action="mt('add')"
      icon="i-lucide-map-pin"
      @action="creating = true"
    />
  </div>
</template>
