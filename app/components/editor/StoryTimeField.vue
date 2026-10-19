<script setup lang="ts">
import { parseStoryTime } from '#shared/utils/time'

type Precision = 'none' | 'year' | 'month' | 'day' | 'minute'

/**
 * When the scene happens in the story (spec 7.16): no date, a year, a month, a day, or a day and a time,
 * so "1953" and "14 novembre 1953, 22:10" both sort right. Years from -9999 to 9999. The value changes
 * only when the fields make a real date, and says how it changed: typed (the parent sends it after a
 * pause, so "1953" never goes out as "1", "19", "195") or picked from a menu (sent at once).
 */
const props = defineProps<{ modelValue?: string | null, suggest?: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null, typed: boolean] }>()

const { t } = useI18n()
const { storyTime, localeTag } = useFormat()
const id = useId()

function draftOf(value: string | null) {
  const parts = parseStoryTime(value)
  const precision: Precision = !parts ? 'none' : parts.hour !== undefined ? 'minute' : parts.day ? 'day' : parts.month ? 'month' : 'year'
  return {
    precision,
    year: parts ? String(parts.year) : '',
    month: parts?.month ?? 1,
    day: parts?.day ? String(parts.day) : '',
    time: parts?.hour !== undefined ? `${String(parts.hour).padStart(2, '0')}:${String(parts.minute ?? 0).padStart(2, '0')}` : '',
  }
}

const draft = reactive(draftOf(props.modelValue ?? null))
let emitted = props.modelValue ?? null
watch(() => props.modelValue ?? null, (value) => {
  if (value === emitted) return
  emitted = value
  Object.assign(draft, draftOf(value))
})

const leap = (y: number) => (((y % 4) + 4) % 4 === 0 && ((y % 100) + 100) % 100 !== 0) || ((y % 400) + 400) % 400 === 0
const daysIn = (y: number, m: number) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 31

const result = computed<{ value: string | null, error: boolean }>(() => {
  if (draft.precision === 'none') return { value: null, error: false }
  const year = Number(draft.year.trim())
  if (!/^-?\d{1,4}$/.test(draft.year.trim()) || year < -9999 || year > 9999) return { value: null, error: true }
  if (draft.precision === 'year') return { value: String(year), error: false }
  const month = String(draft.month).padStart(2, '0')
  if (draft.precision === 'month') return { value: `${year}-${month}`, error: false }
  const day = Number(draft.day.trim())
  if (!/^\d{1,2}$/.test(draft.day.trim()) || day < 1 || day > daysIn(year, draft.month)) return { value: null, error: true }
  const date = `${year}-${month}-${String(day).padStart(2, '0')}`
  if (draft.precision === 'day') return { value: date, error: false }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return { value: null, error: true }
  return { value: `${date}T${draft.time}`, error: false }
})

/** Sends the date the fields make, when they make one and it is new. */
function commit(typed: boolean) {
  const { value, error } = result.value
  if (error || value === (props.modelValue ?? null)) return
  emitted = value
  emit('update:modelValue', value, typed)
}

function onType(field: 'day' | 'year' | 'time', value: unknown) {
  draft[field] = String(value ?? '')
  commit(true)
}

function setMonth(value: unknown) {
  draft.month = Number(value) || 1
  commit(false)
}

function setPrecision(value: Precision) {
  // A first date starts from the suggestion (the scene before), or from nothing.
  if (draft.precision === 'none' && value !== 'none' && !draft.year && props.suggest) {
    const suggestion = draftOf(props.suggest)
    draft.year = suggestion.year
    draft.month = suggestion.month
    draft.day = suggestion.day
  }
  if ((value === 'day' || value === 'minute') && !draft.day) draft.day = '1'
  if (value === 'minute' && !draft.time) draft.time = '12:00'
  draft.precision = value
  commit(false)
}

const precisionItems = computed(() => (['none', 'year', 'month', 'day', 'minute'] as const).map(value => ({ value, label: t(`editor.time.precision.${value}`) })))
const monthItems = computed(() => Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Intl.DateTimeFormat(localeTag.value, { month: 'long' }).format(new Date(2000, i, 1)),
})))
const preview = computed(() => (result.value.value ? storyTime(result.value.value) : ''))
</script>

<template>
  <div class="space-y-2">
    <USelect
      :model-value="draft.precision"
      :items="precisionItems"
      value-key="value"
      size="sm"
      class="w-full"
      :ui="{ base: 'pointer-coarse:min-h-11' }"
      :aria-label="t('editor.time.precisionLabel')"
      @update:model-value="(v) => setPrecision(v as Precision)"
    />
    <div v-if="draft.precision !== 'none'" class="flex flex-wrap items-end gap-2">
      <div v-if="draft.precision === 'day' || draft.precision === 'minute'" class="w-14">
        <label :for="`${id}-day`" class="mb-1 block text-xs text-muted">{{ t('editor.time.day') }}</label>
        <UInput
          :id="`${id}-day`"
          :model-value="draft.day"
          inputmode="numeric"
          maxlength="2"
          size="sm"
          class="w-full"
          :ui="{ base: 'pointer-coarse:min-h-11' }"
          :color="result.error ? 'error' : undefined"
          @update:model-value="(v) => onType('day', v)"
        />
      </div>
      <div v-if="draft.precision !== 'year'" class="min-w-32 flex-1">
        <label :for="`${id}-month`" class="mb-1 block text-xs text-muted">{{ t('editor.time.month') }}</label>
        <USelect
          :id="`${id}-month`"
          :model-value="draft.month"
          :items="monthItems"
          value-key="value"
          size="sm"
          class="w-full"
          :ui="{ base: 'pointer-coarse:min-h-11' }"
          @update:model-value="setMonth"
        />
      </div>
      <div class="w-20">
        <label :for="`${id}-year`" class="mb-1 block text-xs text-muted">{{ t('editor.time.year') }}</label>
        <UInput
          :id="`${id}-year`"
          :model-value="draft.year"
          inputmode="numeric"
          maxlength="5"
          size="sm"
          class="w-full"
          :ui="{ base: 'pointer-coarse:min-h-11' }"
          :color="result.error ? 'error' : undefined"
          @update:model-value="(v) => onType('year', v)"
        />
      </div>
      <div v-if="draft.precision === 'minute'" class="w-24">
        <label :for="`${id}-time`" class="mb-1 block text-xs text-muted">{{ t('editor.time.time') }}</label>
        <UInput
          :id="`${id}-time`"
          :model-value="draft.time"
          type="time"
          size="sm"
          class="w-full"
          :ui="{ base: 'pointer-coarse:min-h-11' }"
          @update:model-value="(v) => onType('time', v)"
        />
      </div>
    </div>
    <p v-if="result.error && draft.precision !== 'none'" class="flex items-center gap-1.5 text-xs text-error" role="alert">
      <UIcon name="i-lucide-circle-alert" class="size-3.5 shrink-0" aria-hidden="true" />
      {{ t('editor.time.invalid') }}
    </p>
    <p v-else-if="preview" class="text-xs text-muted">{{ preview }}</p>
  </div>
</template>
