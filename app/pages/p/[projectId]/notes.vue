<script setup lang="ts">
/** Notes: the notebook, and from xl the list beside the open note (spec 1.6). */
const route = useRoute()
const { term } = useTerms()
</script>

<template>
  <ArchitectureSplit :open="!!route.params.noteId" :label="term('notes')">
    <template #list>
      <NotesList pane />
    </template>
    <NuxtPage />
  </ArchitectureSplit>
</template>
