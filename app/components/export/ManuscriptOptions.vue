<script lang="ts">
export type ManuscriptSeparator = 'stars' | 'hash' | 'blank' | 'custom'

/**
 * The separator a remembered choice stands for in a format, the one shown and the one sent. "From the
 * settings" needs a project separator other than *** and # (otherwise it is that one, or ***); in plain text
 * a blank line could not be told from a paragraph break, so it is *** (appendix D.3).
 */
export function effectiveSeparator(chosen: ManuscriptSeparator, setting: string | null | undefined, format: string): ManuscriptSeparator {
  const custom = setting?.trim() ?? ''
  if (chosen === 'custom' && (!custom || custom === '***' || custom === '#')) return custom === '#' ? 'hash' : 'stars'
  if (chosen === 'blank' && format === 'txt') return 'stars'
  return chosen
}

/**
 * The classes of an option row: the whole row is the target (label, box and description), 44px tall on a
 * phone and compact from `sm`, with the hover of a row. For UCheckbox and URadioGroup in their "card" variant,
 * whose item is a label, without the card's frame.
 */
export const OPTION_ROW = 'border-0 rounded-[calc(var(--ui-radius)*2)] -mx-2 px-2 py-3 sm:py-1.5 has-data-[state=checked]:bg-transparent'
</script>

<script setup lang="ts">
/**
 * The options of the manuscript (appendix D.1): title page, the titles of parts, chapters and scenes,
 * the chapter numbering, the separator between scenes, which scenes, and for DOCX and PDF the layout
 * ("Cartella editoriale" or "Libro").
 */
export interface ManuscriptExportOptions {
  titlePage: boolean
  partTitles: boolean
  chapterTitles: boolean
  sceneTitles: boolean
  sceneCodes: boolean
  numbering: 'arabic' | 'roman' | 'words' | 'none'
  separator: ManuscriptSeparator
  scenes: 'text' | 'revised' | 'final'
  layout: 'manuscript' | 'book'
}

const props = defineProps<{ format: 'docx' | 'pdf' | 'epub' | 'txt' }>()
const options = defineModel<ManuscriptExportOptions>({ required: true })

const store = useProjectStore()
const { t } = useI18n()

const usesParts = computed(() => store.project?.settings.parts ?? store.isGame)
const custom = computed(() => store.project?.settings.sceneSeparator?.trim() ?? '')
const paged = computed(() => props.format === 'docx' || props.format === 'pdf')

const numberings = computed(() => (['arabic', 'roman', 'words', 'none'] as const).map(value => ({ value, label: t(`export.options.numberings.${value}`) })))
const hasCustom = computed(() => !!custom.value && custom.value !== '***' && custom.value !== '#')
const separators = computed(() => [
  ...(hasCustom.value ? [{ value: 'custom', label: t('export.options.separators.custom', { text: custom.value }) }] : []),
  { value: 'stars', label: '***' },
  { value: 'hash', label: '#' },
  // Plain text has no blank line to offer: it would read as one more paragraph break.
  ...(props.format === 'txt' ? [] : [{ value: 'blank', label: t('export.options.separators.blank') }]),
])
const rules = computed(() => (['text', 'revised', 'final'] as const).map(value => ({ value, label: t(`export.options.scenes.${value}`) })))
const layouts = computed(() => (['manuscript', 'book'] as const).map(value => ({
  value,
  label: t(`export.options.layouts.${value}.label`),
  description: t(`export.options.layouts.${value}.${props.format === 'pdf' ? 'pdf' : 'docx'}`),
})))

const separator = computed(() => effectiveSeparator(options.value.separator, custom.value, props.format))

function set<K extends keyof ManuscriptExportOptions>(key: K, value: ManuscriptExportOptions[K]) {
  options.value = { ...options.value, [key]: value }
}
const row = `${OPTION_ROW} items-start`
const checkbox = { root: row }
const uid = useId()
</script>

<template>
  <div class="export-manuscript-options space-y-5">
    <div class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      <fieldset>
        <legend class="mb-1 text-sm font-medium text-highlighted">{{ t('export.options.titles') }}</legend>
        <UCheckbox
          :model-value="options.titlePage"
          variant="card"
          :label="t('export.options.titlePage')"
          :aria-describedby="`${uid}-title-page`"
          :ui="checkbox"
          @update:model-value="(v: boolean | 'indeterminate') => set('titlePage', v === true)"
        >
          <template #description><span :id="`${uid}-title-page`">{{ t('export.options.titlePageHint') }}</span></template>
        </UCheckbox>
        <UCheckbox
          v-if="usesParts"
          :model-value="options.partTitles"
          variant="card"
          :label="t(`export.options.partTitles.${store.kind}`)"
          :ui="checkbox"
          @update:model-value="(v: boolean | 'indeterminate') => set('partTitles', v === true)"
        />
        <UCheckbox
          :model-value="options.chapterTitles"
          variant="card"
          :label="t('export.options.chapterTitles')"
          :ui="checkbox"
          @update:model-value="(v: boolean | 'indeterminate') => set('chapterTitles', v === true)"
        />
        <UCheckbox
          :model-value="options.sceneTitles"
          variant="card"
          :label="t('export.options.sceneTitles')"
          :ui="checkbox"
          @update:model-value="(v: boolean | 'indeterminate') => set('sceneTitles', v === true)"
        />
        <UCheckbox
          v-if="options.sceneTitles"
          :model-value="options.sceneCodes"
          variant="card"
          :label="t('export.options.sceneCodes')"
          :ui="{ root: `${row} ms-4` }"
          @update:model-value="(v: boolean | 'indeterminate') => set('sceneCodes', v === true)"
        />
      </fieldset>

      <div class="space-y-5">
        <UFormField v-if="options.chapterTitles" :label="t('export.options.numbering')">
          <USelect
            :model-value="options.numbering"
            :items="numberings"
            class="w-full"
            :ui="{ base: 'min-h-11 sm:min-h-8' }"
            @update:model-value="(v: ManuscriptExportOptions['numbering']) => set('numbering', v)"
          />
        </UFormField>
        <UFormField :label="t('export.options.which')">
          <USelect
            :model-value="options.scenes"
            :items="rules"
            class="w-full"
            :ui="{ base: 'min-h-11 sm:min-h-8' }"
            @update:model-value="(v: ManuscriptExportOptions['scenes']) => set('scenes', v)"
          />
        </UFormField>
        <URadioGroup
          :model-value="separator"
          variant="card"
          :legend="t('export.options.separator')"
          :items="separators"
          orientation="horizontal"
          :ui="{ fieldset: 'gap-x-4 gap-y-0', legend: 'text-sm', item: row }"
          @update:model-value="(v) => set('separator', v as ManuscriptSeparator)"
        >
          <template #label="{ item }">
            <!-- The project's own separator is the author's: in the manuscript face, the rest in the app's. -->
            <i18n-t v-if="item.value === 'custom'" keypath="export.options.separators.custom" scope="global" tag="span">
              <template #text><span class="voice-author">{{ custom }}</span></template>
            </i18n-t>
            <template v-else>{{ item.label }}</template>
          </template>
        </URadioGroup>
      </div>
    </div>

    <URadioGroup
      v-if="paged"
      :model-value="options.layout"
      variant="card"
      :legend="t('export.options.layout')"
      :items="layouts"
      :ui="{ fieldset: 'gap-y-0', legend: 'text-sm', item: row, description: 'text-sm text-pretty' }"
      @update:model-value="(v) => set('layout', v as ManuscriptExportOptions['layout'])"
    />
  </div>
</template>
