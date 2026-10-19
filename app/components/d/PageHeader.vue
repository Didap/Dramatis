<script setup lang="ts">
/** The header of a workspace page: title, one line of context, actions. */
defineProps<{
  title?: string
  description?: string
  /** Small line above the title (the section, a breadcrumb). */
  eyebrow?: string
}>()
</script>

<template>
  <header class="d-page-header flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
    <div class="min-w-0 flex-1">
      <p v-if="eyebrow || $slots.eyebrow" class="mb-1 text-sm text-muted">
        <slot name="eyebrow">{{ eyebrow }}</slot>
      </p>
      <slot name="title">
        <h1 class="text-2xl font-semibold tracking-tight text-highlighted text-balance">{{ title }}</h1>
      </slot>
      <p v-if="description || $slots.description" class="mt-1.5 max-w-prose text-pretty text-muted">
        <slot name="description">{{ description }}</slot>
      </p>
      <div v-if="$slots.meta" class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <slot name="meta" />
      </div>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
