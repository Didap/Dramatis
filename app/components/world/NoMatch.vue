<script setup lang="ts">
/** In place of a world list when its filter matches nothing, with the way back to every row. */
defineProps<{ query: string }>()

const emit = defineEmits<{ clear: [] }>()
const { t } = useI18n()
</script>

<template>
  <p class="px-2 py-3 text-sm text-muted">
    {{ t('world.list.noMatch', { q: query.trim() }) }}
    <button
      type="button"
      class="ms-1 inline-block underline underline-offset-3 hover:text-default max-lg:-my-3 max-lg:py-3"
      @click="emit('clear')"
    >{{ t('world.list.clearFilter') }}</button>
  </p>
</template>
