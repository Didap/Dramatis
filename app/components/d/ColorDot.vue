<script setup lang="ts">
/** A small swatch of an entity colour. Decorative: a name always sits next to it. */
withDefaults(defineProps<{ color?: string | null, size?: 'xs' | 'sm' | 'md' }>(), { color: null, size: 'sm' })
</script>

<template>
  <span
    aria-hidden="true"
    class="inline-block shrink-0 rounded-full"
    :class="{ 'size-1.5': size === 'xs', 'size-2.5': size === 'sm', 'size-3.5': size === 'md' }"
    :style="{ background: color ? `var(--entity-${color})` : 'var(--ui-border-accented)' }"
  />
</template>
