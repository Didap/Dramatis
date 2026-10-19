<script setup lang="ts">
import type { Character } from '#shared/types/entities'

/** Qualities, flaws and contradictions (spec 7.5): three short ordered lists, for every importance. */
defineProps<{ character: Character }>()
const { t } = useI18n()
const FIELDS = ['qualities', 'flaws', 'contradictions'] as const
</script>

<template>
  <CharactersSection :title="t('characters.traits.title')">
    <div class="grid gap-x-6 gap-y-6 sm:grid-cols-3">
      <CharactersTraitList v-for="field in FIELDS" :key="field" :character="character" :field="field" />
    </div>
  </CharactersSection>
</template>
