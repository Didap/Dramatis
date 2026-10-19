<script setup lang="ts">
import type { EditorPreferences } from '#shared/types/domain'

/**
 * "Aa" of the reading view: the size of the text and the width of the page, apart from the editor's,
 * so a chapter can read back like a printed page (smaller type across a wider block) while the editor
 * keeps its writing size. Justified lines and hyphenation, as in a book, can be switched off. Saved to
 * the account with the rest of the typography.
 */
const props = defineProps<{
  /** The effective size when the author has not chosen one (it depends on the screen). */
  defaultSize: number
}>()

const { t } = useI18n()
const { number } = useFormat()
const { prefs, set } = useEditorTypography()

const size = computed(() => prefs.value.readingSize ?? props.defaultSize)
const width = computed(() => prefs.value.readingWidth ?? 'book')
const justify = computed(() => prefs.value.readingJustify !== false)

const widths = computed(() => (['book', 'wide', 'full'] as const).map(value => ({ value, label: t(`manuscript.reading.width.${value}`) })))

function update(patch: Partial<EditorPreferences>) {
  set(patch)
}
</script>

<template>
  <div class="w-72 space-y-5 p-4">
    <div>
      <div class="mb-1.5 flex items-baseline justify-between text-sm">
        <span class="font-medium text-default">{{ t('editor.typography.size') }}</span>
        <span class="tabular text-muted">{{ t('editor.typography.px', { n: number(size) }) }}</span>
      </div>
      <USlider
        :model-value="size"
        :min="13"
        :max="22"
        :step="1"
        size="sm"
        :aria-label="t('editor.typography.size')"
        @update:model-value="(v) => update({ readingSize: Number(v) })"
      />
    </div>
    <URadioGroup
      :model-value="width"
      :legend="t('manuscript.reading.widthLabel')"
      :items="widths"
      value-key="value"
      variant="table"
      orientation="horizontal"
      class="max-sm:hidden"
      :ui="{ legend: 'mb-1.5 text-sm font-medium text-default', fieldset: 'gap-0', item: 'flex-1 basis-0 p-2 first-of-type:rounded-s-[calc(var(--ui-radius)*1.5)] last-of-type:rounded-e-[calc(var(--ui-radius)*1.5)]', label: 'text-xs' }"
      @update:model-value="(v) => update({ readingWidth: v as EditorPreferences['readingWidth'] })"
    />
    <USwitch
      :model-value="justify"
      :label="t('manuscript.reading.justify')"
      :description="t('manuscript.reading.justifyHint')"
      @update:model-value="(v) => update({ readingJustify: v })"
    />
  </div>
</template>
