<script setup lang="ts">
import type { Note } from '#shared/types/entities'
import { excerpt } from '#shared/utils/richtext'

/**
 * A note in the notebook (spec 4.3): the title joined by the leader to when it was last edited, the
 * first line of its text below; where the row is narrow (a phone, the pane beside a note) the time
 * moves under the title, before the first line. The handle drags it; Alt+Up/Down and the menu move it;
 * the menu also pins it to the top and sends it to the trash.
 */
const props = withDefaults(defineProps<{
  note: Note
  first: boolean
  last: boolean
  active?: boolean
}>(), { active: false })

const emit = defineEmits<{ move: [delta: number] }>()

const store = useProjectStore()
const route = useRoute()
const { t } = useI18n()
const { relative } = useFormat()

const to = computed(() => store.refPath({ type: 'note', id: props.note.id }))
const title = computed(() => props.note.title.trim())
const firstLine = computed(() => excerpt(props.note.content, 160))
/** Edits of the text record their time in meta (a reorder also touches updatedAt). */
const editedAt = computed(() => (typeof props.note.meta?.editedAt === 'string' ? props.note.meta.editedAt : props.note.createdAt))

async function trash() {
  const open = route.params.noteId === props.note.id
  const removed = await store.remove('notes', props.note.id).catch(() => null)
  if (removed && open) await navigateTo(`/p/${store.projectId}/notes`)
}

/** Queued typing is sent first, so the answer to the pin never undoes it. */
async function togglePin() {
  const pinned = !props.note.pinned
  await store.flush()
  await store.update('notes', props.note.id, { pinned }).catch(() => {})
}

const menu = computed(() => [
  [{ label: t('common.actions.open'), icon: 'i-lucide-arrow-up-right', to: to.value }],
  [{
    label: props.note.pinned ? t('notes.unpin') : t('notes.pin'),
    icon: props.note.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin',
    onSelect: togglePin,
  }],
  [
    { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', disabled: props.first, kbds: ['alt', 'arrowup'], onSelect: () => emit('move', -1) },
    { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', disabled: props.last, kbds: ['alt', 'arrowdown'], onSelect: () => emit('move', 1) },
  ],
  [{ label: t('common.actions.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: trash }],
])
</script>

<template>
  <div
    class="flex items-center rounded-[calc(var(--ui-radius)*2)] transition-colors duration-150 hover:bg-elevated focus-within:bg-elevated"
    :class="active ? 'bg-elevated' : ''"
  >
    <span class="d-sortable-handle flex h-14 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-dimmed active:cursor-grabbing" :title="t('architecture.sortable.handle')" aria-hidden="true">
      <UIcon name="i-lucide-grip-vertical" class="size-4" />
    </span>
    <NuxtLink
      :to="to"
      class="group flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-[calc(var(--ui-radius)*2)] py-2 pe-2 ps-1"
      :aria-current="active ? 'page' : undefined"
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
    >
      <span class="flex min-w-0 items-baseline gap-3">
        <template v-if="note.pinned">
          <UIcon name="i-lucide-pin" class="size-3.5 shrink-0 self-center text-muted" />
          <span class="sr-only">{{ t('notes.pinned') }}</span>
        </template>
        <span v-if="title" class="voice-author truncate text-base font-semibold! text-highlighted">{{ title }}</span>
        <span v-else class="truncate text-base text-muted">{{ t('common.untitled.note') }}</span>
        <DLeader class="hidden @md:block" />
        <time :datetime="editedAt" class="tabular hidden shrink-0 text-xs text-muted @md:inline">{{ relative(editedAt) }}</time>
      </span>
      <span class="flex min-w-0 items-baseline gap-2 text-sm text-muted">
        <time :datetime="editedAt" class="tabular shrink-0 text-xs @md:hidden">{{ relative(editedAt) }}</time>
        <span v-if="firstLine" class="voice-author min-w-0 truncate">{{ firstLine }}</span>
      </span>
    </NuxtLink>
    <UDropdownMenu :items="menu" :content="{ align: 'end' }">
      <UButton
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        class="me-1 shrink-0 text-muted max-lg:size-11 max-lg:justify-center"
        :aria-label="t('notes.actions', { name: title || t('common.untitled.note') })"
      />
    </UDropdownMenu>
  </div>
</template>
