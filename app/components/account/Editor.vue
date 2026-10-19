<script setup lang="ts">
import type { EditorPreferences } from '#shared/types/domain'

/**
 * The defaults of the writing surface (spec 7.1): typeface, size, line height and line width,
 * with a passage set exactly as the editor will set it. The "Aa" menu of the editor changes the same
 * preferences.
 */
const props = defineProps<{ modelValue: EditorPreferences }>()
const emit = defineEmits<{ 'update:modelValue': [value: EditorPreferences] }>()

const { t } = useI18n()
const { number } = useFormat()

const font = computed(() => props.modelValue.font ?? 'serif')
const size = computed(() => props.modelValue.size ?? 18)
const lineHeight = computed(() => props.modelValue.lineHeight ?? 1.6)
const width = computed(() => props.modelValue.width ?? 'medium')

const set = (patch: EditorPreferences) => emit('update:modelValue', { ...props.modelValue, ...patch })

const fonts = computed(() => [
  { value: 'serif', label: t('account.editor.serif'), description: t('account.editor.serifHelp') },
  { value: 'sans', label: t('account.editor.sans'), description: t('account.editor.sansHelp') },
])
const widths = computed(() => (['narrow', 'medium', 'wide'] as const).map(value => ({
  value,
  label: t(`account.editor.widths.${value}`),
  description: t('account.editor.widthHelp', { n: { narrow: 60, medium: 70, wide: 80 }[value] }),
})))

const MEASURE = { narrow: 60, medium: 70, wide: 80 } as const
const preview = computed<Record<string, string>>(() => ({
  fontFamily: font.value === 'sans' ? 'var(--font-readable)' : 'var(--font-serif)',
  fontWeight: 'var(--manuscript-weight)',
  fontOpticalSizing: 'auto',
  fontSize: `${size.value}px`,
  lineHeight: String(lineHeight.value),
  // The measure in real characters (DESIGN.md "The manuscript").
  maxWidth: `calc(${MEASURE[width.value]} * ${font.value === 'sans' ? 0.433 : 0.462}em)`,
}))
</script>

<template>
  <div class="account-editor space-y-6">
    <URadioGroup
      :model-value="font"
      :items="fonts"
      :legend="t('account.editor.font')"
      :ui="{ legend: 'text-sm font-medium text-default mb-2', item: 'py-1' }"
      @update:model-value="(value) => set({ font: value as EditorPreferences['font'] })"
    />

    <div class="grid gap-6 sm:grid-cols-2">
      <UFormField :label="t('account.editor.size')" :help="t('account.editor.sizeValue', { n: number(size) })">
        <USlider
          :model-value="size"
          :min="14"
          :max="24"
          :step="1"
          :aria-label="t('account.editor.size')"
          :aria-valuetext="t('account.editor.sizeValue', { n: number(size) })"
          @update:model-value="(value) => set({ size: Number(value) })"
        />
      </UFormField>
      <UFormField :label="t('account.editor.lineHeight')" :help="t('account.editor.lineHeightValue', { n: number(lineHeight) })">
        <USlider
          :model-value="lineHeight"
          :min="1.4"
          :max="2"
          :step="0.05"
          :aria-label="t('account.editor.lineHeight')"
          :aria-valuetext="number(lineHeight)"
          @update:model-value="(value) => set({ lineHeight: Math.round(Number(value) * 100) / 100 })"
        />
      </UFormField>
    </div>

    <URadioGroup
      :model-value="width"
      :items="widths"
      :legend="t('account.editor.width')"
      orientation="horizontal"
      :ui="{ legend: 'text-sm font-medium text-default mb-2', fieldset: 'flex-wrap gap-x-6 gap-y-2' }"
      @update:model-value="(value) => set({ width: value as EditorPreferences['width'] })"
    />

    <figure class="rounded-[calc(var(--ui-radius)*2)] border border-default px-5 py-6 sm:px-8">
      <figcaption class="mb-3 text-xs font-medium text-muted">{{ t('account.editor.preview') }}</figcaption>
      <p class="text-pretty text-default" :style="preview" :lang="t('account.editor.sampleLang')">{{ t('account.editor.sample') }}</p>
    </figure>
  </div>
</template>
