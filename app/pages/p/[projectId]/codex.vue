<script setup lang="ts">
/** The codex: categories and entries, and from xl the list beside the open entry (spec 1.6). */
const route = useRoute()
const { term } = useTerms()
</script>

<template>
  <ArchitectureSplit :open="!!route.params.entryId" :label="term('codex')">
    <template #list>
      <CodexList pane />
    </template>
    <NuxtPage />
  </ArchitectureSplit>
</template>
