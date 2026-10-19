<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ProjectSummary } from '#shared/types/entities'

/** The project title at the top of the sidebar, with the other projects and "Nuovo progetto". */
defineProps<{ collapsed?: boolean }>()
const store = useProjectStore()
const { t } = useI18n()
const { label } = useEnums()
const projects = ref<ProjectSummary[]>([])

async function loadProjects() {
  if (projects.value.length) return
  projects.value = await $fetch<ProjectSummary[]>('/api/projects').catch(() => [])
}

const items = computed<DropdownMenuItem[][]>(() => [
  projects.value
    .filter(p => !p.deletedAt && p.id !== store.projectId)
    .slice(0, 8)
    .map(p => ({ label: p.title, description: label('projectKind', p.kind), to: `/p/${p.id}` })),
  [
    { label: t('common.nav.projects'), icon: 'i-lucide-library', to: '/projects' },
    { label: t('common.nav.newProject'), icon: 'i-lucide-plus', to: '/projects?new=1' },
  ],
].filter(group => group.length))
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'start' }" :ui="{ content: 'w-64' }" @update:open="(open: boolean) => open && loadProjects()">
    <button
      type="button"
      class="flex w-full min-w-0 items-center gap-2 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 text-start outline-none hover:bg-elevated"
      :aria-label="t('common.nav.projects')"
    >
      <DEntityAvatar v-if="collapsed" :name="store.project?.title ?? ''" :color="store.project?.color || 'slate'" shape="square" size="sm" />
      <span v-else class="min-w-0 flex-1">
        <span class="voice-author block truncate font-semibold text-highlighted">{{ store.project?.title }}</span>
        <span class="block text-xs text-muted">{{ label('projectKind', store.kind) }}</span>
      </span>
      <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="size-4 shrink-0 text-dimmed" />
    </button>
  </UDropdownMenu>
</template>
