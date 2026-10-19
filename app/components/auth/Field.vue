<script setup lang="ts">
/**
 * A labelled field (DESIGN.md "Inputs"): label above, help below, and when something is wrong the
 * error in its place, `circle-alert` plus words. The input is described by whichever is shown.
 */
defineProps<{ label: string, help?: string, error?: string }>()
</script>

<template>
  <UFormField
    :label="label"
    :help="help"
    :error="error || undefined"
    :ui="{ container: 'mt-1.5', label: 'text-sm font-medium text-default', help: 'mt-1.5 text-sm text-muted', error: 'mt-1.5 text-sm text-error' }"
  >
    <slot />
    <template v-if="error" #error>
      <span class="flex items-start gap-1.5">
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
        <span><slot name="error">{{ error }}</slot></span>
      </span>
    </template>
    <template v-else-if="$slots.help" #help>
      <slot name="help" />
    </template>
  </UFormField>
</template>
