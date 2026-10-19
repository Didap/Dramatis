<script setup lang="ts">
/** The name of the house, set in the book face: a link home (the landing, or the projects once signed in). */
withDefaults(defineProps<{ to?: string, label?: string, size?: 'sm' | 'md' }>(), { to: '/', label: undefined, size: 'md' })
const { t } = useI18n()
</script>

<template>
  <NuxtLink
    :to="to"
    class="inline-flex min-h-11 items-center rounded-[calc(var(--ui-radius)*1.5)] font-serif font-semibold tracking-tight text-highlighted"
    :class="size === 'sm' ? 'text-lg' : 'text-xl'"
    :aria-label="label ?? t('landing.home')"
  >
    Dramatis
  </NuxtLink>
</template>
