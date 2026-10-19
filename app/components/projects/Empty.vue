<script setup lang="ts">
/**
 * No projects yet (spec 4.1): the shape of the list first, two ghost rows with their leaders, then
 * the sentence and the three ways to start: a new project, an example, a file to import (a backup
 * or a manuscript).
 */
const emit = defineEmits<{ create: [] }>()
const { t } = useI18n()
const button = 'min-h-11 w-full shrink-0 justify-center sm:min-h-8 sm:w-56 sm:justify-start'
</script>

<template>
  <div>
    <ul class="pointer-events-none select-none" aria-hidden="true">
      <li v-for="width in ['w-44', 'w-32']" :key="width" class="flex items-center gap-3 px-2 py-2.5 opacity-70">
        <span class="size-8 shrink-0 rounded-[calc(var(--ui-radius)*2)] bg-elevated" />
        <span class="h-3 shrink-0 rounded-full bg-elevated" :class="width" />
        <DLeader />
        <span class="h-3 w-16 shrink-0 rounded-full bg-elevated" />
      </li>
    </ul>

    <p class="mt-8 max-w-xl font-serif text-xl/snug text-highlighted text-pretty">{{ t('projects.empty.title') }}</p>

    <ul class="mt-6 max-w-2xl divide-y divide-default border-y border-default">
      <li class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-6">
        <UButton :label="t('common.nav.newProject')" icon="i-lucide-plus" color="primary" variant="solid" :class="button" @click="emit('create')" />
        <p class="text-sm text-muted text-pretty">{{ t('projects.empty.newHint') }}</p>
      </li>
      <li class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-6">
        <ProjectsDemoMenu :button="{ class: button }" />
        <p class="text-sm text-muted text-pretty">{{ t('projects.empty.demoHint') }}</p>
      </li>
      <li class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-6">
        <ExportImportButton :label="t('projects.empty.import')" :class="button" />
        <p class="text-sm text-muted text-pretty">{{ t('projects.empty.importHint') }}</p>
      </li>
    </ul>
  </div>
</template>
