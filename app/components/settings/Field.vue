<script setup lang="ts">
/**
 * One setting: the label and what it does on the left, the control on the right (stacked on a
 * phone), every control of the page in the same column. `for` ties the label to an input and names
 * the description `<for>-help`, for the control's aria-describedby; radio groups label themselves.
 */
defineProps<{
  label: string
  description?: string
  for?: string
  /** An icon before the label (the modules). */
  icon?: string
  /** The control takes the whole width under the label (long inputs, radio lists). */
  stacked?: boolean
}>()
</script>

<template>
  <div class="settings-field flex flex-col gap-3 py-4 first:pt-0 last:pb-0" :class="stacked ? '' : 'sm:flex-row sm:items-start sm:justify-between sm:gap-8'">
    <div class="flex min-w-0 gap-3 sm:max-w-md">
      <UIcon v-if="icon" :name="icon" class="mt-0.5 size-5 shrink-0 text-muted" />
      <div class="min-w-0">
        <label v-if="$props.for" :for="$props.for" class="text-sm font-medium text-default">{{ label }}</label>
        <p v-else class="text-sm font-medium text-default">{{ label }}</p>
        <p v-if="description || $slots.description" :id="$props.for ? `${$props.for}-help` : undefined" class="mt-0.5 text-sm text-pretty text-muted">
          <slot name="description">{{ description }}</slot>
        </p>
      </div>
    </div>
    <div class="min-w-0" :class="[stacked ? 'w-full' : 'sm:w-72 sm:shrink-0', icon ? 'max-sm:ps-8' : '']">
      <slot />
    </div>
  </div>
</template>
