<script setup lang="ts">
/**
 * The scene editor as a specimen (DESIGN.md "Scene editor"): the 3rem bar, the position line, the
 * title and the text at the measure, the colophon at the foot.
 */
const props = defineProps<{
  caption: string
  chapter: string
  position: string
  title: string
  /** The count in the colophon ("186 parole", "3 battute"). */
  count: string
  today: number
}>()

const { t } = useI18n()
const { number } = useFormat()
const colophon = computed(() => [t('landing.specimen.saved'), props.count, t('landing.specimen.today', { n: number(props.today) })])
</script>

<template>
  <LandingSpecimen :caption="caption">
    <div class="flex h-10 shrink-0 items-center gap-2 border-b border-default px-3 text-dimmed">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate text-xs text-muted">{{ chapter }}</span>
      <UIcon name="i-lucide-focus" class="size-4 shrink-0" />
      <UIcon name="i-lucide-panel-right" class="size-4 shrink-0" />
    </div>
    <div class="flex-1 px-5 pt-6 pb-7 sm:px-9 sm:pt-8">
      <div class="mx-auto max-w-[34rem]">
        <p class="position-line">{{ position }}</p>
        <p class="mt-2 font-serif text-[1.375rem]/tight font-semibold text-highlighted">{{ title }}</p>
        <div class="mt-4 font-serif text-[0.9375rem]/[1.6] text-default sm:text-base/[1.6]">
          <slot />
        </div>
      </div>
    </div>
    <div class="flex h-9 shrink-0 items-center gap-1.5 px-3 text-xs text-dimmed">
      <UIcon name="i-lucide-check" class="size-3.5 shrink-0" />
      <span class="truncate">{{ colophon.join(' · ') }}</span>
    </div>
  </LandingSpecimen>
</template>
