<script setup lang="ts">
/** A short field of a world sheet: its label above (DESIGN.md "Inputs"), the control below. */
defineProps<{ label: string }>()
</script>

<template>
  <div class="min-w-0">
    <p class="mb-0.5 text-xs font-medium text-muted" aria-hidden="true">{{ label }}</p>
    <slot />
  </div>
</template>
