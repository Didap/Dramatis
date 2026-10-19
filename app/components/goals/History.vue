<script setup lang="ts">
import type { WritingStats } from '#shared/types/entities'

/**
 * The words of the last 30 or 90 days (spec 4.2, 7.23): written per day, removed as a separate
 * number. Bars are rows with a thin rule over the dotted leader, numbers always visible, runs of
 * days without writing folded into one line; the table lists every day with the total at its end.
 */
const props = defineProps<{
  stats: WritingStats | null | undefined
  span: 30 | 90
  view: 'bars' | 'table'
}>()

const store = useProjectStore()
const { t } = useI18n()
const { number, words, date } = useFormat()

const DAY = 86_400_000
const toTime = (day: string) => Date.parse(`${day}T12:00:00Z`)
const shift = (day: string, n: number) => new Date(toTime(day) + n * DAY).toISOString().slice(0, 10)
const asDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

interface Day { day: string, added: number, removed: number, total: number | null }

const today = computed(() => props.stats?.today ?? localDay())
/** Every day of the span, newest first; days without saves are zero. */
const days = computed<Day[]>(() => {
  const byDay = new Map((props.stats?.days ?? []).map(d => [d.day, d]))
  return Array.from({ length: props.span }, (_, i) => {
    const day = shift(today.value, -i)
    const row = byDay.get(day)
    return { day, added: row?.added ?? 0, removed: row?.removed ?? 0, total: row?.total ?? null }
  })
})

type Row = { kind: 'day', key: string, day: Day } | { kind: 'rest', key: string, from: string, to: string, count: number }
/** Bars: writing days one by one, quiet stretches folded into one row. */
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  for (const day of days.value) {
    const last = out.at(-1)
    if (!day.added && !day.removed) {
      if (last?.kind === 'rest') {
        last.from = day.day
        last.count++
      }
      else out.push({ kind: 'rest', key: day.day, from: day.day, to: day.day, count: 1 })
    }
    else out.push({ kind: 'day', key: day.day, day })
  }
  return out
})

const daily = computed(() => store.project?.dailyWordGoal || 0)
const scale = computed(() => Math.max(daily.value, ...days.value.map(d => d.added), 1))
const width = (value: number) => `${(value / scale.value) * 100}%`
const goalAt = computed(() => (daily.value ? `${(daily.value / scale.value) * 100}%` : null))

const written = computed(() => days.value.reduce((n, d) => n + d.added, 0))
const removed = computed(() => days.value.reduce((n, d) => n + d.removed, 0))
const writingDays = computed(() => days.value.filter(d => d.added > 0).length)

function dayLabel(day: string) {
  if (day === today.value) return t('common.time.today')
  if (day === shift(today.value, -1)) return t('common.time.yesterday')
  return date(asDate(day), { weekday: 'short', day: 'numeric', month: 'short' })
}
function restLabel(row: Extract<Row, { kind: 'rest' }>) {
  const long = { day: 'numeric', month: 'long' } as const
  return row.count === 1
    ? t('goals.history.restDay', { day: dayLabel(row.from) })
    : t('goals.history.restDays', { from: date(asDate(row.from), long), to: date(asDate(row.to), long) })
}
</script>

<template>
  <div class="goals-history">
    <p v-if="!stats" class="text-sm text-muted">{{ t('goals.today.loading') }}</p>
    <p v-else-if="!written && !removed" class="max-w-prose text-pretty text-muted">{{ t('goals.history.empty') }}</p>

    <template v-else>
      <p class="mb-4 text-pretty text-default">
        {{ t('goals.history.summary', { span: number(span), written: words(written), removed: number(removed), days: t('common.units.days', { n: number(writingDays) }, writingDays) }) }}
      </p>

      <p v-if="view === 'bars' && goalAt" class="-mt-2 mb-4 flex items-center gap-2 text-xs text-muted">
        <span class="inline-block h-3 w-px bg-(--ui-border-accented)" aria-hidden="true" />
        {{ t('goals.history.goalMark', { n: number(daily) }) }}
      </p>
      <ul v-if="view === 'bars'" class="space-y-0.5">
        <li v-for="row in rows" :key="row.key">
          <div v-if="row.kind === 'day'" class="grid min-h-8 grid-cols-[5.25rem_minmax(0,1fr)_4.25rem] items-center gap-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_4.5rem_4.5rem]">
            <span class="truncate" :class="row.day.day === today ? 'font-medium text-highlighted' : 'text-muted'">{{ dayLabel(row.day.day) }}</span>
            <span class="relative h-1" aria-hidden="true">
              <span class="leader absolute inset-0 min-w-0" />
              <span class="absolute inset-y-0 left-0 rounded-[1px] bg-primary" :style="{ width: width(row.day.added) }" />
              <span v-if="goalAt" class="absolute -top-1 h-3 w-px bg-(--ui-border-accented)" :style="{ left: goalAt }" />
            </span>
            <span class="text-right text-default">{{ number(row.day.added) }}</span>
            <span class="col-start-3 -mt-1 text-right text-xs text-muted sm:col-start-auto sm:mt-0 sm:text-sm">
              <template v-if="row.day.removed">{{ t('goals.history.removedShort', { n: number(row.day.removed) }) }}</template>
            </span>
          </div>
          <p v-else class="flex min-h-8 items-center text-sm text-dimmed">{{ restLabel(row) }}</p>
        </li>
      </ul>

      <div v-else class="-mx-1 overflow-x-auto">
        <table class="w-full min-w-[20rem] text-sm">
          <caption class="sr-only">{{ t('goals.history.caption', { span: number(span) }) }}</caption>
          <thead>
            <tr class="border-b border-default text-xs text-muted">
              <th scope="col" class="px-1 py-2 text-start font-medium">{{ t('goals.history.day') }}</th>
              <th scope="col" class="px-1 py-2 text-end font-medium">{{ t('goals.history.written') }}</th>
              <th scope="col" class="px-1 py-2 text-end font-medium">{{ t('goals.history.removed') }}</th>
              <th scope="col" class="px-1 py-2 text-end font-medium">{{ t('goals.history.total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="day in days" :key="day.day" class="border-b border-default/50" :class="day.added || day.removed ? 'text-default' : 'text-dimmed'">
              <th scope="row" class="px-1 py-1.5 text-start font-normal" :class="day.day === today ? 'font-medium text-highlighted' : ''">{{ dayLabel(day.day) }}</th>
              <td class="px-1 py-1.5 text-end">{{ number(day.added) }}</td>
              <td class="px-1 py-1.5 text-end">{{ number(day.removed) }}</td>
              <td class="px-1 py-1.5 text-end">{{ day.total === null ? '' : number(day.total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
