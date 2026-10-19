<script setup lang="ts">
/** A section of a settings page: an anchored heading, one line of context, its fields. */
defineProps<{
  id: string
  title: string
  description?: string
}>()
</script>

<template>
  <section :id="id" class="settings-section scroll-mt-20" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`" class="text-lg font-semibold text-highlighted">{{ title }}</h2>
    <p v-if="description" class="mt-1 max-w-prose text-sm text-pretty text-muted">{{ description }}</p>
    <div class="mt-4 divide-y divide-default/60">
      <slot />
    </div>
  </section>
</template>
