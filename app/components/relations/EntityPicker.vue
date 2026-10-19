<script setup lang="ts">
import type { WorldRefType } from '#shared/types/domain'
import { CHARACTER_IMPORTANCES } from '#shared/utils/constants'

/**
 * "Aggiungi" on a map (spec 5.4): characters, locations, objects and groups, searchable, several at
 * once, grouped by kind; "Aggiungi anche i collegati" also brings the entities they are tied to.
 * In a project with nobody in it yet, it says so and leads to the sections where they are created.
 */
const props = withDefaults(defineProps<{
  /** Keys already on the map: listed, but not selectable. */
  onMap?: string[]
  autofocus?: boolean
}>(), { onMap: () => [], autofocus: true })

const emit = defineEmits<{ add: [keys: string[], withLinked: boolean] }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()

interface Item {
  id: string
  label: string
  /** Name and aliases, for the search. */
  search: string
  suffix?: string
  disabled?: boolean
  icon?: string
  avatar?: { src?: string, alt: string }
}

const TYPES: WorldRefType[] = ['character', 'location', 'object', 'group']
const IMPORTANCE = Object.fromEntries(CHARACTER_IMPORTANCES.map((k, i) => [k, i]))

const groups = computed<{ id: string, label: string, items: Item[] }[]>(() => {
  const taken = new Set(props.onMap)
  return TYPES.map((type) => {
    const rows = type === 'character'
      ? [...store.rows.characters].sort((a, b) => (IMPORTANCE[a.importance] ?? 9) - (IMPORTANCE[b.importance] ?? 9) || a.position - b.position)
      : (store.rows[`${type}s` as 'locations' | 'objects' | 'groups'] as { id: string, name: string }[])
    const items = rows.map((row): Item => {
      const key = `${type}:${row.id}`
      const image = store.primaryImage(type, row.id)
      const aliases = type === 'character' ? (row as { aliases?: string[] }).aliases ?? [] : []
      return {
        id: key,
        label: row.name,
        search: [row.name, ...aliases].join(' '),
        suffix: taken.has(key) ? t('relations.picker.onMap') : undefined,
        disabled: taken.has(key),
        ...(image ? { avatar: { src: mediaUrl(image, 'thumb'), alt: row.name } } : { icon: REF_ICONS[type] }),
      }
    })
    return { id: type, label: term(type, 2), items }
  }).filter(g => g.items.length)
})

const selected = shallowRef<Item[]>([])
const withLinked = ref(false)
const free = computed(() => groups.value.some(g => g.items.some(i => !i.disabled)))

function add() {
  if (!selected.value.length) return
  emit('add', selected.value.map(i => i.id), withLinked.value)
  selected.value = []
}
</script>

<template>
  <RelationsWhereToCreate
    v-if="!groups.length"
    class="relations-picker px-4 py-5"
    :text="t(store.isGame ? 'relations.picker.nothingGame' : 'relations.picker.nothing')"
  />
  <div v-else class="relations-picker flex max-h-[min(30rem,70dvh)] flex-col">
    <UCommandPalette
      :model-value="selected as never"
      @update:model-value="(v: unknown) => { selected = v as never }"
      multiple
      by="id"
      :groups="groups as never"
      :autofocus="autofocus"
      :placeholder="t(store.isGame ? 'relations.picker.searchGame' : 'relations.picker.search')"
      :fuse="{ fuseOptions: { keys: ['label', 'search'], ignoreDiacritics: true, threshold: 0.2, ignoreLocation: true }, resultLimit: 40 }"
      class="min-h-0 flex-1"
      :ui="{ itemLabelBase: 'voice-author', itemLabelSuffix: 'text-dimmed', item: 'max-lg:min-h-11 max-lg:items-center' }"
    >
      <template #empty>
        <p class="px-4 py-6 text-center text-sm text-muted">{{ free ? t('relations.picker.noMatch') : t('relations.picker.allOnMap') }}</p>
      </template>
    </UCommandPalette>
    <div class="flex flex-wrap items-center gap-3 border-t border-default px-3 py-3">
      <UCheckbox v-model="withLinked" :label="t('relations.picker.withLinked')" class="items-center max-lg:min-h-11" />
      <UButton
        color="primary"
        variant="solid"
        class="ms-auto max-lg:min-h-11"
        icon="i-lucide-plus"
        :disabled="!selected.length"
        :label="selected.length ? t('relations.picker.addCount', { n: selected.length }, selected.length) : t('relations.picker.add')"
        @click="add"
      />
    </div>
  </div>
</template>
