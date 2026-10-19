<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { Project } from '#shared/types/entities'
import type { ProjectAction } from './Menu.vue'

/**
 * "Apri un esempio": a fresh copy of the example novel or game, in the interface language, opened
 * at once. The server titles it as an example ("Esempio: Le parole prestate", spec appendix C).
 */
const props = withDefaults(defineProps<{ button?: ButtonProps }>(), { button: () => ({}) })

const { t, locale } = useI18n()
const toast = useToast()
const nuxtApp = useNuxtApp()
const busy = ref(false)

async function openDemo(kind: 'novel' | 'game') {
  if (busy.value) return
  busy.value = true
  try {
    const project = await $fetch<Project>('/api/projects/demo', { method: 'POST', body: { kind, locale: locale.value } })
    await navigateTo(`/p/${project.id}`)
  }
  catch (error) {
    notifyError(error, { toast, nuxtApp })
  }
  finally {
    busy.value = false
  }
}

const groups = computed<ProjectAction[][]>(() => [[
  { key: 'novel', label: t('projects.demo.novel'), description: t('projects.demo.novelHint'), icon: 'i-lucide-book-open', onSelect: () => openDemo('novel') },
  { key: 'game', label: t('projects.demo.game'), description: t('projects.demo.gameHint'), icon: 'i-lucide-gamepad-2', onSelect: () => openDemo('game') },
]])
</script>

<template>
  <ProjectsMenu :groups="groups" :title="t('projects.actions.demo')" :disabled="busy" width="w-76">
    <UButton
      :label="t('projects.actions.demo')"
      icon="i-lucide-book-open-text"
      trailing-icon="i-lucide-chevron-down"
      color="neutral"
      variant="outline"
      :loading="busy"
      v-bind="props.button"
    />
  </ProjectsMenu>
</template>
