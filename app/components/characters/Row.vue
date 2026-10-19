<script setup lang="ts">
import { CHARACTER_IMPORTANCES } from '#shared/utils/constants'
import type { CharacterImportance } from '#shared/types/domain'
import type { Character } from '#shared/types/entities'
import type { DropdownMenuItem } from '@nuxt/ui'

/**
 * A character in the list: portrait, name, epithet, the leader, the scenes it appears in, the planning
 * status with its label. Reordered by its handle, by Alt+Up/Down while it has the focus, or from its
 * menu, which says why it cannot when a filter or another order is on; the menu also moves it to
 * another importance and to the trash. On a phone the epithet and the scenes share the second line.
 * `compact`: the side list of the xl layout, where the status is its icon (with the label in a tooltip
 * and for screen readers).
 */
const props = withDefaults(defineProps<{
  character: Character
  epithet?: string
  appearances: number
  compact?: boolean
  active?: boolean
  /** Manual order, no filter: the row can move. */
  movable?: boolean
  first?: boolean
  last?: boolean
}>(), { epithet: undefined, compact: false, active: false, movable: false, first: false, last: false })

const emit = defineEmits<{ move: [delta: number], moveTo: [importance: CharacterImportance], trash: [] }>()

const store = useProjectStore()
const { t } = useI18n()
const { scenes } = useFormat()

const to = computed(() => store.refPath({ type: 'character', id: props.character.id }))
const imageId = computed(() => store.primaryImage('character', props.character.id))
const playable = computed(() => store.isGame && props.character.playable)

const menu = computed<DropdownMenuItem[][]>(() => [
  [
    { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', kbds: ['alt', 'arrowup'], disabled: !props.movable || props.first, onSelect: () => emit('move', -1) },
    { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', kbds: ['alt', 'arrowdown'], disabled: !props.movable || props.last, onSelect: () => emit('move', 1) },
    ...(props.movable ? [] : [{ type: 'label' as const, label: t('characters.list.moveHint') }]),
  ],
  CHARACTER_IMPORTANCES
    .filter(importance => importance !== props.character.importance)
    .map(importance => ({ label: t(`characters.list.moveTo.${importance}`), icon: 'i-lucide-arrow-right-left', onSelect: () => emit('moveTo', importance) })),
  [{ label: t('characters.list.trash'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('trash') }],
])

function onKeydown(event: KeyboardEvent) {
  if (!props.movable || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  event.preventDefault()
  emit('move', event.key === 'ArrowUp' ? -1 : 1)
}
</script>

<template>
  <li
    class="group/row flex items-center rounded-[calc(var(--ui-radius)*2)] transition-colors duration-150 hover:bg-elevated focus-within:bg-elevated"
    :class="active ? 'bg-elevated' : ''"
    :data-character="character.id"
    @keydown="onKeydown"
  >
    <span
      class="characters-row-handle flex h-11 shrink-0 cursor-grab touch-none items-center justify-center text-dimmed opacity-0 select-none group-hover/row:opacity-100 active:cursor-grabbing pointer-coarse:w-7 pointer-coarse:opacity-60"
      :class="[compact ? 'w-4' : 'w-5', movable ? '' : 'invisible']"
      aria-hidden="true"
    >
      <UIcon name="i-lucide-grip-vertical" class="size-4" />
    </span>
    <DRow
      :to="to"
      :name="character.name"
      :active="active"
      class="min-w-0 flex-1"
      :class="compact ? 'py-2! ps-1!' : ''"
      :aria-keyshortcuts="movable ? 'Alt+ArrowUp Alt+ArrowDown' : undefined"
    >
      <template #leading>
        <DEntityAvatar :name="character.name" :image-id="imageId" :color="character.color" alt="" />
      </template>
      <template #name>
        <template v-if="compact">
          <span class="block truncate">{{ character.name }}</span>
          <span v-if="epithet" class="block truncate text-sm font-normal italic text-muted">{{ epithet }}</span>
        </template>
        <template v-else>
          <span class="block truncate sm:inline">{{ character.name }}</span>
          <span v-if="epithet" class="hidden font-normal italic text-muted sm:inline">, {{ epithet }}</span>
        </template>
      </template>
      <template v-if="!compact" #numbers>
        <span v-if="epithet" class="voice-author min-w-0 flex-1 truncate text-sm italic sm:hidden">{{ epithet }}</span>
        <span v-if="playable" class="hidden items-center gap-1 text-toned sm:inline-flex">
          <UIcon name="i-lucide-gamepad-2" class="size-4 shrink-0" />
          {{ t('characters.sheet.playable') }}
        </span>
        <span class="tabular shrink-0 whitespace-nowrap" :class="appearances ? '' : 'text-dimmed'">{{ scenes(appearances) }}</span>
      </template>
      <template #trailing>
        <UTooltip v-if="playable" :text="t('characters.sheet.playable')">
          <span class="inline-flex text-toned" :class="compact ? '' : 'sm:hidden'">
            <UIcon name="i-lucide-gamepad-2" class="size-4" />
            <span class="sr-only">{{ t('characters.sheet.playable') }}</span>
          </span>
        </UTooltip>
        <DStatusBadge :value="character.status" kind="planning" compact :class="compact ? '' : 'sm:hidden'" />
        <span v-if="!compact" class="hidden w-24 sm:block">
          <DStatusBadge :value="character.status" kind="planning" />
        </span>
      </template>
    </DRow>
    <UTooltip :text="t('characters.list.rowActions', { name: character.name })" :content="{ side: 'left' }">
      <UDropdownMenu :items="menu" :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="sm"
          class="me-1 shrink-0 justify-center opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100 data-[state=open]:opacity-100"
          :aria-label="t('characters.list.rowActions', { name: character.name })"
        />
      </UDropdownMenu>
    </UTooltip>
  </li>
</template>
