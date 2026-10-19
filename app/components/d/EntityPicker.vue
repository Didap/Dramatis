<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'

type PickerType = 'character' | 'group' | 'location' | 'object' | 'strand' | 'chapter' | 'scene'

/**
 * Picks one or more items of the open project (characters, places, strands, scenes...).
 * With `creatable`, typing a new name creates the item on the spot.
 */
const props = withDefaults(defineProps<{
  type: PickerType
  modelValue: string[] | string | null
  multiple?: boolean
  placeholder?: string
  creatable?: boolean
  /** Ids that cannot be picked (the item itself, for example). */
  exclude?: string[]
  size?: 'xs' | 'sm' | 'md' | 'lg'
  variant?: 'outline' | 'soft' | 'subtle' | 'ghost' | 'none'
  ariaLabel?: string
}>(), { multiple: false, placeholder: undefined, creatable: false, exclude: () => [], size: 'md', variant: 'outline', ariaLabel: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: string[] | string | null] }>()

const store = useProjectStore()
const { t } = useI18n()
// On touch screens a focused search would pop the keyboard over the list.
const isTouch = import.meta.client && window.matchMedia?.('(pointer: coarse)').matches

type Item = Exclude<SelectMenuItem, string | number | boolean | null | undefined> & { id: string, label: string }

const items = computed<Item[]>(() => {
  const skip = new Set(props.exclude)
  const make = (list: Item[]) => list.filter(i => !skip.has(i.id))
  switch (props.type) {
    case 'character':
      return make(store.rows.characters.map(c => ({
        id: c.id,
        label: c.name,
        description: c.tagline || undefined,
        avatar: store.primaryImage('character', c.id) ? { src: mediaUrl(store.primaryImage('character', c.id), 'thumb'), alt: c.name } : { alt: c.name, text: c.name.slice(0, 1).toLocaleUpperCase() },
      })))
    case 'group':
      return make(store.rows.groups.map(g => ({ id: g.id, label: g.name, icon: REF_ICONS.group })))
    case 'location':
      return make(store.rows.locations.map(l => ({ id: l.id, label: l.name, description: [l.city, l.region, l.nation].filter(Boolean).join(', ') || undefined, icon: REF_ICONS.location })))
    case 'object':
      return make(store.rows.objects.map(o => ({ id: o.id, label: o.name, description: o.kind || undefined, icon: REF_ICONS.object })))
    case 'strand':
      return make(store.rows.strands.map(s => ({ id: s.id, label: s.name, icon: REF_ICONS.strand })))
    case 'chapter':
      return make(store.orderedChapters.map((c, i) => ({ id: c.id, label: c.title || t('common.untitled.chapter'), description: `${i + 1}`, icon: REF_ICONS.chapter })))
    case 'scene':
      return make(store.orderedScenes.map(s => ({ id: s.id, label: s.title || t('common.untitled.scene'), description: store.get('chapters', s.chapterId)?.title, icon: REF_ICONS.scene })))
  }
  return []
})

const value = computed({
  get: () => props.modelValue ?? (props.multiple ? [] : undefined),
  set: (v: string[] | string | undefined) => emit('update:modelValue', v ?? (props.multiple ? [] : null)),
})

const COLLECTION: Partial<Record<PickerType, 'characters' | 'groups' | 'locations' | 'objects' | 'strands'>> = {
  character: 'characters',
  group: 'groups',
  location: 'locations',
  object: 'objects',
  strand: 'strands',
}

async function onCreate(name: string) {
  const collection = COLLECTION[props.type]
  if (!collection || !name.trim()) return
  const row = await store.create(collection, { name: name.trim() } as never)
  if (props.multiple) emit('update:modelValue', [...((props.modelValue as string[] | null) ?? []), row.id])
  else emit('update:modelValue', row.id)
}
</script>

<template>
  <USelectMenu
    :model-value="value as never"
    @update:model-value="(v: unknown) => { value = v as never }"
    :items="items"
    value-key="id"
    label-key="label"
    :multiple="multiple"
    :placeholder="placeholder"
    :create-item="creatable && !!COLLECTION[type]"
    :filter-fields="['label', 'description']"
    :size="size"
    :variant="variant"
    :aria-label="ariaLabel ?? placeholder"
    :search-input="{ placeholder: t('common.actions.search'), autofocus: !isTouch }"
    class="w-full"
    @create="onCreate"
  />
</template>
