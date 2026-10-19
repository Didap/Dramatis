<script setup lang="ts">
import type { VariableType } from '#shared/types/domain'
import { isInteger } from './ChoiceSentence.vue'

/**
 * A value typed by its variable: vero or falso, a whole number, a text. Values travel as strings
 * ("true", "3", "Oren"), as the data model stores them. The number keypad of a phone may have no
 * minus key (iOS): there a ± button beside the field flips the sign (reputazione ≥ -2).
 * Named by its UFormField label, or by `ariaLabel` where there is none (a row of a condition).
 */
const props = withDefaults(defineProps<{
  type: VariableType
  modelValue: string | undefined
  ariaLabel?: string
  size?: 'sm' | 'md'
}>(), { ariaLabel: undefined, size: 'md' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n()

const booleanItems = computed(() => [
  { value: 'true', label: t('flow.values.true') },
  { value: 'false', label: t('flow.values.false') },
])

const value = computed({
  get: () => props.modelValue ?? '',
  set: (v: string) => emit('update:modelValue', v),
})

const invalid = computed(() => props.type === 'number' && value.value !== '' && !isInteger(value.value))

function flipSign() {
  const raw = value.value.trim()
  value.value = raw.startsWith('-') ? raw.slice(1) : `-${raw}`
}
</script>

<template>
  <USelect
    v-if="type === 'boolean'"
    v-model="value"
    :items="booleanItems"
    :size="size"
    :aria-label="ariaLabel"
    class="w-full max-lg:h-11"
  />
  <div v-else-if="type === 'number'" class="flex w-full min-w-0 gap-1">
    <UInput
      v-model="value"
      type="text"
      inputmode="numeric"
      :size="size"
      :color="invalid ? 'error' : 'primary'"
      :highlight="invalid"
      :aria-invalid="invalid || undefined"
      :aria-label="ariaLabel"
      :placeholder="t('flow.rules.numberPlaceholder')"
      class="min-w-0 flex-1"
      :ui="{ base: 'font-mono tabular max-lg:h-11' }"
    />
    <UButton
      color="neutral"
      variant="outline"
      class="size-11 shrink-0 justify-center font-mono text-base lg:hidden"
      :aria-label="t('flow.rules.flipSign')"
      @click="flipSign"
    >
      ±
    </UButton>
  </div>
  <UInput
    v-else
    v-model="value"
    :size="size"
    :maxlength="200"
    :aria-label="ariaLabel"
    :placeholder="t('flow.rules.textPlaceholder')"
    class="w-full"
    :ui="{ base: 'max-lg:h-11' }"
  />
</template>
