<script setup lang="ts">
import type { Character } from '#shared/types/entities'

/**
 * The race of a character (module races): a `membership` relationship from the character to a group of
 * kind race, so the race's page lists its characters. More than one for mixed blood. A race typed in
 * the picker is created on the spot; one taken away goes to the trash, with undo.
 */
const props = defineProps<{ character: Character }>()

const store = useProjectStore()
const { t } = useI18n()
/** Typing a name goes straight to the search; on a touch screen the keyboard waits for a tap. */
const touch = useMediaQuery('(pointer: coarse)')

const items = computed(() =>
  store.rows.groups
    .filter(group => store.isRace(group.id))
    .sort((a, b) => a.position - b.position)
    .map(group => ({ id: group.id, label: group.name })),
)
const links = computed(() =>
  store.rows.relations.filter(r =>
    r.kind === 'membership' && r.sourceType === 'character' && r.sourceId === props.character.id && r.targetType === 'group' && store.isRace(r.targetId)),
)
const selected = computed(() => links.value.map(r => r.targetId))

async function join(raceId: string) {
  await store.create('relations', {
    sourceType: 'character',
    sourceId: props.character.id,
    targetType: 'group',
    targetId: raceId,
    kind: 'membership',
    directed: true,
  }).catch(() => {})
}

async function choose(value: unknown) {
  const list = Array.isArray(value) ? value : []
  // Choosing "Crea la razza" sends the typed name along: the creation is @create's.
  const known = new Set(items.value.map(item => item.id))
  if (list.some(id => typeof id !== 'string' || !known.has(id))) return
  const ids = new Set(list as string[])
  for (const relation of links.value) if (!ids.has(relation.targetId)) void store.remove('relations', relation.id).catch(() => {})
  for (const id of ids) if (!selected.value.includes(id)) await join(id)
}

async function createAndJoin(name: string) {
  const value = name.trim().slice(0, 200)
  if (!value) return
  try {
    const race = await store.create('groups', { name: value, kind: 'race' })
    await join(race.id)
  }
  catch {
    // The store has said what went wrong.
  }
}
</script>

<template>
  <USelectMenu
    :model-value="selected"
    :items="items"
    value-key="id"
    label-key="label"
    multiple
    create-item
    color="neutral"
    variant="ghost"
    :placeholder="t('characters.sheet.racePlaceholder')"
    :aria-label="t('characters.sheet.race')"
    :search-input="{ placeholder: t('common.actions.search'), autofocus: !touch }"
    class="-ms-2.5 w-full"
    :ui="{ base: 'pointer-coarse:min-h-11', value: 'voice-author', placeholder: 'text-muted' }"
    @update:model-value="choose"
    @create="createAndJoin"
  >
    <template #create-item-label="{ item }">
      {{ t('characters.sheet.raceCreate', { name: item }) }}
    </template>
  </USelectMenu>
</template>
