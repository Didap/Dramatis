<script setup lang="ts">

/**
 * The bosses and enemies of a game with a bestiary (VRS-683): characters of those two categories,
 * bosses first, each group in the author's order. Created inline as an enemy or as a boss; each
 * opens the character sheet. `compact` is the side column of a sheet, from xl.
 */
const props = withDefaults(defineProps<{
  compact?: boolean
  activeId?: string
}>(), { compact: false, activeId: undefined })

/** The category being created, or null. */
const creating = defineModel<'enemy' | 'boss' | null>('creating', { default: null })

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const query = ref('')
const filter = ref<{ focus: () => void } | null>(null)

const GROUPS = ['boss', 'enemy'] as const
/** The copy of each group: its heading, its add button, the name it asks for. */
const COPY = {
  boss: { title: 'characters.enemies.bosses', add: 'characters.enemies.addBoss', placeholder: 'characters.enemies.bossPlaceholder' },
  enemy: { title: 'characters.enemies.enemies', add: 'characters.enemies.addEnemy', placeholder: 'characters.enemies.enemyPlaceholder' },
} as const

const all = computed(() => store.enemies)
const needle = computed(() => query.value.trim().toLocaleLowerCase())
const visible = computed(() => needle.value ? all.value.filter(c => c.name.toLocaleLowerCase().includes(needle.value)) : all.value)
const groups = computed(() => GROUPS
  .map(category => ({ category, items: visible.value.filter(c => c.category === category) }))
  .filter(group => group.items.length))

function clearFilter() {
  query.value = ''
  filter.value?.focus()
}

async function create(name: string) {
  const category = creating.value ?? 'enemy'
  const row = await store.create('characters', { name, category, importance: category === 'boss' ? 'secondary' : 'minor' })
  creating.value = null
  query.value = ''
  await navigateTo(store.refPath({ type: 'character', id: row.id }))
}
</script>

<template>
  <div class="d-enemies-list">
    <div v-if="props.compact" class="mb-2 flex items-center justify-between gap-2 ps-2">
      <NuxtLink :to="`/p/${store.projectId}/enemies`" class="text-sm font-medium text-muted hover:text-default">
        {{ term('enemies') }}
      </NuxtLink>
      <UButton icon="i-lucide-plus" size="sm" color="neutral" variant="ghost" :aria-label="t('characters.enemies.addEnemy')" data-world-create @click="creating = 'enemy'" />
    </div>

    <WorldFilter
      v-if="all.length > 7"
      ref="filter"
      v-model="query"
      :placeholder="t('characters.enemies.filter')"
      :compact="props.compact"
      class="mb-2"
    />

    <WorldCreateRow
      v-if="creating"
      :placeholder="t(COPY[creating].placeholder)"
      :create="create"
      icon="i-lucide-skull"
      @cancel="creating = null"
    />

    <section v-for="group in groups" :key="group.category" class="mb-6" :aria-labelledby="`enemies-${group.category}`">
      <div class="mb-1 flex items-center justify-between gap-2 px-2">
        <h2 :id="`enemies-${group.category}`" class="text-xs font-medium text-muted">
          {{ t(COPY[group.category].title) }}
        </h2>
        <UButton
          v-if="!props.compact"
          icon="i-lucide-plus"
          size="sm"
          color="neutral"
          variant="ghost"
          class="max-lg:size-11 max-lg:justify-center"
          :aria-label="t(COPY[group.category].add)"
          @click="creating = group.category"
        />
      </div>
      <WorldList collection="characters" :items="group.items" :label="t(COPY[group.category].title)" :compact="props.compact">
        <template #row="{ item }">
          <CharactersEnemyRow :character="item" :compact="props.compact" :active="item.id === props.activeId" />
        </template>
      </WorldList>
    </section>

    <WorldNoMatch v-if="needle && !groups.length" :query="query" @clear="clearFilter" />

    <WorldEmptyList
      v-else-if="!all.length && !creating && !props.compact"
      :text="t('characters.enemies.empty')"
      :question="t('characters.enemies.emptyQuestion')"
      :action="t('characters.enemies.addEnemy')"
      icon="i-lucide-skull"
      @action="creating = 'enemy'"
    />
  </div>
</template>
