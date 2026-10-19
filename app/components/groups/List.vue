<script setup lang="ts">
import type { Group } from '#shared/types/entities'

/**
 * The groups of the project (factions, in games) in the author's order: create inline, filter by name
 * or kind, reorder, move to the trash. `compact` is the side column of a sheet, from xl.
 */
const props = withDefaults(defineProps<{
  compact?: boolean
  activeId?: string
}>(), { compact: false, activeId: undefined })

const creating = defineModel<boolean>('creating', { default: false })

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const mt = (key: string) => t(`groups.${store.kind}.${key}`)
const query = ref('')
const filter = ref<{ focus: () => void } | null>(null)

/** Members of each group: membership relationships whose member still exists. */
const members = computed(() => {
  const counts = new Map<string, number>()
  for (const relation of store.rows.relations) {
    if (relation.kind !== 'membership' || relation.targetType !== 'group') continue
    if (!store.getRef({ type: relation.sourceType, id: relation.sourceId })) continue
    counts.set(relation.targetId, (counts.get(relation.targetId) ?? 0) + 1)
  }
  return counts
})

const needle = computed(() => query.value.trim().toLocaleLowerCase())
const visible = computed<Group[]>(() => {
  if (!needle.value) return store.rows.groups
  return store.rows.groups.filter(group =>
    group.name.toLocaleLowerCase().includes(needle.value) || label('groupKind', group.kind).toLocaleLowerCase().includes(needle.value))
})

function clearFilter() {
  query.value = ''
  filter.value?.focus()
}

async function create(name: string) {
  const row = await store.create('groups', { name, ...(store.isGame ? { kind: 'faction' as const } : {}) })
  creating.value = false
  query.value = ''
  await navigateTo(store.refPath({ type: 'group', id: row.id }))
}
</script>

<template>
  <div class="d-groups-list">
    <div v-if="props.compact" class="mb-2 flex items-center justify-between gap-2 ps-2">
      <NuxtLink :to="`/p/${store.projectId}/groups`" class="text-sm font-medium text-muted hover:text-default">
        {{ term('groups') }}
      </NuxtLink>
      <UButton icon="i-lucide-plus" size="sm" color="neutral" variant="ghost" :aria-label="mt('add')" data-world-create @click="creating = true" />
    </div>

    <WorldFilter
      v-if="store.rows.groups.length > 7"
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
      icon="i-lucide-users-round"
      @cancel="creating = false"
    />

    <WorldList v-if="visible.length" collection="groups" :items="visible" :label="term('groups')" :compact="props.compact">
      <template #row="{ item }">
        <GroupsRow :group="item" :members="members.get(item.id) ?? 0" :compact="props.compact" :active="item.id === props.activeId" />
      </template>
    </WorldList>

    <WorldNoMatch v-else-if="needle" :query="query" @clear="clearFilter" />

    <WorldEmptyList
      v-else-if="!creating && !props.compact"
      :text="mt('empty')"
      :question="mt('emptyQuestion')"
      :action="mt('add')"
      icon="i-lucide-users-round"
      @action="creating = true"
    />
  </div>
</template>
