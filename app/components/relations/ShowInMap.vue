<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { parseMentionId } from '#shared/utils/richtext'

/**
 * "Mostra nella mappa": opens a map with the entity selected; when it is on no map (or on another
 * one), adds it. Nodes added from here wait at 0,0 and the map lays them out next to their relations.
 */
const props = defineProps<{
  /** The entity: "<type>:<id>". */
  entity: string
}>()

const store = useProjectStore()
const { t } = useI18n()

const name = computed(() => store.refLabel(parseMentionId(props.entity)))
const maps = computed(() => [...store.rows.maps].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)))
const containing = computed(() => maps.value.filter(m => props.entity in m.nodes))
const others = computed(() => maps.value.filter(m => !(props.entity in m.nodes)))

function mapPath(mapId: string) {
  return { path: `/p/${store.projectId}/relations/${mapId}`, query: { focus: props.entity } }
}

/** The entities tied to this one by a relationship (those in the trash left out). */
function linked(): string[] {
  const out = new Set<string>()
  for (const r of store.rows.relations) {
    const source = `${r.sourceType}:${r.sourceId}`
    const target = `${r.targetType}:${r.targetId}`
    if (source === props.entity) out.add(target)
    else if (target === props.entity) out.add(source)
  }
  return [...out].filter(key => !!store.getRef(parseMentionId(key)))
}

async function addTo(mapId: string) {
  const map = store.get('maps', mapId)
  if (!map) return
  await store.update('maps', mapId, { nodes: { ...map.nodes, [props.entity]: { x: 0, y: 0 } } }).catch(() => {})
  await navigateTo(mapPath(mapId))
}

async function newMap() {
  const nodes = Object.fromEntries([props.entity, ...linked()].map(key => [key, { x: 0, y: 0 }]))
  const map = await store.create('maps', { name: t('relations.showInMap.mapName', { name: name.value }), nodes }).catch(() => null)
  if (map) await navigateTo(mapPath(map.id))
}

const items = computed<DropdownMenuItem[][]>(() => [
  containing.value.map(m => ({ label: t('relations.showInMap.open', { name: m.name }), icon: 'i-lucide-network', onSelect: () => { void navigateTo(mapPath(m.id)) } })),
  others.value.map(m => ({ label: t('relations.showInMap.addTo', { name: m.name }), icon: 'i-lucide-plus', onSelect: () => { void addTo(m.id) } })),
  [{ label: t('relations.showInMap.newMap', { name: name.value }), icon: 'i-lucide-square-plus', onSelect: () => { void newMap() } }],
].filter(group => group.length))

/** On exactly one map and nowhere else to go: a plain link. */
const direct = computed(() => (containing.value.length === 1 && !others.value.length ? containing.value[0]! : null))
</script>

<template>
  <UButton
    v-if="direct"
    :to="mapPath(direct.id)"
    icon="i-lucide-network"
    color="neutral"
    variant="ghost"
    class="max-lg:min-h-11"
    :label="t('relations.showInMap.label')"
  />
  <UDropdownMenu v-else :items="items" :content="{ align: 'start' }">
    <UButton icon="i-lucide-network" trailing-icon="i-lucide-chevron-down" color="neutral" variant="ghost" class="max-lg:min-h-11" :label="t('relations.showInMap.label')" />
  </UDropdownMenu>
</template>
