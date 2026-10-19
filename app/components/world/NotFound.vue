<script setup lang="ts">
/** A sheet whose item is not there (moved to the trash, or never existed), with the ways back. */
defineProps<{ listPath: string }>()

const { t } = useI18n()
const store = useProjectStore()
</script>

<template>
  <DEmptyState
    icon="i-lucide-search-x"
    :title="t('world.sheet.notFoundTitle')"
    :description="t('world.sheet.notFound')"
    :actions="[
      { label: t('world.sheet.backToList'), to: listPath, color: 'neutral', variant: 'outline' },
      { label: t('world.sheet.openTrash'), to: `/p/${store.projectId}/trash`, color: 'neutral', variant: 'link', class: 'underline' },
    ]"
  />
</template>
