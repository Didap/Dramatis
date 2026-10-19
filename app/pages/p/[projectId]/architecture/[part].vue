<script setup lang="ts">
import type { PlanningStatus, RichDoc } from '#shared/types/domain'
import type { Project } from '#shared/types/entities'
import { docWordCount } from '#shared/utils/richtext'

/**
 * Premise, fabula or setting (spec 4.3): the pillar written in the manuscript typography, its
 * planning status and word count, the question of the medium under the title and, with guidance on,
 * the "Che cos'è" explanation folded away. While empty, the editor says what the pillar is for.
 */
const PILLARS = ['premise', 'fabula', 'setting'] as const
type Pillar = (typeof PILLARS)[number]

const route = useRoute()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { words } = useFormat()

const pillar = computed<Pillar | null>(() => {
  const value = String(route.params.part)
  return (PILLARS as readonly string[]).includes(value) ? value as Pillar : null
})
const base = computed(() => `/p/${store.projectId}/architecture`)
const guidance = computed(() => store.project?.settings.guidance ?? true)
const doc = computed(() => (pillar.value ? store.project?.[pillar.value] ?? null : null))
const count = computed(() => docWordCount(doc.value))

const status = computed({
  get: () => (pillar.value ? store.project?.[`${pillar.value}Status`] ?? 'todo' : 'todo'),
  set: (value: string) => {
    if (pillar.value) store.updateProject({ [`${pillar.value}Status`]: value as PlanningStatus } as Partial<Project>).catch(() => {})
  },
})

function onInput(value: RichDoc) {
  if (pillar.value) store.updateProjectSoon({ [pillar.value]: value } as Partial<Project>, 1000)
}

const neighbours = computed(() => {
  const index = pillar.value ? PILLARS.indexOf(pillar.value) : -1
  return { previous: PILLARS[index - 1] ?? null, next: PILLARS[index + 1] ?? null }
})
</script>

<template>
  <DPage v-if="pillar" :title="term(pillar)" :back="base" :back-label="term('architecture')" width="prose">
    <DPageHeader :title="term(pillar)" :description="guidance ? t(`architecture.questions.${store.kind}.${pillar}`) : undefined">
      <template #meta>
        <span class="-ms-2.5">
          <DStatusSelect v-model="status" kind="planning" :aria-label="t('architecture.statusOf', { pillar: term(pillar) })" class="max-lg:min-h-11" />
        </span>
        <span class="tabular">{{ words(count) }}</span>
      </template>
    </DPageHeader>

    <DGuide v-if="guidance" :key="pillar" :topic="pillar" :default-open="false" class="-mt-2 mb-8" />

    <ArchitectureLongText
      :key="pillar"
      :model-value="doc"
      manuscript
      :placeholder="t(`architecture.definitions.${pillar}`)"
      :aria-label="term(pillar)"
      @update:model-value="onInput"
    />

    <nav class="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-default/60 pt-4" :aria-label="term('architecture')">
      <UButton
        v-if="neighbours.previous"
        :to="`${base}/${neighbours.previous}`"
        color="neutral"
        variant="ghost"
        icon="i-lucide-arrow-left"
        :label="term(neighbours.previous)"
        class="-ms-2.5 max-lg:min-h-11"
      />
      <span v-else />
      <UButton
        v-if="neighbours.next"
        :to="`${base}/${neighbours.next}`"
        color="neutral"
        variant="ghost"
        trailing-icon="i-lucide-arrow-right"
        :label="term(neighbours.next)"
        class="-me-2.5 max-lg:min-h-11"
      />
    </nav>
  </DPage>

  <DPage v-else :title="term('architecture')" :back="base" :back-label="term('architecture')" width="prose">
    <DEmptyState
      icon="i-lucide-drafting-compass"
      :title="t('architecture.notFound')"
      :actions="[{ label: t('architecture.backToIndex'), to: base, color: 'neutral', variant: 'outline', class: 'max-lg:min-h-11' }]"
    />
  </DPage>
</template>
