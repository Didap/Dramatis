<script setup lang="ts">
import type { ObjectCategory } from '#shared/types/domain'
import { useCreating } from '~/components/world/CreateRow.vue'
import { useWorldIntro } from '~/components/world/Intro.vue'

/**
 * A list page of objects: every object, or in a game with a bestiary (VRS-683) those of one category
 * (equipment, abilities, collectibles, the others). `?new=1` opens the inline creation.
 */
const props = defineProps<{ category?: ObjectCategory }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const shelf = computed(() => OBJECT_SHELVES[props.category ?? 'object'])
const mt = (key: string) => t(`${objectCopy(props.category, store.kind)}.${key}`)
const count = computed(() => store.objectsOf(props.category).length)
const desktop = useIsDesktop()
const creating = useCreating()
const { visible: introVisible } = useWorldIntro(shelf.value)
</script>

<template>
  <DPage :title="term(shelf)">
    <DPageHeader :title="term(shelf)">
      <template v-if="introVisible && count" #description>
        <WorldIntro :topic="shelf" :text="mt('intro')" />
      </template>
      <template v-if="count" #actions>
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
    <ObjectsList v-model:creating="creating" :category="props.category" />
  </DPage>
</template>
