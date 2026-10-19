<script setup lang="ts">
/** The strands of the story, or the storylines and quests of a game (spec 4.3). */
const { term } = useTerms()
</script>

<template>
  <DPage :title="term('strands')">
    <StrandsList />
  </DPage>
</template>
