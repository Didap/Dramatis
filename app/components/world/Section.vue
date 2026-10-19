<script setup lang="ts">
/**
 * A section of a world sheet: a heading (with an optional count), its actions, then the content.
 * The headings give the sheet its outline; the sections are not landmarks (a sheet has a dozen).
 */
const props = withDefaults(defineProps<{
  title: string
  count?: number
}>(), { count: undefined })

const { number } = useFormat()
</script>

<template>
  <section class="d-world-section scroll-mt-20">
    <div class="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 class="flex items-baseline gap-2 text-lg font-semibold text-highlighted">
        {{ props.title }}
        <span v-if="props.count" class="tabular text-sm font-normal text-muted">{{ number(props.count) }}</span>
      </h2>
      <div v-if="$slots.actions" class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </section>
</template>
