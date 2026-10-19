<script setup lang="ts">
import { DURATION_UNITS } from '#shared/utils/constants'
import type { DurationUnit } from '#shared/types/domain'

/** How long a scene or an event lasts: a whole number and a unit. Clearing the number clears both. */
const amount = defineModel<number | null>('value', { default: null })
const unit = defineModel<DurationUnit | null>('unit', { default: null })
const props = withDefaults(defineProps<{ defaultUnit?: DurationUnit }>(), { defaultUnit: 'minutes' })

const { t } = useI18n()
const { options } = useEnums()
const id = useId()

const units = computed(() => options('durationUnit', DURATION_UNITS))
/** The unit chosen last, kept while the number is empty. */
const chosen = ref<DurationUnit>(unit.value ?? props.defaultUnit)
watch(unit, (value) => { if (value) chosen.value = value })

function setAmount(value: string | number | null) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) {
    amount.value = null
    unit.value = null
    return
  }
  amount.value = Math.min(Math.round(n), 1_000_000)
  unit.value = chosen.value
}

function setUnit(value: DurationUnit) {
  chosen.value = value
  if (amount.value !== null) unit.value = value
}
</script>

<template>
  <div class="min-w-0">
    <label :for="id" class="mb-1.5 block text-sm font-medium text-default">{{ t('timeline.when.duration') }}</label>
    <div class="flex flex-wrap items-center gap-2">
      <UInput
        :id="id"
        :model-value="amount === null ? '' : String(amount)"
        type="number"
        inputmode="numeric"
        :min="0"
        :placeholder="t('timeline.when.durationPlaceholder')"
        class="w-24"
        :ui="{ base: 'text-base sm:text-sm max-lg:min-h-11 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none' }"
        @update:model-value="setAmount"
      />
      <USelect
        :model-value="unit ?? chosen"
        :items="units"
        value-key="value"
        :aria-label="t('timeline.when.durationUnit')"
        class="w-32 max-lg:min-h-11"
        :ui="{ base: 'text-base sm:text-sm' }"
        @update:model-value="setUnit($event as DurationUnit)"
      />
    </div>
  </div>
</template>
