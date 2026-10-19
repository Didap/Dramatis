<script setup lang="ts">
import type { PlanningStatus } from '#shared/types/domain'
import type { Project } from '#shared/types/entities'
import { docWordCount, excerpt, isEmptyDoc } from '#shared/utils/richtext'

/**
 * One pillar of the story on the architecture index (spec 4.3): its name joined by the leader to its
 * word count, the first two lines of what the author wrote (or, while empty, what the pillar is for),
 * and its planning status, changed in place.
 */
const props = defineProps<{ pillar: 'premise' | 'fabula' | 'setting' }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { words } = useFormat()

const statusKey = computed(() => `${props.pillar}Status` as const)
const doc = computed(() => store.project?.[props.pillar] ?? null)
const empty = computed(() => isEmptyDoc(doc.value))
const count = computed(() => docWordCount(doc.value))

const status = computed({
  get: () => store.project?.[statusKey.value] ?? 'todo',
  set: (value: string) => { store.updateProject({ [statusKey.value]: value as PlanningStatus } as Partial<Project>).catch(() => {}) },
})
</script>

<template>
  <li class="flex flex-col gap-1 rounded-[calc(var(--ui-radius)*2)] px-2 py-2.5 transition-colors duration-150 hover:bg-elevated focus-within:bg-elevated sm:flex-row sm:items-start sm:gap-4">
    <NuxtLink :to="`/p/${store.projectId}/architecture/${pillar}`" class="group flex min-w-0 flex-1 flex-col gap-1 rounded-[calc(var(--ui-radius)*2)]">
      <span class="flex min-h-7 items-baseline gap-3">
        <span class="text-base font-semibold text-highlighted">{{ term(pillar) }}</span>
        <template v-if="!empty">
          <DLeader />
          <span class="tabular shrink-0 text-sm text-muted">{{ words(count) }}</span>
        </template>
      </span>
      <span v-if="!empty" class="voice-author line-clamp-2 text-pretty text-[1.0625rem] leading-relaxed text-muted">{{ excerpt(doc, 320) }}</span>
      <span v-else class="text-sm text-muted">{{ t(`architecture.definitions.${pillar}`) }}</span>
    </NuxtLink>
    <div class="-ms-2 shrink-0 sm:ms-0 sm:w-36">
      <DStatusSelect v-model="status" kind="planning" :aria-label="t('architecture.statusOf', { pillar: term(pillar) })" class="max-lg:min-h-11" />
    </div>
  </li>
</template>
