<script setup lang="ts">
import { composeStoryTime, draftOf, useStoryCalendar } from './story-calendar'
import type { StoryPrecision, StoryTimeDraft } from './story-calendar'

/**
 * A story date edited field by field (spec 7.16): no date, a year, a month, a day, or a day and an hour.
 * The model changes only when the fields make a real date; `valid` says whether they do right now.
 * `suggest` fills the fields when a date is first given (the date of the scene before, for example).
 */
const model = defineModel<string | null>({ default: null })
const valid = defineModel<boolean>('valid', { default: true })
const props = withDefaults(defineProps<{
  legend?: string
  suggest?: string | null
  /** The precision offered when there is no date yet (the fields open at once). */
  start?: StoryPrecision
  /** Show missing fields as errors (after an attempt to save). */
  strict?: boolean
}>(), { legend: undefined, suggest: null, start: undefined, strict: false })

const { t } = useI18n()
const { monthOptions } = useStoryCalendar()
const id = useId()

const draft = reactive<StoryTimeDraft>(draftOf(model.value))
let emitted = model.value

watch(model, (value) => {
  if (value === emitted) return
  emitted = value
  Object.assign(draft, draftOf(value))
})

const result = computed(() => composeStoryTime(draft))

if (!model.value && props.start) {
  setPrecision(props.start)
  if (!result.value.error) emitted = model.value = result.value.value
}
valid.value = !result.value.error

watch(result, ({ value, error }) => {
  valid.value = !error
  if (error || value === model.value) return
  emitted = value
  model.value = value
})

const precisionItems = computed(() =>
  (['none', 'year', 'month', 'day', 'minute'] as const).map(value => ({ value, label: t(`timeline.when.precision.${value}`) })),
)

function setPrecision(value: StoryPrecision | 'none') {
  if (draft.precision === 'none' && value !== 'none' && !String(draft.year).trim() && props.suggest) {
    const suggestion = draftOf(props.suggest)
    draft.year = suggestion.year
    draft.month = suggestion.month
    draft.day = suggestion.day
  }
  draft.precision = value
}

const shows = computed(() => ({
  day: draft.precision === 'day' || draft.precision === 'minute',
  month: draft.precision !== 'none' && draft.precision !== 'year',
  year: draft.precision !== 'none',
  time: draft.precision === 'minute',
}))

/** Impossible values are errors at once; missing ones only say what is left, until `strict`. */
const message = computed(() => {
  const error = result.value.error
  if (!error) return null
  const empty = (value: string | number | null) => !String(value ?? '').trim()
  const missing = (error === 'year' && empty(draft.year)) || (error === 'month' && !draft.month) || (error === 'day' && empty(draft.day)) || (error === 'time' && empty(draft.time))
  return { text: t(`timeline.when.errors.${error}`), missing: missing && !props.strict }
})

/** Digits without the spinner arrows: the fields are typed into, not stepped. 44px tall on touch screens. */
const inputUi = { base: 'text-base sm:text-sm max-lg:min-h-11 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none' }
</script>

<template>
  <!-- relative: the hidden native selects Reka adds inside a form stay inside the field. -->
  <fieldset class="relative min-w-0 space-y-1.5" :aria-describedby="message ? `${id}-message` : undefined">
    <legend class="mb-1.5 text-sm font-medium text-default">{{ legend ?? t('timeline.when.date') }}</legend>
    <div class="flex flex-wrap items-center gap-2">
      <USelect
        :model-value="draft.precision"
        :items="precisionItems"
        value-key="value"
        :aria-label="t('timeline.when.precision.label')"
        class="w-40 max-lg:min-h-11"
        :ui="{ base: 'text-base sm:text-sm' }"
        @update:model-value="setPrecision($event as StoryPrecision | 'none')"
      />
      <UInput
        v-if="shows.day"
        :model-value="String(draft.day)"
        type="number"
        inputmode="numeric"
        :min="1"
        :max="31"
        :placeholder="t('timeline.when.dayPlaceholder')"
        :aria-label="t('timeline.when.day')"
        :aria-invalid="result.error === 'dayRange' || undefined"
        class="w-18"
        :ui="inputUi"
        @update:model-value="draft.day = String($event ?? '')"
      />
      <USelect
        v-if="shows.month"
        :model-value="draft.month ?? undefined"
        :items="monthOptions"
        value-key="value"
        :placeholder="t('timeline.when.month')"
        :aria-label="t('timeline.when.month')"
        class="w-36 max-lg:min-h-11"
        :ui="{ base: 'text-base sm:text-sm' }"
        @update:model-value="draft.month = Number($event) || null"
      />
      <UInput
        v-if="shows.year"
        :model-value="String(draft.year)"
        type="number"
        :min="-9999"
        :max="9999"
        :placeholder="t('timeline.when.yearPlaceholder')"
        :aria-label="t('timeline.when.year')"
        :aria-invalid="result.error === 'yearRange' || undefined"
        class="w-24"
        :ui="inputUi"
        @update:model-value="draft.year = String($event ?? '')"
      />
      <UInput
        v-if="shows.time"
        v-model="draft.time"
        type="time"
        :aria-label="t('timeline.when.time')"
        class="w-36 sm:w-32"
        :ui="inputUi"
      />
    </div>
    <p
      v-if="message"
      :id="`${id}-message`"
      class="flex items-center gap-1.5 text-sm"
      :class="message.missing ? 'text-muted' : 'text-error'"
    >
      <UIcon :name="message.missing ? 'i-lucide-info' : 'i-lucide-circle-alert'" class="size-4 shrink-0" />
      {{ message.text }}
    </p>
  </fieldset>
</template>
