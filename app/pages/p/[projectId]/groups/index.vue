<script setup lang="ts">
import { useCreating } from '~/components/world/CreateRow.vue'
import { useWorldIntro } from '~/components/world/Intro.vue'

/** Groups (factions, in games): the list. `?new=1` opens the inline creation. */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const mt = (key: string) => t(`groups.${store.kind}.${key}`)
const desktop = useIsDesktop()
const creating = useCreating()
const { visible: introVisible } = useWorldIntro('groups')
/** The races have their own page (module races). */
const groups = computed(() => store.rows.groups.filter(group => !store.isRace(group.id)))
</script>

<template>
  <DPage :title="term('groups')">
    <DPageHeader :title="term('groups')">
      <template v-if="introVisible && groups.length" #description>
        <WorldIntro topic="groups" :text="mt('intro')" />
      </template>
      <template v-if="groups.length" #actions>
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
    <GroupsList v-model:creating="creating" />
  </DPage>
</template>
