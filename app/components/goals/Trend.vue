<script setup lang="ts">
import type { WritingStats } from '#shared/types/entities'

/**
 * The pace (spec 4.2 "trend"): the average of the last 14 writing days, the projected finish at the
 * current pace, the daily words the deadline asks for. `line` is the overview's one sentence about
 * the deadline ("Mancano 42 giorni alla scadenza. Al ritmo attuale finisci il 3 febbraio.").
 *
 * The projection uses the net growth (written minus removed) per calendar day over the span of the
 * last 14 writing days, so rest days and cuts count: it says when the work reaches its length.
 */
const props = withDefaults(defineProps<{
  stats: WritingStats | null | undefined
  variant?: 'line' | 'full'
}>(), { variant: 'full' })

const store = useProjectStore()
const { t } = useI18n()
const { number, words, date } = useFormat()

const DAY = 86_400_000
const toTime = (day: string) => Date.parse(`${day}T12:00:00Z`)
const between = (later: string, earlier: string) => Math.round((toTime(later) - toTime(earlier)) / DAY)
const shift = (day: string, n: number) => new Date(toTime(day) + n * DAY).toISOString().slice(0, 10)

const today = computed(() => props.stats?.today ?? localDay())
/** "3 febbraio", or "3 febbraio 2027" when the year is not this one. */
function dayText(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return date(new Date(y!, m! - 1, d!), { day: 'numeric', month: 'long', year: day.slice(0, 4) === today.value.slice(0, 4) ? undefined : 'numeric' })
}

const goal = computed(() => store.project?.wordGoal || null)
const deadline = computed(() => store.project?.deadline || null)
const total = computed(() => store.totalWords)

const writingDays = computed(() => (props.stats?.days ?? []).filter(d => d.added > 0 && d.day <= today.value).slice(-14))
const average = computed(() => writingDays.value.length
  ? Math.round(writingDays.value.reduce((n, d) => n + d.added, 0) / writingDays.value.length)
  : 0)
const pace = computed(() => {
  const from = writingDays.value[0]?.day
  if (!from || writingDays.value.length < 3) return null
  const net = (props.stats?.days ?? []).filter(d => d.day >= from && d.day <= today.value).reduce((n, d) => n + d.added - d.removed, 0)
  return net / (between(today.value, from) + 1)
})
const remaining = computed(() => (goal.value ? goal.value - total.value : null))
const finish = computed(() => {
  if (remaining.value === null || remaining.value <= 0 || !pace.value || pace.value <= 0) return null
  const days = Math.ceil(remaining.value / pace.value)
  // A finish a century away is no estimate.
  return days <= 36_500 ? shift(today.value, days) : null
})
const daysLeft = computed(() => (deadline.value ? between(deadline.value, today.value) : null))
const needed = computed(() => (remaining.value !== null && remaining.value > 0 && daysLeft.value !== null && daysLeft.value >= 0
  ? Math.ceil(remaining.value / (daysLeft.value + 1))
  : null))

/** The deadline as the overview says it. */
const deadlineText = computed(() => {
  if (daysLeft.value === null) return ''
  if (daysLeft.value > 0) return t('goals.trend.daysLeft', { n: number(daysLeft.value) }, daysLeft.value)
  if (daysLeft.value === 0) return t('goals.trend.dueToday')
  return t('goals.trend.overdue', { date: dayText(deadline.value!) })
})
const finishText = computed(() => {
  if (remaining.value === null) return ''
  if (remaining.value <= 0) return t('goals.trend.reached', { goal: number(goal.value!) })
  if (finish.value) return t(deadline.value && finish.value > deadline.value ? 'goals.trend.finishLate' : 'goals.trend.finish', { date: dayText(finish.value) })
  return pace.value === null ? t('goals.trend.tooEarly') : t('goals.trend.notGrowing')
})
</script>

<template>
  <p v-if="variant === 'line' && deadlineText" class="goals-trend text-pretty text-default">
    {{ deadlineText }} <span v-if="stats && finishText" class="text-toned">{{ finishText }}</span>
  </p>

  <div v-else-if="variant === 'full'" class="goals-trend space-y-2 text-pretty">
    <p class="text-default">
      <template v-if="!writingDays.length">{{ t('goals.trend.noData') }}</template>
      <template v-else-if="writingDays.length >= 14">{{ t('goals.trend.average', { words: words(average) }) }}</template>
      <template v-else>{{ t('goals.trend.averageFew', { n: number(writingDays.length), words: words(average) }, writingDays.length) }}</template>
    </p>
    <p v-if="goal" class="text-default">
      <template v-if="remaining! <= 0">{{ t('goals.trend.reachedFull', { total: number(total), goal: number(goal) }) }}</template>
      <template v-else-if="finish">{{ t(deadline && finish > deadline ? 'goals.trend.finishFullLate' : 'goals.trend.finishFull', { pace: number(Math.round(pace!)), goal: number(goal), date: dayText(finish) }) }}</template>
      <template v-else-if="pace === null">{{ t('goals.trend.tooEarly') }}</template>
      <template v-else>{{ t('goals.trend.notGrowing') }}</template>
    </p>
    <p v-else class="text-muted">{{ t('goals.trend.noGoal') }}</p>
    <p v-if="deadline && goal" class="text-default">
      <template v-if="needed">{{ t('goals.trend.needed', { date: dayText(deadline), words: words(needed) }) }}</template>
      <template v-else-if="daysLeft! < 0 && remaining! > 0">{{ t('goals.trend.overdue', { date: dayText(deadline) }) }}</template>
    </p>
    <p v-else-if="deadline" class="text-default">{{ deadlineText }}</p>
  </div>
</template>
