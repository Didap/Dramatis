<script setup lang="ts">
/**
 * The three pillars of the story at a glance (spec 4.3): premise, fabula and setting with their
 * status, word count and first lines; then the way to the strands and the notes.
 */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()

const { number } = useFormat()

const PILLARS = ['premise', 'fabula', 'setting'] as const
const guidance = computed(() => store.project?.settings.guidance ?? true)

const related = computed(() => [
  { key: 'strands', label: term('strands'), icon: SECTION_ICONS.strands, to: `/p/${store.projectId}/strands`, count: store.rows.strands.length },
  { key: 'notes', label: term('notes'), icon: SECTION_ICONS.notes, to: `/p/${store.projectId}/notes`, count: store.rows.notes.length },
])
</script>

<template>
  <DPage :title="term('architecture')" width="prose">
    <DPageHeader :title="term('architecture')" :description="guidance ? t(`architecture.intro.${store.kind}`) : undefined" />

    <ul role="list" class="-mx-2 space-y-1">
      <ArchitecturePillarRow v-for="pillar in PILLARS" :key="pillar" :pillar="pillar" />
    </ul>

    <nav class="-mx-2 mt-10 sm:pe-40" :aria-label="t(`architecture.related.${store.kind}`)">
      <ul role="list">
        <li v-for="link in related" :key="link.key">
          <NuxtLink
            :to="link.to"
            class="group flex min-h-11 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 transition-colors duration-150 hover:bg-elevated"
          >
            <UIcon :name="link.icon" class="size-4 shrink-0 text-muted" />
            <!-- The leader sits on the baseline of the words it joins. -->
            <span class="flex min-w-0 flex-1 items-baseline gap-3">
              <span class="text-sm font-medium text-highlighted">{{ link.label }}</span>
              <DLeader />
              <span class="tabular shrink-0 text-sm text-muted">{{ number(link.count) }}</span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </DPage>
</template>
