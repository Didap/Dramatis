<script setup lang="ts">
import type { ObjectCategory } from '#shared/types/domain'
import type { StoryObject } from '#shared/types/entities'

/**
 * The objects of the project (items, in English games) in the author's order: create inline, filter
 * by name or kind, reorder, move to the trash. `compact` is the side column of a sheet, from xl.
 * `category`: in a game with a bestiary (VRS-683), only the objects of that category, and new ones join it.
 */
const props = withDefaults(defineProps<{
  compact?: boolean
  activeId?: string
  category?: ObjectCategory
}>(), { compact: false, activeId: undefined, category: undefined })

const creating = defineModel<boolean>('creating', { default: false })

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const mt = (key: string) => t(`${objectCopy(props.category, store.kind)}.${key}`)
/** Its section: page, term and icon. */
const shelf = computed(() => OBJECT_SHELVES[props.category ?? 'object'])
const icon = computed(() => SECTION_ICONS[shelf.value])
/** The objects of this list: every one, or those of its category. */
const pool = computed(() => store.objectsOf(props.category))
const query = ref('')
const filter = ref<{ focus: () => void } | null>(null)

/** Scenes where each object appears (tags, manual or from mentions). */
const scenes = computed(() => {
  const counts = new Map<string, number>()
  for (const scene of store.rows.scenes) {
    for (const id of scene.objectIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
})

const needle = computed(() => query.value.trim().toLocaleLowerCase())
const visible = computed<StoryObject[]>(() => {
  if (!needle.value) return pool.value
  return pool.value.filter(o => o.name.toLocaleLowerCase().includes(needle.value) || o.kind.toLocaleLowerCase().includes(needle.value))
})

function clearFilter() {
  query.value = ''
  filter.value?.focus()
}

async function create(name: string) {
  const row = await store.create('objects', props.category ? { name, category: props.category } : { name })
  creating.value = false
  query.value = ''
  await navigateTo(store.refPath({ type: 'object', id: row.id }))
}
</script>

<template>
  <div class="d-objects-list">
    <div v-if="props.compact" class="mb-2 flex items-center justify-between gap-2 ps-2">
      <NuxtLink :to="`/p/${store.projectId}/${shelf}`" class="text-sm font-medium text-muted hover:text-default">
        {{ term(shelf) }}
      </NuxtLink>
      <UButton icon="i-lucide-plus" size="sm" color="neutral" variant="ghost" :aria-label="mt('add')" data-world-create @click="creating = true" />
    </div>

    <WorldFilter
      v-if="pool.length > 7"
      ref="filter"
      v-model="query"
      :placeholder="t('world.list.filterByNameOrKind')"
      :compact="props.compact"
      class="mb-2"
    />

    <WorldCreateRow
      v-if="creating"
      :placeholder="mt('namePlaceholder')"
      :create="create"
      :icon="icon"
      @cancel="creating = false"
    />

    <WorldList v-if="visible.length" collection="objects" :items="visible" :label="term(shelf)" :compact="props.compact">
      <template #row="{ item }">
        <ObjectsRow :object="item" :scenes="scenes.get(item.id) ?? 0" :compact="props.compact" :active="item.id === props.activeId" :icon="icon" />
      </template>
    </WorldList>

    <WorldNoMatch v-else-if="needle" :query="query" @clear="clearFilter" />

    <WorldEmptyList
      v-else-if="!creating && !props.compact"
      :text="mt('empty')"
      :question="mt('emptyQuestion')"
      :action="mt('add')"
      :icon="icon"
      @action="creating = true"
    />
  </div>
</template>
