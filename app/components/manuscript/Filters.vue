<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import { SCENE_KINDS, SCENE_STATUSES } from '#shared/utils/constants'
import { NO_FILTERS, STATUS_TEXT, type OutlineFilters } from './Structure.vue'

/**
 * Filters of the outline: status, kind (games), character (tagged or point of view), location,
 * strand. Within a filter any value matches; the filters add up. Each control names its filter and
 * how many values are on. Below 1024px each filter opens in a drawer (DESIGN.md "menus become drawers").
 */
const model = defineModel<OutlineFilters>({ required: true })
defineProps<{ shown: number, total: number }>()

const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const store = useProjectStore()
const phone = useMediaQuery('(max-width: 1023.98px)')
const touch = useMediaQuery('(pointer: coarse)')
const drawer = ref<keyof OutlineFilters | null>(null)

const items = computed(() => ({
  status: SCENE_STATUSES.map(key => ({ value: key, label: label('sceneStatus', key), icon: statusIcon('scene', key), ui: { itemLeadingIcon: STATUS_TEXT[key] } })),
  kind: SCENE_KINDS.map(key => ({ value: key, label: label('sceneKind', key), icon: SCENE_KIND_ICONS[key] })),
  character: store.rows.characters.map(c => ({
    value: c.id,
    label: c.name,
    avatar: store.primaryImage('character', c.id) ? { src: mediaUrl(store.primaryImage('character', c.id), 'thumb'), alt: c.name } : { text: c.name.slice(0, 1).toLocaleUpperCase(), alt: c.name },
  })),
  location: store.rows.locations.map(l => ({ value: l.id, label: l.name, icon: REF_ICONS.location })),
  strand: store.rows.strands.map(s => ({ value: s.id, label: s.name, icon: REF_ICONS.strand })),
}))

const controls = computed(() => [
  { key: 'status' as const, label: t('manuscript.filters.status') },
  ...(store.modules.scene_kinds ? [{ key: 'kind' as const, label: t('manuscript.filters.kind') }] : []),
  { key: 'character' as const, label: term('character') },
  ...(store.rows.locations.length ? [{ key: 'location' as const, label: term('location') }] : []),
  ...(store.rows.strands.length ? [{ key: 'strand' as const, label: term('strand') }] : []),
])

const active = computed(() => Object.values(model.value).some(values => values.length))
const searchable = (key: keyof OutlineFilters) => key !== 'status' && key !== 'kind'

function set(key: keyof OutlineFilters, values: string[]) {
  model.value = { ...model.value, [key]: values }
}

type FilterItem = CommandPaletteItem & { value: string }

/** The values of a filter as the drawer's list (names in the author's voice). */
function groupsOf(key: keyof OutlineFilters): CommandPaletteGroup<FilterItem>[] {
  return [{ id: key, items: items.value[key] as FilterItem[] }]
}

const open = computed({
  get: () => drawer.value !== null,
  set: (value: boolean) => { if (!value) drawer.value = null },
})
const current = computed(() => controls.value.find(c => c.key === drawer.value))
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" role="group" :aria-label="t('manuscript.filters.label')">
    <template v-if="phone">
      <UButton
        v-for="control in controls"
        :key="control.key"
        color="neutral"
        :variant="model[control.key].length ? 'soft' : 'outline'"
        trailing-icon="i-lucide-chevron-down"
        class="min-h-11"
        :aria-haspopup="'dialog'"
        @click="drawer = control.key"
      >
        <span class="text-sm">{{ control.label }}</span>
        <span v-if="model[control.key].length" class="tabular text-sm text-muted">· {{ model[control.key].length }}</span>
      </UButton>
      <UDrawer v-model:open="open" :title="current?.label ?? t('manuscript.filters.label')" :ui="{ body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }">
        <template #body>
          <div v-if="current" class="flex flex-col gap-3">
            <UCommandPalette
              :model-value="model[current.key]"
              :groups="groupsOf(current.key)"
              multiple
              value-key="value"
              :input="searchable(current.key) ? { placeholder: t('common.actions.search') } : false"
              :autofocus="!touch"
              :close="false"
              class="max-h-[55dvh]"
              :ui="{ input: '[&_input]:text-base', item: 'min-h-11', itemLabelBase: current.key === 'status' || current.key === 'kind' ? '' : 'voice-author' }"
              @update:model-value="set(current.key, $event as unknown as string[])"
            />
            <div class="flex items-center gap-3">
              <span class="flex-1 text-sm text-muted" aria-live="polite">{{ t('manuscript.filters.showing', { n: shown, total }, shown) }}</span>
              <UButton color="neutral" variant="outline" class="min-h-11" :label="t('manuscript.filters.done')" @click="open = false" />
            </div>
          </div>
        </template>
      </UDrawer>
    </template>
    <template v-else>
      <USelectMenu
        v-for="control in controls"
        :key="control.key"
        :model-value="model[control.key]"
        :items="items[control.key]"
        value-key="value"
        multiple
        color="neutral"
        :variant="model[control.key].length ? 'soft' : 'outline'"
        size="sm"
        :search-input="searchable(control.key) ? { placeholder: t('common.actions.search') } : false"
        :aria-label="control.label"
        :ui="{ content: 'min-w-56' }"
        @update:model-value="set(control.key, $event as string[])"
      >
        <span class="text-sm">{{ control.label }}</span>
        <span v-if="model[control.key].length" class="tabular text-sm text-muted">· {{ model[control.key].length }}</span>
      </USelectMenu>
    </template>
    <UButton v-if="active" color="neutral" variant="link" size="sm" icon="i-lucide-x" class="max-lg:min-h-11" :label="t('manuscript.filters.clear')" @click="model = { ...NO_FILTERS }" />
    <span v-if="active" class="text-sm text-muted" aria-live="polite">{{ t('manuscript.filters.showing', { n: shown, total }, shown) }}</span>
  </div>
</template>
