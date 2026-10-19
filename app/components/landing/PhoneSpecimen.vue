<script setup lang="ts">
/**
 * The phone as a specimen: the "Aggiungi" drawer (spec 1.4) risen over the page of the example game,
 * a quick note written in two taps, the other things to add below it, in the game's words.
 */
const { t } = useI18n()

const term = (key: string) => t(`common.vocab.game.${key}`, 1)
const adds = computed(() => [
  { icon: 'i-lucide-file-plus', label: term('scene') },
  { icon: SECTION_ICONS.characters, label: term('character') },
  { icon: SECTION_ICONS.locations, label: term('location') },
  { icon: SECTION_ICONS.groups, label: term('group') },
])
</script>

<template>
  <LandingSpecimen :caption="t('landing.specimen.phone.caption')" class="mx-auto w-full max-w-[18rem]">
    <div class="flex h-[28rem] flex-col bg-elevated">
      <div class="px-4 pt-5 opacity-50">
        <p class="font-serif text-lg font-semibold text-highlighted">{{ t('landing.specimen.phone.project') }}</p>
        <div class="mt-3 space-y-2">
          <span class="block h-2 w-4/5 rounded-full bg-accented" />
          <span class="block h-2 w-3/5 rounded-full bg-accented" />
          <span class="block h-2 w-2/3 rounded-full bg-accented" />
        </div>
      </div>
      <div class="mt-auto rounded-t-[calc(var(--ui-radius)*3)] bg-(--ui-bg-floating) px-4 pt-2 pb-4 shadow-(--shadow-floating)">
        <span class="mx-auto block h-1 w-10 rounded-full bg-accented" />
        <p class="mt-3 text-sm font-semibold text-highlighted">{{ t('common.nav.add') }}</p>
        <p class="mt-3 text-xs font-medium text-default">{{ t('common.capture.quickNote') }}</p>
        <p class="mt-1.5 rounded-[calc(var(--ui-radius)*1.5)] px-2.5 py-2 font-serif text-sm/snug text-default ring-2 ring-(--ui-primary) ring-inset">
          {{ t('landing.specimen.phone.note') }}<span class="ms-px inline-block h-[1.1em] w-[2px] translate-y-[0.2em] bg-primary" />
        </p>
        <p class="mt-2.5 grid h-9 place-items-center rounded-[calc(var(--ui-radius)*1.5)] bg-primary text-sm font-medium text-inverted">{{ t('common.capture.saveNote') }}</p>
        <div class="mt-2.5 grid grid-cols-2 gap-x-2">
          <span v-for="item in adds" :key="item.label" class="flex h-9 items-center gap-2 px-1 text-sm text-default">
            <UIcon :name="item.icon" class="size-4 text-toned" />
            {{ item.label }}
          </span>
        </div>
      </div>
    </div>
  </LandingSpecimen>
</template>
