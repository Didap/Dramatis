<script setup lang="ts">
import type { Character, Group, Relation } from '#shared/types/entities'
import { useCharacterSaves } from './saving'

/**
 * The groups (factions in games) a character belongs to: `membership` relationships from the
 * character to the group, with the role as the relationship's label (spec 0.3). A group typed in the
 * picker is created on the spot (a faction in games, as from the capture drawer). Removing a
 * membership moves the relationship to the trash, with undo, and leaves the focus on the next one.
 */
const props = defineProps<{ character: Character }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { save } = useCharacterSaves()

/** The longest label the server keeps for a relationship (validation.ts). */
const ROLE_MAX = 120

const medium = computed(() => (store.isGame ? 'game' : 'novel'))
const root = useTemplateRef<HTMLElement>('root')
/** Typing a name goes straight to the search; on a touch screen the keyboard waits for a tap. */
const touch = useMediaQuery('(pointer: coarse)')

const memberships = computed(() =>
  store.rows.relations
    .filter(r => r.kind === 'membership' && r.sourceType === 'character' && r.sourceId === props.character.id && r.targetType === 'group')
    .map(relation => ({ relation, group: store.get('groups', relation.targetId) }))
    .filter((m): m is { relation: Relation, group: Group } => !!m.group)
    .sort((a, b) => a.group.position - b.group.position),
)

const joined = computed(() => new Set(memberships.value.map(m => m.group.id)))
const choices = computed(() =>
  [...store.rows.groups]
    .filter(g => !joined.value.has(g.id))
    .sort((a, b) => a.position - b.position)
    .map(g => ({ id: g.id, label: g.name, icon: REF_ICONS.group })),
)

async function join(groupId: unknown) {
  if (typeof groupId !== 'string' || joined.value.has(groupId)) return
  await store.create('relations', {
    sourceType: 'character',
    sourceId: props.character.id,
    targetType: 'group',
    targetId: groupId,
    kind: 'membership',
    directed: true,
  }).catch(() => {})
}

async function createAndJoin(name: string) {
  const value = name.trim().slice(0, 200)
  if (!value) return
  try {
    const group = await store.create('groups', { name: value, ...(store.isGame ? { kind: 'faction' as const } : {}) })
    await join(group.id)
  }
  catch {
    // The store has said what went wrong.
  }
}

function leave(relation: Relation, index: number) {
  void store.remove('relations', relation.id).catch(() => {})
  void nextTick(() => {
    const buttons = [...(root.value?.querySelectorAll<HTMLElement>('[data-membership-remove]') ?? [])]
    ;(buttons[index] ?? buttons[index - 1] ?? root.value?.querySelector<HTMLElement>('[data-group-picker]'))?.focus()
  })
}
</script>

<template>
  <CharactersSection :title="term('groups')">
    <div ref="root">
      <ul v-if="memberships.length" role="list" class="-mx-2">
        <li
          v-for="({ relation, group }, index) in memberships"
          :key="relation.id"
          class="group/member flex min-h-11 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 hover:bg-elevated focus-within:bg-elevated"
        >
          <DColorDot :color="group.color" />
          <NuxtLink
            :to="store.refPath({ type: 'group', id: group.id })"
            class="voice-author shrink-0 font-semibold text-highlighted underline-offset-3 hover:underline"
          >
            {{ group.name }}
          </NuxtLink>
          <div class="min-w-0 flex-1">
            <DInlineText
              :model-value="relation.label"
              variant="small"
              :maxlength="ROLE_MAX"
              :placeholder="t(`characters.groups.rolePlaceholder.${medium}`)"
              :aria-label="t('characters.groups.role', { group: group.name })"
              class="voice-author italic pointer-coarse:min-h-11"
              @update:model-value="(value: string) => save('relations', relation.id, { label: value })"
            />
          </div>
          <UTooltip :text="t('characters.groups.remove', { group: group.name })">
            <UButton
              data-membership-remove
              icon="i-lucide-x"
              size="sm"
              color="neutral"
              variant="ghost"
              class="justify-center opacity-0 group-hover/member:opacity-100 group-focus-within/member:opacity-100 focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100"
              :aria-label="t('characters.groups.remove', { group: group.name })"
              @click="leave(relation, index)"
            />
          </UTooltip>
        </li>
      </ul>
      <p v-else class="text-sm text-muted text-pretty">{{ t(`characters.groups.empty.${medium}`) }}</p>
      <div class="mt-3 w-full max-w-72">
        <USelectMenu
          data-group-picker
          :model-value="undefined"
          :items="choices"
          value-key="id"
          label-key="label"
          create-item
          size="sm"
          icon="i-lucide-plus"
          :placeholder="t(`characters.groups.add.${medium}`)"
          :aria-label="t(`characters.groups.add.${medium}`)"
          :search-input="{ placeholder: t('common.actions.search'), autofocus: !touch }"
          class="w-full"
          :ui="{ base: 'pointer-coarse:min-h-11' }"
          @update:model-value="join"
          @create="createAndJoin"
        >
          <template #create-item-label="{ item }">
            {{ t(`characters.groups.create.${medium}`, { name: item }) }}
          </template>
        </USelectMenu>
      </div>
    </div>
  </CharactersSection>
</template>
