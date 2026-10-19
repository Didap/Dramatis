<script setup lang="ts">
/**
 * A section of the character interview as a specimen: the questions in the house's voice,
 * the answers in the author's, each answer field resting on a dotted baseline.
 */
const { t } = useI18n()

const answers = computed(() => [
  { question: t('profile.sections.conflict.questions.want.label'), answer: t('landing.specimen.interview.answer1') },
  { question: t('profile.sections.conflict.questions.why_now.label'), answer: t('landing.specimen.interview.answer2') },
  { question: t('profile.sections.conflict.questions.need.label'), answer: '' },
])
</script>

<template>
  <LandingSpecimen :caption="t('landing.specimen.interview.caption')">
    <div class="flex items-center gap-3 border-b border-default px-4 py-3 sm:px-6">
      <DEntityAvatar :name="t('landing.specimen.interview.name')" color="plum" size="md" />
      <div class="min-w-0">
        <p class="font-serif text-lg/snug font-semibold text-highlighted">{{ t('landing.specimen.interview.name') }}</p>
        <p class="font-serif text-sm/snug italic text-muted text-pretty">{{ t('landing.specimen.interview.tagline') }}</p>
      </div>
    </div>
    <div class="px-4 pt-4 pb-6 sm:px-6">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p class="flex items-baseline gap-2">
          <span class="text-base font-semibold text-highlighted">{{ t('profile.sections.conflict.title') }}</span>
          <span class="text-xs text-muted tabular">{{ t('landing.specimen.interview.progress') }}</span>
        </p>
        <span class="inline-flex rounded-[calc(var(--ui-radius)*1.5)] bg-muted p-0.5 text-xs">
          <span class="rounded-[var(--ui-radius)] bg-default px-2 py-1 font-medium text-highlighted ring ring-default">{{ t('landing.specimen.interview.interview') }}</span>
          <span class="px-2 py-1 text-muted">{{ t('landing.specimen.interview.free') }}</span>
        </span>
      </div>
      <dl class="mt-4 space-y-4">
        <div v-for="item in answers" :key="item.question">
          <dt class="text-sm font-medium text-highlighted">{{ item.question }}</dt>
          <dd
            class="mt-1.5 border-b border-dotted border-accented pb-1.5 font-serif text-[0.9375rem]/[1.55]"
            :class="item.answer ? 'text-default' : 'text-dimmed'"
          >
            {{ item.answer || t('landing.specimen.interview.placeholder') }}
          </dd>
        </div>
      </dl>
    </div>
  </LandingSpecimen>
</template>
