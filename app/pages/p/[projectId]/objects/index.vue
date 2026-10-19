<script setup lang="ts">
import { useCreating } from '~/components/world/CreateRow.vue'
import { useWorldIntro } from '~/components/world/Intro.vue'

/** Objects (items, in English games): the list. `?new=1` opens the inline creation. */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const mt = (key: string) => t(`objects.${store.kind}.${key}`)
const desktop = useIsDesktop()
const creating = useCreating()
const { visible: introVisible } = useWorldIntro('objects')
</script>

<template>
  <DPage :title="term('objects')">
    <DPageHeader :title="term('objects')">
      <template v-if="introVisible && store.rows.objects.length" #description>
        <WorldIntro topic="objects" :text="mt('intro')" />
      </template>
      <template v-if="store.rows.objects.length" #actions>
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
    <ObjectsList v-model:creating="creating" />
  </DPage>
</template>
