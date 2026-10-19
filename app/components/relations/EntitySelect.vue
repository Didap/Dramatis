<script setup lang="ts">
import type { WorldRefType } from '#shared/types/domain'
import { CHARACTER_IMPORTANCES } from '#shared/utils/constants'

/**
 * Picks one character, location, object or group of the project, grouped by kind, with search on
 * names and aliases. The value is the entity's key, "<type>:<id>" (as in map nodes and mentions).
 */
const props = withDefaults(defineProps<{
  modelValue: string | null
  /** Keys that cannot be picked (the other side of a relationship). */
  exclude?: string[]
  placeholder?: string
  ariaLabel?: string
  /** Show the kinds of entity in this order. */
  types?: WorldRefType[]
}>(), { exclude: () => [], placeholder: undefined, ariaLabel: undefined, types: () => ['character', 'location', 'object', 'group'] })

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
/** On a phone the search field waits for a tap, so the keyboard does not cover the list. */
const { width } = useWindowSize()
const desktop = computed(() => width.value >= 1024)

interface Item {
  label: string
  value: string
  search: string
  description?: string
  icon?: string
  avatar?: { src?: string, alt: string }
  disabled?: boolean
}

const IMPORTANCE = Object.fromEntries(CHARACTER_IMPORTANCES.map((k, i) => [k, i]))

const groups = computed(() => {
  const skip = new Set(props.exclude)
  const out: ({ type: 'label', label: string } | Item)[][] = []
  for (const type of props.types) {
    let items: Item[] = []
    if (type === 'character') {
      items = [...store.rows.characters]
        .sort((a, b) => (IMPORTANCE[a.importance] ?? 9) - (IMPORTANCE[b.importance] ?? 9) || a.position - b.position)
        .map((c) => {
          const image = store.primaryImage('character', c.id)
          return {
            label: c.name,
            value: `character:${c.id}`,
            search: [c.name, ...c.aliases].join(' '),
            description: c.tagline || undefined,
            ...(image ? { avatar: { src: mediaUrl(image, 'thumb'), alt: c.name } } : { icon: REF_ICONS.character }),
          }
        })
    }
    else {
      items = store.worldEntitiesOf(type).map(e => ({
        label: e.name,
        value: `${type}:${e.id}`,
        search: e.name,
        icon: REF_ICONS[type],
      }))
    }
    items = items.filter(i => !skip.has(i.value))
    if (items.length) out.push([{ type: 'label', label: term(type, 2) }, ...items])
  }
  return out
})

const value = computed({
  get: () => props.modelValue ?? undefined,
  set: (v: string | undefined) => emit('update:modelValue', v ?? null),
})
</script>

<template>
  <USelectMenu
    :model-value="value as never"
    @update:model-value="(v: never) => { value = v }"
    :items="groups as never"
    value-key="value"
    label-key="label"
    :filter-fields="['search', 'description']"
    :placeholder="placeholder ?? t('relations.form.pick')"
    :aria-label="ariaLabel"
    :search-input="{ placeholder: t('relations.form.search'), autofocus: desktop }"
    class="w-full"
    :ui="{ base: 'max-lg:min-h-11', value: 'voice-author', itemLabel: 'voice-author', content: 'min-w-64' }"
  >
    <template #empty>
      <span class="text-sm text-muted">{{ t('relations.form.noEntities') }}</span>
    </template>
  </USelectMenu>
</template>
