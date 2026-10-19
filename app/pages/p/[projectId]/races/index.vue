<script setup lang="ts">
import { useCreating } from '~/components/world/CreateRow.vue'
import { useWorldIntro } from '~/components/world/Intro.vue'

/**
 * The races of the world (module races): groups of kind race, on a page of their own, with the
 * characters of each. `?new=1` opens the inline creation. With the module off, back to the groups.
 */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const desktop = useIsDesktop()
const creating = useCreating()
const { visible: introVisible } = useWorldIntro('races')
const races = computed(() => store.rows.groups.filter(group => store.isRace(group.id)))

watchEffect(() => {
  if (store.project && !store.modules.races) void navigateTo(`/p/${store.projectId}/groups`, { replace: true })
})
</script>

<template>
  <DPage :title="term('races')">
    <DPageHeader :title="term('races')">
      <template v-if="introVisible && races.length" #description>
        <WorldIntro topic="races" :text="t('groups.race.intro')" />
      </template>
      <template v-if="races.length" #actions>
        <UButton
          :color="desktop ? 'primary' : 'neutral'"
          :variant="desktop ? 'solid' : 'outline'"
          icon="i-lucide-plus"
          :label="t('groups.race.add')"
          class="max-lg:min-h-11"
          data-world-create
          @click="creating = true"
        />
      </template>
    </DPageHeader>
    <GroupsList v-model:creating="creating" races />
  </DPage>
</template>
