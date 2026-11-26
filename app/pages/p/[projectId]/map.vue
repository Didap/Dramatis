<script setup lang="ts">
/**
 * A game's world map (VRS-683, the Metroidvania "Planimetria"): the whole map as the player sees it
 * once every place is open, with a pin for each place and collectible.
 */
const { t } = useI18n()
const { term } = useTerms()
</script>

<template>
  <DPage :title="term('placeMap')">
    <DPageHeader :title="term('placeMap')">
      <template #description>
        <p class="max-w-prose text-pretty text-muted">{{ t('locations.map.planIntro') }}</p>
      </template>
    </DPageHeader>
    <LocationsMaps />
  </DPage>
</template>
