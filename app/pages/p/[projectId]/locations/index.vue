<script setup lang="ts">
import { useCreating } from '~/components/world/CreateRow.vue'
import { useWorldIntro } from '~/components/world/Intro.vue'

/** Locations: the list, grouped by nation and region when they span several. `?new=1` opens the inline creation. */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const mt = (key: string) => t(`locations.${store.kind}.${key}`)
const desktop = useIsDesktop()
const creating = useCreating()
const { visible: introVisible } = useWorldIntro('locations')
</script>

<template>
  <DPage :title="term('locations')">
    <DPageHeader :title="term('locations')">
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
    <LocationsList v-model:creating="creating" />
  </DPage>
</template>
