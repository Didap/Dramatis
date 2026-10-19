<script setup lang="ts">
import { useTrashedCharacter } from './saving'

/**
 * Said above a character's pages when its saves fail because it is in the trash, moved there from
 * another device: what is typed here cannot be kept until it comes back.
 */
const props = defineProps<{ characterId: string }>()

const store = useProjectStore()
const { t } = useI18n()
const trashed = useTrashedCharacter(() => props.characterId)
const restoring = ref(false)

async function restore() {
  restoring.value = true
  try {
    await store.restore('characters', props.characterId)
    trashed.value = false
  }
  catch {
    // The store has said what went wrong.
  }
  finally {
    restoring.value = false
  }
}
</script>

<template>
  <div v-if="trashed" role="alert" class="mb-6 flex flex-wrap items-start gap-x-3 gap-y-2 text-sm">
    <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0 text-warning" />
    <p class="min-w-0 flex-1 basis-60 text-pretty text-highlighted">{{ t('characters.trashed.body') }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-undo-2"
        class="pointer-coarse:min-h-11"
        :loading="restoring"
        :label="t('characters.trashed.restore')"
        @click="restore"
      />
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="pointer-coarse:min-h-11"
        :to="`/p/${store.projectId}/trash`"
        :label="t('characters.trashed.openTrash')"
      />
    </div>
  </div>
</template>
