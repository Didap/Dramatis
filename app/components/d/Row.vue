<script setup lang="ts">
/**
 * A list row (DESIGN.md "Rows, not cards"): leading picture or dot, the name in the author's voice,
 * the epithet after a comma in italic, the leader, tabular numbers, trailing status or actions.
 * A link when `to` is set; below 40rem the numbers move under the name.
 */
withDefaults(defineProps<{
  to?: string
  name: string
  epithet?: string
  /** Use the UI face for the name (dense tables, app-made labels). */
  uiName?: boolean
  active?: boolean
}>(), { to: undefined, epithet: undefined, uiName: false, active: false })

const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <component
    :is="to ? NuxtLink : 'div'"
    :to="to"
    class="d-row group flex min-h-11 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 outline-none transition-colors duration-150 hover:bg-elevated focus-visible:bg-elevated"
    :class="active ? 'bg-elevated' : ''"
    :aria-current="active ? 'page' : undefined"
  >
    <span v-if="$slots.leading" class="flex shrink-0 items-center"><slot name="leading" /></span>
    <span class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
      <span class="min-w-0 truncate" :class="uiName ? 'text-sm font-medium text-highlighted' : 'voice-author font-semibold text-highlighted'">
        <slot name="name">{{ name }}</slot><template v-if="epithet"><span class="voice-author font-normal italic text-muted">, {{ epithet }}</span></template>
      </span>
      <DLeader v-if="$slots.numbers" class="hidden sm:block" />
      <span v-if="$slots.numbers" class="flex shrink-0 items-center gap-3 text-sm text-muted">
        <slot name="numbers" />
      </span>
    </span>
    <span v-if="$slots.trailing" class="flex shrink-0 items-center gap-1"><slot name="trailing" /></span>
  </component>
</template>
