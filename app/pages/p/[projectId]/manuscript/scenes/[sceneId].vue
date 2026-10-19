<script setup lang="ts">
/**
 * The scene editor (spec 4.5): /p/:projectId/manuscript/scenes/:sceneId?panel=details|revisions|find.
 * Each scene gets its own editor instance, so moving to the next scene starts clean.
 */
const route = useRoute()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()

const sceneId = computed(() => String(route.params.sceneId))
const scene = computed(() => store.get('scenes', sceneId.value))
</script>

<template>
  <EditorScene v-if="scene" :key="sceneId" :scene-id="sceneId" />
  <div v-else class="grid min-h-full place-items-center p-6">
    <DEmptyState
      icon="i-lucide-file-question"
      :title="t('editor.missing.title')"
      :description="t('editor.missing.body')"
      :actions="[
        { label: term('manuscript'), to: `/p/${store.projectId}/manuscript`, color: 'neutral', variant: 'outline' },
        { label: term('trash'), to: `/p/${store.projectId}/trash`, color: 'neutral', variant: 'ghost' },
      ]"
    />
  </div>
</template>
