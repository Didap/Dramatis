<script setup lang="ts">
/** The dotted leader joining a name to its number (DESIGN.md signature). Solid when `done`. */
defineProps<{ done?: boolean }>()
</script>

<template>
  <span class="leader" :class="{ 'leader--done': done }" aria-hidden="true" />
</template>
