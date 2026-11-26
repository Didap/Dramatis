<script setup lang="ts">
import type { DescribeMode } from '#shared/types/domain'

/**
 * How an item is described, as its author chooses (races VRS-565, places VRS-683): freely, in one
 * text, or guided, section by section. `copy` is the i18n prefix of its words (describe,
 * describeFree, describeGuided, describeFreeHelp, describeGuidedHelp); `name` groups the radios.
 */
const props = defineProps<{ copy: string, name: string }>()
const mode = defineModel<DescribeMode>({ required: true })
const { t } = useI18n()

const MODES = [
  { value: 'free', icon: 'i-lucide-pen-line', label: 'describeFree' },
  { value: 'guided', icon: 'i-lucide-list-tree', label: 'describeGuided' },
] as const
</script>

<template>
  <fieldset class="min-w-0">
    <legend class="text-lg font-semibold text-highlighted">{{ t(`${props.copy}.describe`) }}</legend>
    <div class="mt-3 flex flex-wrap gap-1.5">
      <label v-for="option in MODES" :key="option.value" class="choice-chip" :class="{ 'is-checked': mode === option.value }">
        <input type="radio" class="sr-only" :name="props.name" :value="option.value" :checked="mode === option.value" @change="mode = option.value">
        <UIcon :name="option.icon" class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ t(`${props.copy}.${option.label}`) }}</span>
      </label>
    </div>
    <p class="mt-2 text-sm text-muted">{{ t(`${props.copy}.${mode === 'guided' ? 'describeGuidedHelp' : 'describeFreeHelp'}`) }}</p>
  </fieldset>
</template>
