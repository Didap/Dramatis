<script setup lang="ts">
import { useCreating } from '~/components/world/CreateRow.vue'
import { useWorldIntro } from '~/components/world/Intro.vue'

/**
 * Maps and places (VRS-598): the author's maps above, each a picture with a pin for a place, and the
 * list of places below, grouped by nation and region when they span several. `?map=<id>` shows that
 * map, `?new=1` opens the inline creation of a place. A genre with a map page of its own (VRS-683,
 * the Metroidvania "Planimetria") keeps only the places here.
 */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const mt = (key: string) => t(`locations.${store.kind}.${key}`)
const desktop = useIsDesktop()
const creating = useCreating()
const { visible: introVisible } = useWorldIntro('locations')
const ownMapPage = computed(() => !!store.genre?.mapPage)
</script>

<template>
  <DPage :title="term('placesSection')">
    <DPageHeader :title="term('placesSection')">
      <template v-if="introVisible && store.rows.locations.length" #description>
        <WorldIntro topic="locations" :text="mt('intro')" />
      </template>
      <template v-if="store.rows.locations.length" #actions>
        <UButton
          :color="desktop ? 'primary' : 'neutral'"
          :variant="desktop ? 'solid' : 'outline'"
          icon="i-lucide-plus"
          :label="mt('add')"
          class="max-lg:min-h-11"
          data-world-create
          @click="creating = true"
        />
      </template>
    </DPageHeader>

    <LocationsMaps v-if="!ownMapPage" class="mb-10" />

    <LocationsList v-model:creating="creating" />
  </DPage>
</template>
