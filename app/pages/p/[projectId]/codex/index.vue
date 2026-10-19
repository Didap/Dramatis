<script setup lang="ts">
/** The lore of the world, by category (module codex, spec 4.4); ?category= shows one. */
const { term } = useTerms()
</script>

<template>
  <DPage :title="term('codex')">
    <CodexList />
  </DPage>
</template>
