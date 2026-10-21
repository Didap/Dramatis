<script setup lang="ts">
import type { Subrace } from '#shared/types/domain'
import type { Character, Relation } from '#shared/types/entities'

/**
 * The race of a character (module races): a `membership` relationship from the character to a group of
 * kind race, so the race's page lists its characters. More than one for mixed blood. A race typed in
 * the picker is created on the spot; one taken away goes to the trash, with undo. Under each race, its
 * subrace (VRS-565): one of the race's own, kept on the membership; one typed in is added to the race.
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

const NONE = '__none'

function subracesOf(raceId: string): Subrace[] {
  return store.get('groups', raceId)?.subraces ?? []
}

function subraceItems(raceId: string) {
  return [
    { id: NONE, label: t('characters.sheet.subraceNone') },
    ...subracesOf(raceId).map(s => ({ id: s.id, label: s.name.trim() || t('groups.race.subraceUntitled') })),
  ]
}

/** The subrace chosen, while the race still has it. */
const subraceOf = (link: Relation) => (subracesOf(link.targetId).some(s => s.id === link.subraceId) ? link.subraceId! : undefined)

const subraceLabel = (link: Relation) => (links.value.length > 1
  ? t('characters.sheet.subraceOf', { race: store.get('groups', link.targetId)?.name ?? '' })
  : t('characters.sheet.subrace'))

/** A select is named by its field and, once chosen, by its value too ("Sottorazza: Elfi dei boschi"). */
function named(field: string, value: string | undefined) {
  return value ? t('characters.sheet.fieldValue', { field, value }) : field
}

const raceName = computed(() => named(t('characters.sheet.race'), items.value.filter(item => selected.value.includes(item.id)).map(item => item.label).join(', ')))
const subraceName = (link: Relation) => named(subraceLabel(link), subraceItems(link.targetId).find(item => item.id === subraceOf(link))?.label)

function chooseSubrace(link: Relation, value: unknown) {
  // Choosing "Crea la sottorazza" sends the typed name along: the creation is @create's.
  const id = value === NONE ? null : value
  if (id !== null && (typeof id !== 'string' || !subracesOf(link.targetId).some(s => s.id === id))) return
  if (id !== (subraceOf(link) ?? null)) store.update('relations', link.id, { subraceId: id }).catch(() => {})
}

/*
 * The subrace takes the width of the race above it ([contain:inline-size]): a long name wraps onto a
 * second line rather than widening the column and cutting the fields beside it. Each subrace select
 * has a field of its own, so it gets its own id and is not labelled "Razza".
 */

/** The subrace selects, by membership: one closes through its trigger once a subrace typed in is created. */
const subraceMenus = new Map<string, { triggerRef?: HTMLElement | null }>()

function keepMenu(linkId: string, menu: unknown) {
  if (menu) subraceMenus.set(linkId, menu as { triggerRef?: HTMLElement | null })
  else subraceMenus.delete(linkId)
}

async function createSubrace(link: Relation, name: string) {
  // Closing through the trigger tells the menu itself, which also empties its search.
  subraceMenus.get(link.id)?.triggerRef?.click()
  const value = name.trim().slice(0, 120)
  const race = store.get('groups', link.targetId)
  if (!value || !race) return
  const subrace: Subrace = { id: crypto.randomUUID(), name: value, description: null }
  try {
    // Both at once: a subrace chosen meanwhile is not overwritten when the race comes back from the server.
    await Promise.all([
      store.update('groups', race.id, { subraces: [...race.subraces, subrace] }),
      store.update('relations', link.id, { subraceId: subrace.id }),
    ])
  }
  catch {
    // The store has said what went wrong; a subrace the race lacks is not shown.
  }
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
  <div class="min-w-0">
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
      :aria-label="raceName"
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
    <UFormField v-for="link in links" :key="link.id">
      <USelectMenu
        :ref="(menu: unknown) => keepMenu(link.id, menu)"
        :model-value="subraceOf(link)"
        :items="subraceItems(link.targetId)"
        value-key="id"
        label-key="label"
        create-item
        color="neutral"
        variant="ghost"
        :placeholder="subraceLabel(link)"
        :aria-label="subraceName(link)"
        :search-input="{ placeholder: t('common.actions.search'), autofocus: !touch }"
        class="-ms-2.5 w-full [contain:inline-size]"
        :ui="{ base: 'pointer-coarse:min-h-11', value: 'voice-author line-clamp-2 text-start whitespace-normal!', placeholder: 'text-muted' }"
        @update:model-value="(value: unknown) => chooseSubrace(link, value)"
        @create="(name: string) => createSubrace(link, name)"
      >
        <template #create-item-label="{ item }">
          {{ t('characters.sheet.subraceCreate', { name: item }) }}
        </template>
      </USelectMenu>
    </UFormField>
  </div>
</template>
