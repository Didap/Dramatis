<script setup lang="ts">
import type { WritingStats } from '#shared/types/entities'
import { STRUCTURES } from '#shared/content/structures'
import { isEmptyDoc } from '#shared/utils/richtext'
import type { ProjectPath } from '~~/server/api/projects/[projectId]/path.get'
import { useMoveProjectToDeleted } from '~/components/settings/DeleteProject.vue'

/**
 * The overview (spec 4.2): pick up where you left off and see where the story stands.
 * Riprendi, the path (when guidance is on), today, the deadline, the last items edited and,
 * for games with branches, the health of the flow. On a phone: resume, today, then the path,
 * in that order for the keyboard and screen readers too.
 */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const { number, words, scenes, chapters } = useFormat()
const { analysis } = useFlow()
const toast = useToast()
const desktop = useIsDesktop()

const base = computed(() => `/p/${store.projectId}`)
const { data: path, error: pathError, refresh: refreshPath } = useLazyFetch<ProjectPath>(() => `/api/projects/${store.projectId}/path`)
// The same span as the goals page, so the pace and the projected finish agree.
const { data: stats, error: statsError } = useLazyFetch<WritingStats>(() => `/api/projects/${store.projectId}/stats`, { query: { days: 365 } })

const guidance = computed(() => store.project?.settings.guidance ?? true)
const lastEdited = computed(() => [...store.rows.scenes].filter(s => s.editedAt).sort((a, b) => b.editedAt!.localeCompare(a.editedAt!))[0])
const resume = computed(() => lastEdited.value ?? store.orderedScenes[0])
const isEmpty = computed(() =>
  !store.rows.scenes.some(s => s.wordCount > 0) && !store.rows.characters.length && isEmptyDoc(store.project?.premise))
const hasGoals = computed(() => !!(store.project?.wordGoal || store.project?.dailyWordGoal || store.project?.deadline))

/** Under the title on a desktop; after resume and today on a phone. */
const blocks = computed(() => (desktop.value ? ['path', 'work'] : ['work', 'path']))

/** Hiding and showing again in a row travel as one request (see updateProjectSoon). */
function setGuidance(value: boolean) {
  if (!store.project) return
  store.updateProjectSoon({ settings: { ...store.project.settings, guidance: value } }, 300)
}

function hidePath() {
  setGuidance(false)
  toast.add({
    title: t('overview.path.hidden'),
    description: t('overview.path.hiddenHint'),
    icon: 'i-lucide-eye-off',
    actions: [{ label: t('common.actions.undo'), onClick: () => setGuidance(true) }],
  })
}

// ---------------------------------------------------------------- a demo, a new structure

const { move: deleteDemo, busy: deletingDemo } = useMoveProjectToDeleted()
function dismissDemo() {
  if (store.project) store.updateProjectSoon({ settings: { ...store.project.settings, demo: false } }, 300)
}

/*
 * "Struttura «Tre atti» creata: 10 capitoli in 3 parti e 3 linee narrative." once, on the first
 * visit to a new project (less than a day old, no scene yet) made from a structure (settings.template).
 */
const structureLine = ref('')
watch(() => store.projectId, (id) => {
  structureLine.value = ''
  const project = store.project
  if (!project || store.rows.scenes.length || Date.now() - new Date(project.createdAt).getTime() > 86_400_000) return
  const storageKey = `dramatis:structure-line:${id}`
  try {
    if (localStorage.getItem(storageKey)) return
  }
  catch {}
  const structure = STRUCTURES.find(s => s.key === project.settings.template)
  if (!structure) return
  const partTitles = store.orderedParts.map(p => p.title)
  const chapterTitles = store.orderedChapters.map(c => c.title)
  const count = (n: number, key: 'part' | 'strand') => `${number(n)} ${term(key, n).toLocaleLowerCase()}`
  structureLine.value = t('overview.structure', {
    name: t(`structures.${structure.key}.name`),
    chapters: chapters(chapterTitles.length),
    parts: count(partTitles.length, 'part'),
    strands: count(store.rows.strands.length, 'strand'),
  })
  try { localStorage.setItem(storageKey, '1') }
  catch {}
}, { immediate: true })

