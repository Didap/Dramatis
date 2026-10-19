<script setup lang="ts">
/**
 * The shape of a list before it has anything in it (DESIGN.md "Empty states that teach"): two
 * aria-hidden ghost rows with their leaders, above the empty state.
 */
withDefaults(defineProps<{ leading?: 'dot' | 'none', lines?: 1 | 2 }>(), { leading: 'dot', lines: 1 })
</script>

<template>
  <ul aria-hidden="true" class="pointer-events-none select-none">
    <li v-for="i in 2" :key="i" class="flex min-h-11 items-center gap-3 px-2 py-1.5" :class="i === 2 ? 'opacity-60' : ''">
      <span v-if="leading === 'dot'" class="size-3.5 shrink-0 rounded-full bg-accented" />
      <span class="flex min-w-0 flex-1 flex-col gap-2">
        <span class="flex items-center gap-3">
          <span class="h-2.5 shrink-0 rounded-full bg-accented" :class="i === 1 ? 'w-40' : 'w-28'" />
          <span class="leader" />
          <span class="h-2.5 w-14 shrink-0 rounded-full bg-elevated" />
        </span>
        <span v-if="lines === 2" class="h-2 rounded-full bg-elevated" :class="i === 1 ? 'w-3/4' : 'w-1/2'" />
      </span>
    </li>
  </ul>
</template>
