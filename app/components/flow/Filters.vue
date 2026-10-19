<script setup lang="ts">
/**
 * Flow filters (spec 6, P1): one act and one strand (storyline or quest). The graph fades what falls
 * outside them, the list leaves it out.
 */
const act = defineModel<string | null>('act', { default: null })
const strand = defineModel<string | null>('strand', { default: null })

const store = useProjectStore()
const { t, locale } = useI18n()
const { term } = useTerms()
const { label } = useEnums()

const ALL = '__all__'

const actItems = computed(() => [
  { value: ALL, label: t(`flow.filters.allActs.${store.kind}`) },
  ...store.orderedParts.map((part, i) => ({ value: part.id, label: `${term('part')} ${i + 1} · ${part.title || t('common.untitled.part')}` })),
])

const strandItems = computed<{ value: string, label: string, description?: string, color?: string }[]>(() => [
  { value: ALL, label: t(`flow.filters.allStrands.${store.kind}`) },
  ...store.rows.strands.map(s => ({ value: s.id, label: s.name, description: label('strandKind', s.kind), color: s.color })),
])

const actValue = computed({
  get: () => act.value ?? ALL,
  set: (value: string) => { act.value = value === ALL ? null : value },
})
const strandValue = computed({
  get: () => strand.value ?? ALL,
  set: (value: string) => { strand.value = value === ALL ? null : value },
})
const showActs = computed(() => store.orderedParts.length > 1)
</script>

<template>
  <div v-if="showActs || store.rows.strands.length" class="flex flex-wrap items-center gap-2 max-lg:w-full">
    <USelect
      v-if="showActs"
      v-model="actValue"
      :items="actItems"
      size="sm"
      :aria-label="t('flow.filters.act', { part: term('part').toLocaleLowerCase(locale) })"
      class="w-44 max-lg:h-11 max-lg:w-auto max-lg:min-w-0 max-lg:flex-1"
      :ui="{ content: 'min-w-64' }"
    />
    <USelectMenu
      v-if="store.rows.strands.length"
      v-model="strandValue"
      :items="strandItems"
      value-key="value"
      size="sm"
      :search-input="false"
      :aria-label="t('flow.filters.strand', { strand: term('strand').toLocaleLowerCase(locale) })"
      class="w-60 max-lg:h-11 max-lg:w-auto max-lg:min-w-0 max-lg:flex-1"
      :ui="{ content: 'min-w-64' }"
    >
      <template #leading>
        <DColorDot :color="strand ? store.get('strands', strand)?.color : null" size="sm" />
      </template>
      <template #item-leading="{ item }">
        <DColorDot v-if="item.color" :color="item.color" size="sm" />
      </template>
      <template #item-label="{ item }">
        <span :class="item.value === ALL ? '' : 'voice-author'">{{ item.label }}</span>
      </template>
    </USelectMenu>
    <UButton
      v-if="act || strand"
      color="neutral"
      variant="link"
      size="sm"
      :label="t('flow.filters.clear')"
      class="max-lg:min-h-11"
      @click="act = null; strand = null"
    />
  </div>
</template>
