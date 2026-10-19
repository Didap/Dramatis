<script setup lang="ts">
import type { WritingStats } from '#shared/types/entities'

/**
 * Today and the whole work as sentences over a thin rule (DESIGN.md "Charts"):
 * "Oggi 1.240 parole su 1.000. In tutto 38.420 su 80.000." Never a big-number tile.
 */
defineProps<{
  stats: WritingStats | null | undefined
}>()

const store = useProjectStore()
const { t } = useI18n()
const { number, words } = useFormat()

const daily = computed(() => store.project?.dailyWordGoal || null)
const goal = computed(() => store.project?.wordGoal || null)
const total = computed(() => store.totalWords)
const fill = (value: number, target: number | null) => (target ? `${Math.min(100, (value / target) * 100)}%` : '0%')
</script>

<template>
  <div class="goals-today space-y-4">
    <div>
      <p class="text-pretty text-default">
        <template v-if="!stats">{{ t('goals.today.loading') }}</template>
        <template v-else-if="stats.todayAdded && daily">{{ t('goals.today.withGoal', { words: words(stats.todayAdded), goal: number(daily) }) }}</template>
        <template v-else-if="stats.todayAdded">{{ t('goals.today.noGoal', { words: words(stats.todayAdded) }) }}</template>
        <template v-else-if="daily">{{ t('goals.today.noneWithGoal', { goal: number(daily) }) }}</template>
        <template v-else>{{ t('goals.today.none') }}</template>
        <span v-if="stats?.todayRemoved" class="text-muted"> {{ t('goals.today.removed', { n: number(stats.todayRemoved) }, stats.todayRemoved) }}</span>
      </p>
      <div v-if="daily" class="mt-2 h-0.5 w-full max-w-sm overflow-hidden rounded-full bg-accented" aria-hidden="true">
        <div class="h-full rounded-full bg-primary transition-[width] duration-200" :style="{ width: fill(stats?.todayAdded ?? 0, daily) }" />
      </div>
    </div>
    <div>
      <p class="text-pretty text-default">
        <template v-if="goal && total >= goal">{{ t('goals.total.reached', { total: number(total), goal: number(goal) }) }}</template>
        <template v-else-if="goal">{{ t('goals.total.withGoal', { total: number(total), goal: number(goal) }) }}</template>
        <template v-else>{{ t('goals.total.noGoal', { words: words(total) }) }}</template>
      </p>
      <div v-if="goal" class="mt-2 h-0.5 w-full max-w-sm overflow-hidden rounded-full bg-accented" aria-hidden="true">
        <div class="h-full rounded-full bg-primary transition-[width] duration-200" :style="{ width: fill(total, goal) }" />
      </div>
    </div>
  </div>
</template>
