<script setup lang="ts">
import type { PageWidth } from '#shared/types/domain'
import { PAGE_WIDTHS } from '#shared/utils/constants'

/**
 * The width of a page of text (Libro, Ampia, Tutta), the same choice in writing, reading and notes.
 * Hidden on a phone, where every page is the whole screen.
 */
const model = defineModel<PageWidth | undefined>()

const { t } = useI18n()

/** Values saved before the three widths (narrow, medium) read as book. */
const value = computed(() => (PAGE_WIDTHS.includes(model.value as PageWidth) ? model.value : 'book'))
const items = computed(() => PAGE_WIDTHS.map(width => ({ value: width, label: t(`common.pageWidth.${width}`) })))
</script>

<template>
  <URadioGroup
    :model-value="value"
    :legend="t('common.pageWidth.label')"
    :items="items"
    value-key="value"
    variant="table"
    orientation="horizontal"
    class="max-sm:hidden"
    :ui="{ legend: 'mb-1.5 text-sm font-medium text-default', fieldset: 'gap-0', item: 'flex-1 basis-0 p-2 first-of-type:rounded-s-[calc(var(--ui-radius)*1.5)] last-of-type:rounded-e-[calc(var(--ui-radius)*1.5)]', label: 'text-xs' }"
    @update:model-value="(v) => (model = v as PageWidth)"
  />
</template>
