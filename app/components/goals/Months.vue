<script setup lang="ts">
import type { WritingStats } from '#shared/types/entities'

/** Monthly averages (spec 4.2): month, writing days, words written, average per writing day. */
const props = defineProps<{ stats: WritingStats | null | undefined }>()

const { t } = useI18n()
const { number, date } = useFormat()

const months = computed(() => {
  const byMonth = new Map<string, { days: number, written: number }>()
  for (const day of props.stats?.days ?? []) {
    if (!day.added) continue
    const key = day.day.slice(0, 7)
    const month = byMonth.get(key) ?? { days: 0, written: 0 }
    month.days++
    month.written += day.added
    byMonth.set(key, month)
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, month]) => {
      const [y, m] = key.split('-').map(Number)
      return { key, label: date(new Date(y!, m! - 1, 1), { month: 'long', year: 'numeric' }), ...month, average: Math.round(month.written / month.days) }
    })
})
</script>

<template>
  <div class="goals-months">
    <p v-if="!months.length" class="text-sm text-muted">{{ t('goals.months.empty') }}</p>
    <div v-else class="-mx-1 overflow-x-auto">
      <table class="w-full min-w-[20rem] text-sm">
        <caption class="sr-only">{{ t('goals.months.caption') }}</caption>
        <thead>
          <tr class="border-b border-default text-xs text-muted">
            <th scope="col" class="px-1 py-2 text-start font-medium">{{ t('goals.months.month') }}</th>
            <th scope="col" class="px-1 py-2 text-end font-medium">{{ t('goals.months.days') }}</th>
            <th scope="col" class="px-1 py-2 text-end font-medium">{{ t('goals.months.written') }}</th>
            <th scope="col" class="px-1 py-2 text-end font-medium">{{ t('goals.months.average') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="month in months" :key="month.key" class="border-b border-default/50 text-default">
            <th scope="row" class="px-1 py-1.5 text-start font-normal first-letter:uppercase">{{ month.label }}</th>
            <td class="px-1 py-1.5 text-end">{{ number(month.days) }}</td>
            <td class="px-1 py-1.5 text-end">{{ number(month.written) }}</td>
            <td class="px-1 py-1.5 text-end">{{ number(month.average) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
