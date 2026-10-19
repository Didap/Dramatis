<script setup lang="ts">
import type { ProjectSummary } from '#shared/types/entities'

/**
 * A backup of every project, one file each (appendix D.9). Without password reset by email, a
 * backup is the author's safety net: the account page keeps it one click away.
 */
const props = defineProps<{ projects: ProjectSummary[] | null }>()

const { t } = useI18n()
const { label } = useEnums()
const { words } = useFormat()

const live = computed(() => (props.projects ?? []).filter(p => !p.deletedAt))
const deleted = computed(() => (props.projects ?? []).filter(p => p.deletedAt))
</script>

<template>
  <div class="account-backups">
    <div v-if="!projects" class="space-y-2" aria-busy="true">
      <USkeleton v-for="i in 2" :key="i" class="h-11 w-full" />
    </div>
    <p v-else-if="!projects.length" class="text-sm text-muted">{{ t('account.backup.none') }}</p>
    <ul v-else>
      <li v-for="project in live" :key="project.id" class="group flex min-h-11 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 hover:bg-elevated">
        <span class="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
          <span class="block truncate">
            <span class="voice-author font-semibold text-highlighted">{{ project.title }}</span>
            <span class="text-sm text-muted">, {{ label('projectKind', project.kind).toLocaleLowerCase() }}</span>
          </span>
          <DLeader class="hidden sm:block" />
          <span class="block shrink-0 text-sm text-muted">{{ words(project.words) }}</span>
        </span>
        <UButton
          :href="`/api/projects/${project.id}/export/backup`"
          download
          external
          icon="i-lucide-download"
          :label="t('account.backup.download')"
          :aria-label="t('account.backup.downloadOf', { name: project.title })"
          color="neutral"
          variant="outline"
          size="sm"
          class="shrink-0"
        />
      </li>
      <li v-for="project in deleted" :key="project.id" class="flex min-h-11 items-center gap-3 px-2 py-1.5">
        <span class="min-w-0 flex-1 truncate">
          <span class="voice-author text-muted">{{ project.title }}</span>
          <span class="text-sm text-dimmed">, {{ t('account.backup.deleted') }}</span>
        </span>
        <UButton to="/projects?deleted=1" :label="t('account.backup.restoreFirst')" color="primary" variant="link" size="sm" class="shrink-0 underline underline-offset-3" />
      </li>
    </ul>
  </div>
</template>
