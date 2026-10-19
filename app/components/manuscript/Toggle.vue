<script setup lang="ts">
/** Collapses or expands a part or chapter of the outline (kept on this device). */
defineProps<{ collapsed: boolean, controls: string, title: string }>()
defineEmits<{ toggle: [] }>()
const { t } = useI18n()
</script>

<template>
  <UButton
    :icon="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
    color="neutral"
    variant="ghost"
    size="xs"
    class="relative z-[2] shrink-0 text-dimmed max-lg:size-11 max-lg:justify-center"
    :aria-expanded="!collapsed"
    :aria-controls="controls"
    :aria-label="t(collapsed ? 'manuscript.chapter.expand' : 'manuscript.chapter.collapse', { title })"
    @click="$emit('toggle')"
  />
</template>
