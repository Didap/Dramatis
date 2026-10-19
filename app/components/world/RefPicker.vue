<script setup lang="ts">
import { createReusableTemplate } from '@vueuse/core'
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { WorldRefType } from '#shared/types/domain'
import { CHARACTER_IMPORTANCES } from '#shared/utils/constants'

/**
 * Links another entity of the world (a member, a group, an owner): a button that opens a search over
 * the kinds allowed, in a popover on desktop and a drawer on a phone. The search stays open after a
 * pick, so several can be added in a row; what is already linked is left out.
 */
const props = withDefaults(defineProps<{
  types: WorldRefType[]
  /** Already linked, as "type:id". */
  exclude?: string[]
  label: string
}>(), { exclude: () => [] })

const emit = defineEmits<{ pick: [ref: { type: WorldRefType, id: string }] }>()

type PickItem = CommandPaletteItem & { ref: { type: WorldRefType, id: string } }

const { t } = useI18n()
const { term } = useTerms()
const { label: enumLabel } = useEnums()
const store = useProjectStore()
const desktop = useIsDesktop()
const open = ref(false)
const [DefinePalette, ReusePalette] = createReusableTemplate()

const PLURAL = { character: 'characters', group: 'groups', location: 'locations', object: 'objects' } as const

function place(location: { city: string, region: string, nation: string }) {
  return [location.city, location.region, location.nation].filter(Boolean).join(', ')
}

function entries(type: WorldRefType): { id: string, name: string, description?: string, imageId: string | null }[] {
  const image = (id: string) => store.primaryImage(type, id)
  switch (type) {
    case 'character':
      return [...store.rows.characters]
        .sort((a, b) => CHARACTER_IMPORTANCES.indexOf(a.importance) - CHARACTER_IMPORTANCES.indexOf(b.importance) || a.position - b.position)
        .map(c => ({ id: c.id, name: c.name, description: c.tagline || undefined, imageId: image(c.id) }))
    case 'group':
      return store.rows.groups.map(g => ({ id: g.id, name: g.name, description: enumLabel('groupKind', g.kind), imageId: image(g.id) }))
    case 'location':
      return store.rows.locations.map(l => ({ id: l.id, name: l.name, description: place(l) || undefined, imageId: image(l.id) }))
    case 'object':
      return store.rows.objects.map(o => ({ id: o.id, name: o.name, description: o.kind || undefined, imageId: image(o.id) }))
  }
  return []
}

const groups = computed<CommandPaletteGroup[]>(() => {
  const skip = new Set(props.exclude)
  return props.types
    .map(type => ({
      id: type,
      label: term(PLURAL[type]),
      items: entries(type)
        .filter(entry => !skip.has(`${type}:${entry.id}`))
        .map<PickItem>(entry => ({
          id: `${type}:${entry.id}`,
          label: entry.name,
          description: entry.description,
          ...(entry.imageId ? { avatar: { src: mediaUrl(entry.imageId, 'thumb'), alt: '' } } : { icon: REF_ICONS[type] }),
          ref: { type, id: entry.id },
        })),
    }))
    .filter(group => group.items.length)
})

function onPick(value: unknown) {
  const item = value as PickItem | undefined
  if (item?.ref) emit('pick', item.ref)
}
</script>

<template>
  <DefinePalette>
    <UCommandPalette
      :groups="groups"
      :placeholder="t('world.picker.search')"
      :fuse="{ resultLimit: 500 }"
      class="max-h-[min(24rem,60dvh)]"
      :ui="{ input: '[&>input]:max-sm:text-base' }"
      @update:model-value="onPick"
    >
      <template #empty>
        <p class="px-4 py-6 text-center text-sm text-muted">
          {{ groups.length ? t('world.picker.noMatch') : t('world.picker.nobody') }}
        </p>
      </template>
    </UCommandPalette>
  </DefinePalette>

  <UPopover v-if="desktop" v-model:open="open" :content="{ align: 'end' }">
    <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-plus" :label="label" data-world-add />
    <template #content>
      <div class="w-[min(22rem,calc(100vw-2rem))]">
        <ReusePalette />
      </div>
    </template>
  </UPopover>
  <UDrawer v-else v-model:open="open" :title="label">
    <UButton color="neutral" variant="outline" icon="i-lucide-plus" :label="label" class="min-h-11" data-world-add />
    <template #body>
      <ReusePalette />
    </template>
  </UDrawer>
</template>
