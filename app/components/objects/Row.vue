<script setup lang="ts">
import type { StoryObject } from '#shared/types/entities'

/**
 * An object (an item, in English games) in a list: its picture, name, kind, number of scenes where it
 * appears, planning status. In the side column of a sheet, the name over the kind and the status.
 */
const props = withDefaults(defineProps<{
  object: StoryObject
  scenes: number
  compact?: boolean
  active?: boolean
}>(), { compact: false, active: false })

const store = useProjectStore()
const { scenes: scenesText } = useFormat()
const to = computed(() => store.refPath({ type: 'object', id: props.object.id }))
const kind = computed(() => props.object.kind.trim())
</script>

<template>
  <WorldSideRow v-if="props.compact" :to="to" :name="props.object.name" :status="props.object.status" :detail="kind" :active="props.active">
    <template #leading>
      <DEntityAvatar
        :name="props.object.name"
        :image-id="store.primaryImage('object', props.object.id)"
        :color="props.object.color || null"
        shape="square"
        icon="i-lucide-gem"
        size="sm"
        alt=""
      />
    </template>
  </WorldSideRow>
  <DRow v-else :to="to" :name="props.object.name" :epithet="kind || undefined">
    <template #leading>
      <DEntityAvatar
        :name="props.object.name"
        :image-id="store.primaryImage('object', props.object.id)"
        :color="props.object.color || null"
        shape="square"
        icon="i-lucide-gem"
        size="sm"
        alt=""
      />
    </template>
    <template #numbers>
      <span class="whitespace-nowrap">{{ scenesText(props.scenes) }}</span>
      <DStatusBadge :value="props.object.status" kind="planning" />
    </template>
  </DRow>
</template>
