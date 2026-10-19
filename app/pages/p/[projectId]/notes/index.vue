<script setup lang="ts">
/** The author's notebook: ideas, research, things to remember (spec 4.3). */
const { term } = useTerms()
</script>

<template>
  <DPage :title="term('notes')">
    <NotesList />
  </DPage>
</template>
