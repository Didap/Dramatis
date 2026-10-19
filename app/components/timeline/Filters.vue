<script setup lang="ts">
import { TIMELINE_KINDS, activeFilters, emptyFilters } from './timeline-model'
import type { TimelineFilters, TimelineKind } from './timeline-model'

/** Who, where, what, which strand, which kind: the filters of the timeline (a row, or stacked in a drawer, 44px tall). */
const filters = defineModel<TimelineFilters>({ required: true })
withDefaults(defineProps<{ stacked?: boolean }>(), { stacked: false })

const { t } = useI18n()
const { term } = useTerms()

type ListKey = 'characters' | 'locations' | 'objects' | 'strands'

const pickers = computed(() => [
  { key: 'characters' as const, type: 'character' as const, label: term('characters'), icon: REF_ICONS.character },
  { key: 'locations' as const, type: 'location' as const, label: term('locations'), icon: REF_ICONS.location },
  { key: 'objects' as const, type: 'object' as const, label: term('objects'), icon: REF_ICONS.object },
  { key: 'strands' as const, type: 'strand' as const, label: term('strands'), icon: REF_ICONS.strand },
])

const kindItems = computed(() => TIMELINE_KINDS.map(value => ({ value, label: t(`timeline.kinds.${value}`) })))

function set(key: ListKey, value: string[] | string | null) {
  filters.value = { ...filters.value, [key]: Array.isArray(value) ? value : value ? [value] : [] }
}

function setKinds(value: TimelineKind[]) {
  filters.value = { ...filters.value, kinds: value }
}

const active = computed(() => activeFilters(filters.value))
</script>

<template>
  <div :class="stacked ? 'grid gap-4' : 'flex flex-wrap items-center gap-2'" role="group" :aria-label="t('timeline.filters.label')">
    <component
      :is="stacked ? 'label' : 'div'"
      v-for="picker in pickers"
      :key="picker.key"
      :class="stacked ? 'grid gap-1.5 text-sm font-medium text-default' : 'min-w-32 max-w-64'"
    >
      <span v-if="stacked">{{ picker.label }}</span>
      <DEntityPicker
        :model-value="filters[picker.key]"
        :type="picker.type"
        multiple
        :icon="picker.icon"
        :placeholder="stacked ? t('timeline.filters.any') : picker.label"
        :aria-label="t('timeline.filters.by', { what: picker.label.toLocaleLowerCase() })"
        :size="stacked ? 'lg' : 'sm'"
        :class="stacked ? 'min-h-11' : ''"
        @update:model-value="set(picker.key, $event)"
      />
    </component>
    <component :is="stacked ? 'label' : 'div'" :class="stacked ? 'grid gap-1.5 text-sm font-medium text-default' : 'min-w-32 max-w-64'">
      <span v-if="stacked">{{ t('timeline.filters.kind') }}</span>
      <USelectMenu
        :model-value="filters.kinds"
        :items="kindItems"
        value-key="value"
        multiple
        :search-input="false"
        icon="i-lucide-shapes"
        :placeholder="stacked ? t('timeline.filters.any') : t('timeline.filters.kind')"
        :aria-label="t('timeline.filters.by', { what: t('timeline.filters.kind').toLocaleLowerCase() })"
        :size="stacked ? 'lg' : 'sm'"
        class="w-full"
        :class="stacked ? 'min-h-11' : ''"
        @update:model-value="setKinds($event as TimelineKind[])"
      />
    </component>
    <UButton
      v-if="active"
      color="neutral"
      variant="link"
      size="sm"
      icon="i-lucide-x"
      :label="t('timeline.filters.clear')"
      :class="stacked ? 'min-h-11 justify-self-start' : ''"
      @click="filters = emptyFilters()"
    />
  </div>
</template>
