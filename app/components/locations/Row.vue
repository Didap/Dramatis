<script lang="ts">
import type { StoryLocation } from '#shared/types/entities'

/**
 * The place line of a location ("Mola di Bari, Puglia, Italia"): city, region and nation, leaving out
 * what repeats the name, and the region or nation already said by a heading.
 */
export function placeLine(
  location: Pick<StoryLocation, 'name' | 'city' | 'region' | 'nation'>,
  omit: { region?: boolean, nation?: boolean } = {},
): string {
  const name = location.name.trim().toLocaleLowerCase()
  const parts = [location.city, omit.region ? '' : location.region, omit.nation ? '' : location.nation]
    .map(part => part.trim())
    .filter(part => part && part.toLocaleLowerCase() !== name)
  return [...new Set(parts)].join(', ')
}
</script>

<script setup lang="ts">
/**
 * A location in a list: its picture, name, place line, number of scenes set there, planning status.
 * In the side column of a sheet, the name over the place line and the status.
 */
const props = withDefaults(defineProps<{
  location: StoryLocation
  scenes: number
  compact?: boolean
  active?: boolean
  /** Parts of the place line already given by the section heading. */
  omit?: { region?: boolean, nation?: boolean }
}>(), { compact: false, active: false, omit: () => ({}) })

const store = useProjectStore()
const { scenes: scenesText } = useFormat()
const to = computed(() => store.refPath({ type: 'location', id: props.location.id }))
const place = computed(() => placeLine(props.location, props.omit))
</script>

<template>
  <WorldSideRow v-if="props.compact" :to="to" :name="props.location.name" :status="props.location.status" :detail="place" :active="props.active">
    <template #leading>
      <DEntityAvatar
        :name="props.location.name"
        :image-id="store.primaryImage('location', props.location.id)"
        :color="props.location.color || null"
        shape="square"
        icon="i-lucide-map-pin"
        size="sm"
        alt=""
      />
    </template>
  </WorldSideRow>
  <DRow v-else :to="to" :name="props.location.name" :epithet="place || undefined">
    <template #leading>
      <DEntityAvatar
        :name="props.location.name"
        :image-id="store.primaryImage('location', props.location.id)"
        :color="props.location.color || null"
        shape="square"
        icon="i-lucide-map-pin"
        size="sm"
        alt=""
      />
    </template>
    <template #numbers>
      <span class="whitespace-nowrap">{{ scenesText(props.scenes) }}</span>
      <DStatusBadge :value="props.location.status" kind="planning" />
    </template>
  </DRow>
</template>
