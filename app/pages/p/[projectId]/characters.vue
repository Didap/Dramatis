<script setup lang="ts">
/**
 * Characters (spec 1.6): from xl the list stays on the left while a character is open on the right,
 * the inbox pattern; below xl the list and the sheet are separate pages.
 */
const route = useRoute()
const { term } = useTerms()
const wide = useMediaQuery('(min-width: 1280px)')
const openId = computed(() => (route.params.characterId ? String(route.params.characterId) : null))
</script>

<template>
  <div v-if="wide && openId" class="flex min-h-0 flex-1">
    <aside class="flex w-80 shrink-0 flex-col overflow-hidden border-e border-default/60" :aria-label="term('characters')">
      <CharactersList compact :active-id="openId" />
    </aside>
    <div class="min-w-0 flex-1 overflow-y-auto overscroll-contain">
      <NuxtPage />
    </div>
  </div>
  <NuxtPage v-else />
</template>
