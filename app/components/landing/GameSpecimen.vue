<script setup lang="ts">
/**
 * A scene of the example game in the editor: a stage direction, dialogue lines (speaker in tracked
 * capitals, direction in italic, line id in the margin) and the player's choices with their effects.
 */
const { t } = useI18n()

const lines = computed(() => [
  { id: 'S005-L001', speaker: t('landing.specimen.game.tullia'), direction: t('landing.specimen.game.line1Direction'), text: t('landing.specimen.game.line1') },
  { id: 'S005-L002', speaker: t('landing.specimen.game.mira'), direction: '', text: t('landing.specimen.game.line2') },
  { id: 'S005-L003', speaker: t('landing.specimen.game.tullia'), direction: '', text: t('landing.specimen.game.line3') },
])
const choices = computed(() => [
  // Variable names in the interface language, as the templates create them (spec appendix B).
  { text: t('landing.specimen.game.choice1'), effect: t('landing.specimen.game.effect') },
  { text: t('landing.specimen.game.choice2'), effect: '' },
])
</script>

<template>
  <LandingEditorFrame
    :caption="t('landing.specimen.game.caption')"
    :chapter="t('landing.specimen.game.chapter')"
    :position="t('landing.specimen.game.position')"
    :title="t('landing.specimen.game.title')"
    :count="t('landing.specimen.game.lines')"
    :today="1240"
  >
    <p>{{ t('landing.specimen.game.action') }}</p>
    <div class="mt-3 space-y-1">
      <div v-for="line in lines" :key="line.id" class="flex items-baseline gap-4">
        <p class="min-w-0 flex-1 ps-[2em] -indent-[2em]">
          <span class="me-[0.5em] text-[0.8125em] font-semibold tracking-[0.08em] text-toned uppercase">{{ line.speaker }}</span>
          <span v-if="line.direction" class="me-[0.4em] italic text-muted">({{ line.direction }})</span>
          {{ line.text }}
        </p>
        <span class="hidden shrink-0 font-mono text-[0.6875rem] text-dimmed sm:inline">{{ line.id }}</span>
      </div>
    </div>
    <div class="mt-5 border-t border-default pt-3 font-sans">
      <p class="text-xs font-medium text-muted">{{ t('landing.specimen.game.choices') }}</p>
      <ul class="mt-1.5 space-y-1.5">
        <li v-for="choice in choices" :key="choice.text" class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <UIcon name="i-lucide-corner-down-right" class="size-3.5 shrink-0 text-dimmed" />
          <span class="font-serif text-[0.9375rem] italic text-default">{{ choice.text }}</span>
          <span v-if="choice.effect" class="inline-flex h-6 items-center rounded-[calc(var(--ui-radius)*1.5)] bg-elevated px-1.5 font-mono text-xs text-toned">{{ choice.effect }}</span>
        </li>
      </ul>
    </div>
  </LandingEditorFrame>
</template>
