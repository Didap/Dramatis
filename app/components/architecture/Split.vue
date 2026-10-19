<script setup lang="ts">
/**
 * List and detail side by side from xl (spec 1.6, the inbox pattern): while an item is open, its list
 * stays in a pane on the left, each side scrolling on its own. Below xl, or with nothing open, the
 * page alone (the default slot).
 */
defineProps<{
  /** An item is open (the route has its id). */
  open: boolean
  /** Accessible name of the list pane. */
  label: string
}>()

const wide = useMediaQuery('(min-width: 1280px)')
</script>

<template>
  <div v-if="wide && open" class="flex min-h-0 flex-1">
    <aside :aria-label="label" class="w-[22rem] shrink-0 overflow-y-auto overscroll-contain border-e border-default/70">
      <slot name="list" />
    </aside>
    <div class="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <slot />
    </div>
  </div>
  <slot v-else />
</template>
