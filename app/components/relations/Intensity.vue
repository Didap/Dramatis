<script setup lang="ts">
import type { RelationIntensity } from '#shared/types/domain'

/**
 * How strong a bond is, as one side feels it: three chips, Debole, Media, Forte, each with its signal
 * icon (a radio group, so the arrow keys move between them).
 */
defineProps<{
  label: string
  /** The legend is read, not shown (the row around it already says what this is). */
  hideLabel?: boolean
}>()
const model = defineModel<RelationIntensity>({ required: true })

const { t } = useI18n()
const uid = useId()

const LEVELS = [
  { value: 1, icon: 'i-lucide-signal-low' },
  { value: 2, icon: 'i-lucide-signal-medium' },
  { value: 3, icon: 'i-lucide-signal-high' },
] as const
</script>

<template>
  <fieldset class="min-w-0">
    <legend :class="hideLabel ? 'sr-only' : 'mb-1.5 text-sm font-medium text-default'">{{ label }}</legend>
    <div class="flex flex-wrap gap-1.5">
      <label v-for="level in LEVELS" :key="level.value" class="choice-chip" :class="{ 'is-checked': model === level.value }">
        <input type="radio" class="sr-only" :name="uid" :value="level.value" :checked="model === level.value" @change="model = level.value">
        <UIcon :name="level.icon" class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ t(`relations.intensity.${level.value}`) }}</span>
      </label>
    </div>
  </fieldset>
</template>
