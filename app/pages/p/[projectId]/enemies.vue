<script setup lang="ts">
import { useCreating } from '~/components/world/CreateRow.vue'
import { useWorldIntro } from '~/components/world/Intro.vue'

/** A game's bosses and enemies (VRS-683): characters of those categories. `?new=1` opens the inline creation of an enemy. */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const desktop = useIsDesktop()
const creating = ref<'enemy' | 'boss' | null>(null)
const fromLink = useCreating()
watch(fromLink, (open) => {
  if (open) creating.value = 'enemy'
}, { immediate: true })
const { visible: introVisible } = useWorldIntro('enemies')
const count = computed(() => store.enemies.length)
</script>

<template>
  <DPage :title="term('enemies')">
    <DPageHeader :title="term('enemies')">
      <template v-if="introVisible && count" #description>
        <WorldIntro topic="enemies" :text="t('characters.enemies.intro')" />
      </template>
      <template v-if="count" #actions>
        <UButton
          :color="desktop ? 'primary' : 'neutral'"
          :variant="desktop ? 'solid' : 'outline'"
          icon="i-lucide-plus"
          :label="t('characters.enemies.addEnemy')"
          class="max-lg:min-h-11"
          data-world-create
          @click="creating = 'enemy'"
        />
      </template>
    </DPageHeader>
    <CharactersEnemies v-model:creating="creating" />
  </DPage>
</template>
