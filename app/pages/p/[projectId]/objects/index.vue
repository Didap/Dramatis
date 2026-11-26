<script setup lang="ts">
/** Objects (items, in English games): the list; in a game with a bestiary, the objects of no other category. */
const store = useProjectStore()
</script>

<template>
  <ObjectsPage :category="store.bestiary ? 'object' : undefined" />
</template>
