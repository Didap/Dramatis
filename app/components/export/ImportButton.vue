<script setup lang="ts">
import type { Project } from '#shared/types/entities'

/**
 * Imports a file as a new project: a project backup (.dramatis.zip, or its dramatis.json), or a manuscript
 * (.docx, Markdown or text) whose headings become parts, chapters and scenes. It never overwrites a project
 * (spec 5.10.7). For the projects page and anywhere else a backup may come back; by default it opens the
 * new project once imported.
 */
const props = withDefaults(defineProps<{
  label?: string
  color?: 'primary' | 'neutral'
  variant?: 'solid' | 'outline' | 'soft' | 'ghost' | 'link'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Open the new project when the import is done. */
  open?: boolean
}>(), { label: undefined, color: 'neutral', variant: 'outline', size: 'md', open: true })

const emit = defineEmits<{ imported: [project: Project] }>()
// Classes and attributes given by the parent go to the button, not to the hidden input.
defineOptions({ inheritAttrs: false })

const { t } = useI18n()
const toast = useToast()
const input = ref<HTMLInputElement | null>(null)
const busy = ref(false)

async function onChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  busy.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const project = await $fetch<Project>('/api/projects/import', { method: 'POST', body: form })
    toast.add({ title: t('export.import.done', { title: project.title }), icon: 'i-lucide-check' })
    emit('imported', project)
    if (props.open) await navigateTo(`/p/${project.id}`)
  }
  catch (error) {
    const reason = (error as { data?: { data?: { reason?: string } } })?.data?.data?.reason
    const known = ['notBackup', 'version', 'invalid', 'tooLarge', 'empty', 'encoding', 'busy']
    toast.add({
      title: reason && known.includes(reason) ? t(`export.import.errors.${reason}`) : errorMessage(error),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
    if (errorStatus(error) === 401) await navigateTo('/login')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UButton
    v-bind="$attrs"
    :label="label ?? t('export.import.label')"
    icon="i-lucide-archive-restore"
    :color="color"
    :variant="variant"
    :size="size"
    :loading="busy"
    @click="input?.click()"
  />
  <!-- Opened by the button: hidden from everyone, so assistive technology meets one control only. -->
  <input
    ref="input"
    type="file"
    accept=".zip,.json,.docx,.md,.markdown,.txt,application/zip,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
    class="hidden"
    tabindex="-1"
    aria-hidden="true"
    @change="onChange"
  >
</template>
