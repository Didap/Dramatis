<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

/**
 * The link that names a row of the outline (part, chapter or scene title). It stretches over its
 * row, so the whole row opens the item, while the row's buttons stay above it. `row` marks it as
 * the row's keyboard stop ("scene:<id>"): focus comes back to it after a move.
 */
defineProps<{ to: RouteLocationRaw, row: string }>()
</script>

<template>
  <NuxtLink :to="to" :data-row="row" class="manuscript-row-link">
    <slot />
  </NuxtLink>
</template>

<style>
/* The ring goes round the whole row (::after). Doubled class: the global focus ring of main.css is (0,2,0). */
.manuscript-row-link.manuscript-row-link,
.manuscript-row-link.manuscript-row-link:focus-visible {
  outline: none;
}
.manuscript-row-link::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: calc(var(--ui-radius) * 2);
}
.manuscript-row-link:focus-visible::after {
  outline: 2px solid var(--ui-primary);
  outline-offset: -2px;
}

/* Drag and drop (Sortable): the placeholder where the item will land, and the item in hand. */
.manuscript-drag-ghost {
  opacity: 0.45;
  background: var(--ui-bg-elevated);
  border-radius: calc(var(--ui-radius) * 2);
}
.manuscript-drag-chosen {
  background: var(--ui-bg-elevated);
}
.manuscript-drag-moving {
  background: var(--ui-bg-floating);
  box-shadow: var(--shadow-floating);
  border-radius: calc(var(--ui-radius) * 2);
  opacity: 1 !important;
}
</style>
