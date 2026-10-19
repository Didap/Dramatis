<script setup lang="ts">
/**
 * The A-to-Z path of a video game as a specimen (DESIGN.md "The A-to-Z path"): the steps joined by the
 * leader, solid where done; the current step with the accent dot; the steps ahead muted and dotted.
 * One line of short names on wide screens, the full names in a list below. The words are the
 * overview's own, so the picture says what the app says.
 */
const { t } = useI18n()

const KEYS = ['premise', 'protagonist', 'world', 'quests', 'structure', 'draft', 'revision', 'delivery'] as const
const CURRENT = 5
const stage = (key: string, field: 'label' | 'short' | 'question') => t(`overview.path.stages.game.${key}.${field}`)

const steps = computed(() => KEYS.map((key, index) => ({
  key,
  label: stage(key, 'label'),
  short: stage(key, 'short'),
  state: index < CURRENT ? 'done' : index === CURRENT ? 'current' : 'ahead',
})))
const current = computed(() => steps.value[CURRENT]!)
</script>

<template>
  <LandingSpecimen :caption="t('landing.specimen.path.caption')">
    <div class="px-4 py-5 sm:px-6">
      <ol class="hidden items-baseline gap-2 lg:flex">
        <li v-for="(step, index) in steps" :key="step.key" class="flex items-baseline gap-2" :class="index < steps.length - 1 ? 'flex-auto' : ''">
          <span class="flex shrink-0 items-baseline gap-1.5 text-sm whitespace-nowrap" :class="step.state === 'current' ? 'font-medium text-highlighted' : step.state === 'done' ? 'text-default' : 'text-muted'">
            <UIcon v-if="step.state === 'done'" name="i-lucide-check" class="size-3.5 self-center text-toned" />
            <span v-else-if="step.state === 'current'" class="size-2 self-center rounded-full bg-primary" />
            {{ step.short }}
          </span>
          <DLeader v-if="index < steps.length - 1" :done="step.state === 'done'" />
        </li>
      </ol>

      <ol class="space-y-2.5 lg:hidden">
        <li v-for="step in steps" :key="step.key" class="flex items-center gap-2.5 text-sm" :class="step.state === 'current' ? 'font-medium text-highlighted' : step.state === 'done' ? 'text-default' : 'text-muted'">
          <span class="grid size-4 shrink-0 place-items-center">
            <UIcon v-if="step.state === 'done'" name="i-lucide-check" class="size-3.5 text-toned" />
            <span v-else-if="step.state === 'current'" class="size-2 rounded-full bg-primary" />
            <span v-else class="size-1.5 rounded-full border border-accented" />
          </span>
          {{ step.label }}
        </li>
      </ol>

      <div class="mt-5 border-t border-default pt-4">
        <p class="text-sm text-default">
          <span class="font-medium text-highlighted">{{ current.label }}.</span>
          {{ stage(current.key, 'question') }}
        </p>
        <p class="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-unlink" class="size-3.5 shrink-0 text-warning" />
          {{ t('overview.path.reasons.unreachable', { n: 1 }, 1) }}
        </p>
      </div>
    </div>
  </LandingSpecimen>
</template>
