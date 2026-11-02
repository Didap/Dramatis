<script setup lang="ts">
import { useCharacterListFolded } from '~/components/characters/listPanel'

/**
 * Characters (spec 1.6): from xl the list stays on the left while a character is open on the right,
 * the inbox pattern; below xl the list and the sheet are separate pages. The sheet's bar can fold the
 * list away towards the sidebar, and the sheet takes the room.
 */
const route = useRoute()
const { term } = useTerms()
const wide = useMediaQuery('(min-width: 1280px)')
const openId = computed(() => (route.params.characterId ? String(route.params.characterId) : null))
const folded = useCharacterListFolded()
</script>

<template>
  <div v-if="wide && openId" class="flex min-h-0 flex-1">
    <!-- Folded, the list slides away at its own width and leaves the tab order. -->
    <aside
      id="characters-list"
      class="flex shrink-0 flex-col overflow-hidden border-default/60 transition-[width] duration-200 ease-out motion-reduce:transition-none"
      :class="folded ? 'w-0' : 'w-80 border-e'"
      :inert="folded"
      :aria-label="term('characters')"
    >
      <div class="flex min-h-0 w-80 flex-1 flex-col">
        <CharactersList compact :active-id="openId" />
      </div>
    </aside>
    <div class="min-w-0 flex-1 overflow-y-auto overscroll-contain">
      <NuxtPage />
    </div>
  </div>
  <NuxtPage v-else />
</template>