/** "Flusso: 2 scene irraggiungibili, 1 vicolo cieco." */
const flowLine = computed(() => {
  const a = analysis.value
  if (!a || !store.rows.scenes.length) return null
  const parts: string[] = []
  if (!a.hasStart) parts.push(t('overview.flow.noStart'))
  if (a.unreachable.length) parts.push(t('overview.flow.unreachable', { n: a.unreachable.length }, a.unreachable.length))
  if (a.deadEnds.length) parts.push(t('overview.flow.deadEnds', { n: a.deadEnds.length }, a.deadEnds.length))
  if (a.brokenLinks.length) parts.push(t('overview.flow.broken', { n: a.brokenLinks.length }, a.brokenLinks.length))
  if (!a.endings.length) parts.push(t('overview.flow.noEnding'))
  return parts.length
    ? { ok: false, text: t('overview.flow.problems', { list: parts.join(', ') }) }
    : { ok: true, text: t('overview.flow.clean', { n: a.endings.length }, a.endings.length) }
})
</script>

<template>
  <DPage :title="term('overview')">
    <div class="flex flex-col gap-10">
      <!-- The title of the work, in the author's voice. -->
      <header>
        <h1 class="voice-author text-2xl leading-tight font-semibold tracking-tight text-balance text-highlighted lg:text-4xl">
          {{ store.project?.title }}
        </h1>
        <p v-if="store.project?.subtitle" class="voice-author mt-1 text-lg text-muted italic">{{ store.project.subtitle }}</p>
        <p class="mt-2 text-sm text-muted">
          {{ label('projectKind', store.kind) }} · {{ words(store.totalWords) }} · {{ scenes(store.rows.scenes.length) }}
        </p>
      </header>

      <!-- A copy of a demo says so, with the way out (spec 5.1). -->
      <div v-if="store.project?.settings.demo" class="flex max-w-3xl flex-col gap-3 rounded-[calc(var(--ui-radius)*2)] bg-muted px-4 py-3 text-sm text-toned sm:flex-row sm:items-center">
        <p class="flex flex-1 items-start gap-3 text-pretty">
          <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0 text-muted" />
          {{ t('overview.demo.text') }}
        </p>
        <div class="flex shrink-0 items-center gap-1 ps-7 sm:ps-0">
          <UButton
            :label="t('overview.demo.delete')"
            icon="i-lucide-archive"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="deletingDemo"
            class="max-lg:min-h-11"
            @click="deleteDemo"
          />
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('overview.demo.dismiss')"
            class="justify-center max-lg:min-h-11 max-lg:min-w-11"
            @click="dismissDemo"
          />
        </div>
      </div>

      <p v-if="structureLine" class="-mt-4 flex max-w-prose items-start gap-2 text-sm text-pretty text-toned">
        <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-primary" />
        {{ structureLine }}
      </p>

      <p v-if="isEmpty" class="max-w-prose text-pretty text-toned">{{ t('overview.empty') }}</p>

      <template v-for="block in blocks" :key="block">
        <div v-if="block === 'path'">
          <OverviewPath
            v-if="path"
            :path="path"
            :folded="!guidance"
            :solid="!resume && desktop"
            @hide="hidePath"
            @show="setGuidance(true)"
          />
          <p v-else-if="pathError" class="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {{ t('overview.path.loadError') }}
            <UButton :label="t('common.actions.retry')" color="primary" variant="link" size="sm" class="px-0 underline underline-offset-3 max-lg:min-h-11" @click="refreshPath()" />
          </p>
          <div v-else-if="guidance" class="space-y-3" aria-hidden="true">
            <USkeleton class="h-6 w-full max-w-3xl" />
            <USkeleton class="h-4 w-64" />
          </div>
        </div>

        <div v-else class="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-10">
          <OverviewResume v-if="resume" :scene="resume" :fresh="!lastEdited" />

          <section class="space-y-4" :aria-label="t('overview.today')">
            <template v-if="!statsError">
              <GoalsToday :stats="stats" />
              <GoalsTrend :stats="stats" variant="line" />
            </template>
            <NuxtLink :to="`${base}/goals`" class="inline-flex min-h-11 items-center gap-1 text-sm text-primary underline underline-offset-3 lg:min-h-0">
              {{ hasGoals ? t('overview.goals.open') : t('overview.goals.set') }}
            </NuxtLink>
          </section>
        </div>
      </template>

      <NuxtLink
        v-if="flowLine"
        :to="`${base}/flow?view=checks`"
        class="flex min-h-11 items-center gap-2 self-start text-sm"
        :class="flowLine.ok ? 'text-muted hover:text-highlighted' : 'text-warning'"
      >
        <UIcon :name="flowLine.ok ? 'i-lucide-split' : 'i-lucide-triangle-alert'" class="size-4 shrink-0" />
        <span>{{ flowLine.text }}</span>
      </NuxtLink>

      <OverviewRecent />
    </div>
  </DPage>
</template>
