<script setup lang="ts">
import type { Character } from '#shared/types/entities'

/**
 * A boss or an enemy in its list (VRS-683): its picture, name, epithet, the scenes it appears in and
 * its planning status. In the side column of a sheet, the name over the epithet and the status.
 */
const props = withDefaults(defineProps<{
  character: Character
  compact?: boolean
  active?: boolean
}>(), { compact: false, active: false })

const store = useProjectStore()
const { scenes } = useFormat()
const to = computed(() => store.refPath({ type: 'character', id: props.character.id }))
</script>

<template>
  <WorldSideRow v-if="props.compact" :to="to" :name="character.name" :status="character.status" :detail="character.tagline" :active="props.active">
    <template #leading>
      <DEntityAvatar :name="character.name" :image-id="store.primaryImage('character', character.id)" :color="character.color || null" icon="i-lucide-skull" size="sm" alt="" />
    </template>
  </WorldSideRow>
  <DRow v-else :to="to" :name="character.name" :epithet="character.tagline || undefined">
    <template #leading>
      <DEntityAvatar :name="character.name" :image-id="store.primaryImage('character', character.id)" :color="character.color || null" icon="i-lucide-skull" size="sm" alt="" />
    </template>
    <template #numbers>
      <span class="whitespace-nowrap">{{ scenes(store.characterScenes.get(character.id) ?? 0) }}</span>
      <DStatusBadge :value="character.status" kind="planning" />
    </template>
  </DRow>
</template>
