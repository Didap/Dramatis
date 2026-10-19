<script setup lang="ts">
import type { EditorPreferences } from '#shared/types/domain'

/**
 * "Aa": the typography of the manuscript (spec 7.1), saved to the account so it follows the author on
 * every device: the face, the size, the line height, the line width; paragraph focus and typewriter
 * scrolling for focus mode.
 */
const props = defineProps<{
  /** The effective size and line height when the author has not chosen one (they depend on the screen). */
  defaultSize: number
  defaultLineHeight: number
}>()

const { t } = useI18n()
const { number, localeTag } = useFormat()
const { prefs, set } = useEditorTypography()

const font = computed(() => prefs.value.font ?? 'serif')
const size = computed(() => prefs.value.size ?? props.defaultSize)
const lineHeight = computed(() => prefs.value.lineHeight ?? props.defaultLineHeight)
const width = computed(() => prefs.value.width ?? 'medium')

const fonts = computed(() => [
  { value: 'serif', label: t('editor.typography.serif'), class: 'font-serif' },
  { value: 'sans', label: t('editor.typography.sans'), class: 'font-readable' },
] as const)
const widths = computed(() => (['narrow', 'medium', 'wide'] as const).map(value => ({ value, label: t(`editor.typography.width.${value}`) })))

function update(patch: Partial<EditorPreferences>) {
  set(patch)
}

// In the language of the interface, not of the browser.
const lineHeightText = computed(() => new Intl.NumberFormat(localeTag.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(lineHeight.value))

/** Radio groups (WAI-ARIA): one Tab stop, the arrow keys choose the next option and move there. */
function onRadioKey<V extends string>(event: KeyboardEvent, values: readonly V[], current: V, choose: (value: V) => void) {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
  if (!step) return
  event.preventDefault()
  const group = (event.currentTarget as HTMLElement).closest('[role="radiogroup"]')
  const next = values[(values.indexOf(current) + step + values.length) % values.length]!
  choose(next)
  nextTick(() => group?.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus())
}
const fontKey = (event: KeyboardEvent) => onRadioKey(event, fonts.value.map(f => f.value), font.value, value => update({ font: value }))
const widthKey = (event: KeyboardEvent) => onRadioKey(event, widths.value.map(w => w.value), width.value, value => update({ width: value }))
</script>

<template>
  <div class="w-72 space-y-5 p-4">
    <fieldset>
      <legend class="mb-1.5 text-sm font-medium text-default">{{ t('editor.typography.font') }}</legend>
      <div class="grid grid-cols-2 gap-1.5" role="radiogroup" :aria-label="t('editor.typography.font')">
        <button
          v-for="option in fonts"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="font === option.value"
          :tabindex="font === option.value ? 0 : -1"
          :data-value="option.value"
          class="rounded-[calc(var(--ui-radius)*1.5)] px-2 py-2 text-center ring-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
          :class="font === option.value ? 'bg-elevated text-highlighted ring-(--ui-primary)' : 'text-default ring-(--ui-border-accented) hover:bg-elevated/60'"
          @click="update({ font: option.value })"
          @keydown="fontKey"
        >
          <span class="block text-lg leading-tight" :class="option.class">Aa</span>
          <span class="mt-0.5 block text-xs">{{ option.label }}</span>
        </button>
      </div>
    </fieldset>

    <div>
      <div class="mb-1.5 flex items-baseline justify-between text-sm">
        <span class="font-medium text-default">{{ t('editor.typography.size') }}</span>
        <span class="tabular text-muted">{{ t('editor.typography.px', { n: number(size) }) }}</span>
      </div>
      <USlider
        :model-value="size"
        :min="14"
        :max="24"
        :step="1"
        size="sm"
        :aria-label="t('editor.typography.size')"
        @update:model-value="(v) => update({ size: Number(v) })"
      />
    </div>

    <div>
      <div class="mb-1.5 flex items-baseline justify-between text-sm">
        <span class="font-medium text-default">{{ t('editor.typography.lineHeight') }}</span>
        <span class="tabular text-muted">{{ lineHeightText }}</span>
      </div>
      <USlider
        :model-value="lineHeight"
        :min="1.4"
        :max="2"
        :step="0.05"
        size="sm"
        :aria-label="t('editor.typography.lineHeight')"
        @update:model-value="(v) => update({ lineHeight: Math.round(Number(v) * 100) / 100 })"
      />
    </div>

    <fieldset>
      <legend class="mb-1.5 text-sm font-medium text-default">{{ t('editor.typography.widthLabel') }}</legend>
      <div class="grid grid-cols-3 gap-1.5" role="radiogroup" :aria-label="t('editor.typography.widthLabel')">
        <button
          v-for="option in widths"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="width === option.value"
          :tabindex="width === option.value ? 0 : -1"
          :data-value="option.value"
          class="rounded-[calc(var(--ui-radius)*1.5)] px-2 py-1.5 text-xs ring-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
          :class="width === option.value ? 'bg-elevated text-highlighted ring-(--ui-primary)' : 'text-default ring-(--ui-border-accented) hover:bg-elevated/60'"
          @click="update({ width: option.value })"
          @keydown="widthKey"
        >
          {{ option.label }}
        </button>
      </div>
    </fieldset>

    <div class="space-y-3 border-t border-default pt-4">
      <USwitch
        :model-value="!!prefs.focusParagraph"
        :label="t('editor.typography.focusParagraph')"
        :description="t('editor.typography.focusParagraphHint')"
        size="sm"
        @update:model-value="(v) => update({ focusParagraph: v })"
      />
      <USwitch
        :model-value="!!prefs.typewriter"
        :label="t('editor.typography.typewriter')"
        :description="t('editor.typography.typewriterHint')"
        size="sm"
        @update:model-value="(v) => update({ typewriter: v })"
      />
    </div>

    <p class="text-xs text-muted">{{ t('editor.typography.savedToAccount') }}</p>
  </div>
</template>
