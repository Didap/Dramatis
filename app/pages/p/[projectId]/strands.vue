<script setup lang="ts">
/** Strands: the list, and from xl the list beside the open strand (spec 1.6). */
const route = useRoute()
const { term } = useTerms()
</script>

<template>
  <ArchitectureSplit :open="!!route.params.strandId" :label="term('strands')">
    <template #list>
      <StrandsList pane />
    </template>
    <NuxtPage />
  </ArchitectureSplit>
</template>
