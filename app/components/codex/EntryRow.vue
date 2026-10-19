<script setup lang="ts">
import type { CodexEntry } from '#shared/types/entities'
import { excerpt } from '#shared/utils/richtext'

/**
 * An entry of the codex (spec 4.4): the title joined by the leader to when it was last edited, its
 * first line below; where the row is narrow (a phone, the pane beside an entry) the time moves under
 * the title, before the first line. The handle drags it within its category; Alt+Up/Down and the menu
 * move it; the menu also moves it to another category and sends it to the trash.
 */
const props = withDefaults(defineProps<{
  entry: CodexEntry
  first: boolean
  last: boolean
  active?: boolean
}>(), { active: false })

const emit = defineEmits<{ move: [delta: number], moveTo: [categoryId: string] }>()

const store = useProjectStore()
const route = useRoute()
const { t } = useI18n()
const { relative } = useFormat()

const to = computed(() => store.refPath({ type: 'codex', id: props.entry.id }))
const firstLine = computed(() => excerpt(props.entry.body, 160))
/** Edits of the text record their time in meta (a reorder also touches updatedAt). */
const editedAt = computed(() => (typeof props.entry.meta?.editedAt === 'string' ? props.entry.meta.editedAt : props.entry.createdAt))

async function trash() {
  const open = route.params.entryId === props.entry.id
  const removed = await store.remove('codexEntries', props.entry.id).catch(() => null)
  if (removed && open) await navigateTo(`/p/${store.projectId}/codex`)
}

const menu = computed(() => {
  const others = store.rows.codexCategories.filter(c => c.id !== props.entry.categoryId)
  return [
    [{ label: t('common.actions.open'), icon: 'i-lucide-arrow-up-right', to: to.value }],
    [
      { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', disabled: props.first, kbds: ['alt', 'arrowup'], onSelect: () => emit('move', -1) },
      { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', disabled: props.last, kbds: ['alt', 'arrowdown'], onSelect: () => emit('move', 1) },
      {
        label: t('codex.moveTo'),
        icon: 'i-lucide-folder-input',
        disabled: !others.length,
        children: others.map(c => ({ label: c.name, onSelect: () => emit('moveTo', c.id) })),
      },
    ],
    [{ label: t('common.actions.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: trash }],
  ]
})
</script>

<template>
  <div
    class="flex items-center rounded-[calc(var(--ui-radius)*2)] transition-colors duration-150 hover:bg-elevated focus-within:bg-elevated"
    :class="active ? 'bg-elevated' : ''"
  >
    <span class="codex-entry-handle flex h-14 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-dimmed active:cursor-grabbing" :title="t('architecture.sortable.handle')" aria-hidden="true">
      <UIcon name="i-lucide-grip-vertical" class="size-4" />
    </span>
    <NuxtLink
      :to="to"
      class="group flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-[calc(var(--ui-radius)*2)] py-2 pe-2 ps-1"
      :aria-current="active ? 'page' : undefined"
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
    >
      <span class="flex min-w-0 items-baseline gap-3">
        <span class="voice-author truncate text-base font-semibold! text-highlighted">{{ entry.title }}</span>
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
        :aria-label="t('codex.entryActions', { name: entry.title })"
      />
    </UDropdownMenu>
  </div>
</template>
