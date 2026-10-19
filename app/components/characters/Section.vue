<script setup lang="ts">
/** A section of the character sheet: its heading, an optional action beside it, the content. */
defineProps<{ title: string, description?: string }>()
const headingId = useId()
</script>

<template>
  <section :aria-labelledby="headingId" class="scroll-mt-20">
    <div class="mb-2 flex min-h-8 items-center justify-between gap-3">
      <h2 :id="headingId" class="text-lg font-semibold text-highlighted">{{ title }}</h2>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1">
        <slot name="actions" />
      </div>
    </div>
    <p v-if="description" class="-mt-1 mb-3 max-w-prose text-sm text-muted text-pretty">{{ description }}</p>
    <slot />
  </section>
</template>
