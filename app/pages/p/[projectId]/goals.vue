<script setup lang="ts">
import type { WritingStats } from '#shared/types/entities'

/**
 * Goals (spec 4.2): set a pace and see whether you keep it. Targets, progress against each, the
 * pace and the projected finish, the daily history (bars or table, 30 or 90 days), monthly averages.
 */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()

const { data: stats, error, refresh } = useLazyFetch<WritingStats>(() => `/api/projects/${store.projectId}/stats`, { query: { days: 365 } })

const hasGoals = computed(() => !!(store.project?.wordGoal || store.project?.dailyWordGoal || store.project?.deadline))

// The history's shape is remembered on this device; phones start with the table.
const span = ref<30 | 90>(30)
const view = ref<'bars' | 'table'>('bars')
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('dramatis:goals-history') ?? 'null') as { span?: 30 | 90, view?: 'bars' | 'table' } | null
    if (saved?.span === 30 || saved?.span === 90) span.value = saved.span
    if (saved?.view === 'bars' || saved?.view === 'table') view.value = saved.view
    else if (window.matchMedia('(max-width: 639px)').matches) view.value = 'table'
  }
  catch {}
})
watch([span, view], () => {
  try { localStorage.setItem('dramatis:goals-history', JSON.stringify({ span: span.value, view: view.value })) }
  catch {}
})

const views = computed(() => [
  { value: 'bars' as const, label: t('goals.history.bars'), icon: 'i-lucide-align-left' },
  { value: 'table' as const, label: t('goals.history.table'), icon: 'i-lucide-table-2' },
])
</script>

<template>
  <DPage :title="term('goals')">
    <DPageHeader :title="term('goals')" :description="t('goals.description')" />

    <p v-if="error && !stats" class="mb-8 flex flex-wrap items-center gap-x-2 text-sm text-muted" role="alert">
      <UIcon name="i-lucide-circle-alert" class="size-4 text-error" />
      {{ t('goals.loadError') }}
      <UButton :label="t('common.actions.retry')" color="primary" variant="link" size="sm" class="px-0 underline underline-offset-3 max-lg:min-h-11" @click="refresh()" />
    </p>

    <div class="space-y-12">
      <section aria-labelledby="goals-targets">
        <h2 id="goals-targets" class="mb-1 text-lg font-semibold text-highlighted">{{ t('goals.targets.title') }}</h2>
        <p v-if="!hasGoals" class="mb-4 max-w-prose text-pretty text-muted">{{ t('goals.empty') }}</p>
        <p v-else class="mb-4 max-w-prose text-pretty text-muted">{{ t('goals.targets.hint') }}</p>
        <GoalsTargets />
      </section>

      <section aria-labelledby="goals-progress">
        <h2 id="goals-progress" class="mb-3 text-lg font-semibold text-highlighted">{{ t('goals.progress.title') }}</h2>
        <div class="space-y-4">
          <GoalsToday :stats="stats" />
          <GoalsTrend v-if="store.project?.deadline" :stats="stats" variant="line" />
        </div>
      </section>

      <section aria-labelledby="goals-trend">
        <h2 id="goals-trend" class="mb-3 text-lg font-semibold text-highlighted">{{ t('goals.trend.title') }}</h2>
        <GoalsTrend :stats="stats" />
      </section>

      <section aria-labelledby="goals-history">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="goals-history" class="text-lg font-semibold text-highlighted">{{ t('goals.history.title') }}</h2>
          <div class="flex flex-wrap items-center gap-2">
            <UFieldGroup size="sm" :aria-label="t('goals.history.viewLabel')" role="group">
              <UButton
                v-for="option in views"
                :key="option.value"
                :icon="option.icon"
                :label="option.label"
                color="neutral"
                :variant="view === option.value ? 'subtle' : 'outline'"
                :aria-pressed="view === option.value"
                class="max-lg:min-h-11"
                @click="view = option.value"
              />
            </UFieldGroup>
            <UFieldGroup size="sm" :aria-label="t('goals.history.spanLabel')" role="group">
              <UButton
                v-for="days in [30, 90] as const"
                :key="days"
                :label="t('goals.history.days', { n: days })"
                color="neutral"
                :variant="span === days ? 'subtle' : 'outline'"
                :aria-pressed="span === days"
                class="max-lg:min-h-11"
                @click="span = days"
              />
            </UFieldGroup>
          </div>
        </div>
        <GoalsHistory :stats="stats" :span="span" :view="view" />
      </section>

      <section aria-labelledby="goals-months">
        <h2 id="goals-months" class="mb-3 text-lg font-semibold text-highlighted">{{ t('goals.months.title') }}</h2>
        <GoalsMonths :stats="stats" />
      </section>
    </div>
  </DPage>
</template>
