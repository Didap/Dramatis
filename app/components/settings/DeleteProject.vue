<script lang="ts">
/**
 * Moves the open project to the deleted projects ("Eliminati", restorable), then opens the projects
 * list with an undo toast. Settings asks first; the demo banner's "Elimina l'esempio" does not.
 */
export function useMoveProjectToDeleted() {
  const store = useProjectStore()
  const nuxtApp = useNuxtApp()
  const { t } = useI18n()
  const toast = useToast()
  const busy = ref(false)

  async function move() {
    const id = store.projectId
    const name = store.project?.title ?? ''
    busy.value = true
    try {
      await store.flush()
      await store.flushProject()
      await $fetch(`/api/projects/${id}`, { method: 'DELETE' })
      await navigateTo('/projects')
      store.reset()
      toast.add({
        title: t('settings.delete.done', { name }),
        icon: 'i-lucide-archive',
        actions: [{
          label: t('common.actions.undo'),
          onClick: async () => {
            try {
              await $fetch(`/api/projects/${id}/restore`, { method: 'POST' })
              await nuxtApp.runWithContext(() => navigateTo(`/p/${id}`))
            }
            catch (error) {
              notifyError(error, { toast, nuxtApp })
            }
          },
        }],
      })
    }
    catch (error) {
      notifyError(error, { toast, nuxtApp })
    }
    finally {
      busy.value = false
    }
  }

  return { move, busy }
}
</script>

<script setup lang="ts">
/** "Sposta tra gli eliminati", asked once inline; cancelling gives the focus back to the button. */
const props = defineProps<{ title: string }>()

const { t } = useI18n()
const { move, busy } = useMoveProjectToDeleted()

const confirming = ref(false)
const startRef = useTemplateRef<{ $el: HTMLElement }>('start')
const cancelRef = useTemplateRef<{ $el: HTMLElement }>('cancel')
watch(confirming, async (open) => {
  await nextTick()
  ;(open ? cancelRef.value : startRef.value)?.$el?.focus()
})
</script>

<template>
  <div class="settings-delete pt-1">
    <UButton
      v-if="!confirming"
      ref="start"
      icon="i-lucide-archive"
      :label="t('settings.delete.action')"
      color="error"
      variant="outline"
      class="max-lg:min-h-11"
      @click="confirming = true"
    />
    <div
      v-else
      class="flex flex-col gap-3 rounded-[calc(var(--ui-radius)*2)] border border-error/40 px-4 py-3"
      role="group"
      :aria-label="t('settings.delete.title')"
      @keydown.esc="confirming = false"
    >
      <p class="text-pretty text-default">{{ t('settings.delete.ask', { name: props.title }) }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton ref="cancel" :label="t('common.actions.cancel')" color="neutral" variant="ghost" class="max-lg:min-h-11" @click="confirming = false" />
        <UButton :label="t('settings.delete.confirm')" color="error" variant="solid" :loading="busy" class="max-lg:min-h-11" @click="move" />
      </div>
    </div>
  </div>
</template>
