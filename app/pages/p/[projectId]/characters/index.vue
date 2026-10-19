<script setup lang="ts">
/** The characters of the project (spec 4.4): find one, or add one. */
const { term } = useTerms()
</script>

<template>
  <DPage :title="term('characters')">
    <CharactersList />
  </DPage>
</template>
