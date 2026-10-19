<script setup lang="ts">
import type { CodexCategory, CodexEntry } from '#shared/types/entities'

/**
 * A category of the codex with its entries (spec 4.4): the name joined by the leader to the number of
 * entries, a new entry in it, rename in place, reorder (handle, Alt+Up/Down, menu) and trash, which
 * takes its entries along in the same batch. The entries reorder within it.
 */
const props = withDefaults(defineProps<{
  category: CodexCategory
  entries: CodexEntry[]
  first: boolean
  last: boolean
  /** The list shows this category only (filtered): it cannot move. */
  alone?: boolean
}>(), { alone: false })

const emit = defineEmits<{
  move: [delta: number]
  newEntry: [categoryId: string]
}>()

const store = useProjectStore()
const route = useRoute()
const { t } = useI18n()

const root = ref<HTMLElement | null>(null)
const renaming = ref(false)
const draft = ref('')
const nameInput = ref<{ inputRef?: HTMLInputElement } | null>(null)

async function startRename() {
  draft.value = props.category.name
  renaming.value = true
  await nextTick()
  nameInput.value?.inputRef?.focus()
  nameInput.value?.inputRef?.select()
}

/** The menu gives the focus back to its button when it closes: when it opened the rename field, the field takes it. */
function keepRenameFocus(event: Event) {
  if (!renaming.value) return
  event.preventDefault()
  nameInput.value?.inputRef?.focus()
  nameInput.value?.inputRef?.select()
}

/** Enter and Escape give the focus back to the category's menu; leaving the field elsewhere keeps it there. */
function focusMenu() {
  void nextTick(() => root.value?.querySelector<HTMLElement>('[data-category-menu]')?.focus())
}

function commitRename(fromKeyboard = false) {
  if (!renaming.value) return
  renaming.value = false
  const name = draft.value.trim()
  if (name && name !== props.category.name) void store.update('codexCategories', props.category.id, { name }).catch(() => {})
  if (fromKeyboard) focusMenu()
}

function cancelRename() {
  renaming.value = false
  focusMenu()
}

async function trash() {
  const openEntry = store.get('codexEntries', String(route.params.entryId ?? ''))
  const leaving = openEntry?.categoryId === props.category.id
  const removed = await store.remove('codexCategories', props.category.id).catch(() => null)
  if (removed && leaving) await navigateTo(`/p/${store.projectId}/codex`)
}

/** The new order of the entries, in one request (a reorder is not an edit: "last edited" stays). */
function reorderEntries(ids: string[]) {
  store.reorder('codexEntries', ids).catch(() => {})
}

/**
 * An entry dragged in from another category: it moves here, then the category takes its new order.
 * Queued typing goes first, so the answer never undoes it (here and below).
 */
async function enterEntry(entryId: string, ids: string[]) {
  await store.flush()
  const moved = await store.update('codexEntries', entryId, { categoryId: props.category.id }).then(() => true, () => false)
  if (moved) store.reorder('codexEntries', ids).catch(() => {})
}

/** Moves an entry to the end of another category. */
async function moveEntryTo(entryId: string, categoryId: string) {
  const last = store.rows.codexEntries.filter(e => e.categoryId === categoryId).reduce((n, e) => Math.max(n, e.position), -1)
  await store.flush()
  void store.update('codexEntries', entryId, { categoryId, position: last + 1 }).catch(() => {})
  const target = store.get('codexCategories', categoryId)
  useToast().add({ title: t('codex.movedTo', { category: target?.name ?? '' }), icon: 'i-lucide-folder-input' })
}

const menu = computed(() => [
  [{ label: t('codex.newEntryIn', { category: props.category.name }), icon: 'i-lucide-plus', onSelect: () => emit('newEntry', props.category.id) }],
  [
    { label: t('common.actions.rename'), icon: 'i-lucide-pencil', onSelect: () => { void startRename() } },
    { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', disabled: props.first || props.alone, kbds: ['alt', 'arrowup'], onSelect: () => emit('move', -1) },
    { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', disabled: props.last || props.alone, kbds: ['alt', 'arrowdown'], onSelect: () => emit('move', 1) },
  ],
  [{ label: props.entries.length ? t('codex.deleteCategoryWith', { n: props.entries.length }, props.entries.length) : t('common.actions.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: trash }],
])
</script>

<template>
  <section ref="root" :aria-labelledby="`codex-category-${category.id}`">
    <div class="group flex min-h-11 items-center rounded-[calc(var(--ui-radius)*2)] transition-colors duration-150 hover:bg-elevated/60 focus-within:bg-elevated/60">
      <span
        class="codex-category-handle flex h-11 w-6 shrink-0 items-center justify-center text-dimmed"
        :class="alone ? 'invisible' : 'cursor-grab touch-none active:cursor-grabbing'"
        :title="t('architecture.sortable.handle')"
        aria-hidden="true"
      >
        <UIcon name="i-lucide-grip-vertical" class="size-4" />
      </span>
      <form v-if="renaming" class="min-w-0 flex-1 py-1 ps-1" @submit.prevent="commitRename(true)">
        <UInput
          ref="nameInput"
          v-model="draft"
          maxlength="200"
          :aria-label="t('codex.categoryName')"
          class="w-full"
          :ui="{ base: 'voice-author text-lg font-semibold max-lg:min-h-11' }"
          @blur="commitRename()"
          @keydown.esc.stop="cancelRename"
        />
      </form>
      <!-- Narrow (a phone, the pane beside an entry): the count under the name, so the name keeps its room. -->
      <div v-else class="flex min-w-0 flex-1 flex-col py-1 @md:flex-row @md:items-baseline @md:gap-3">
        <h2 :id="`codex-category-${category.id}`" class="voice-author min-w-0 truncate ps-1 text-lg font-semibold text-highlighted">
          {{ category.name }}
        </h2>
        <DLeader class="hidden @md:block" />
        <span class="tabular shrink-0 ps-1 text-sm text-muted @md:ps-0">{{ t('codex.count', { n: entries.length }, entries.length) }}</span>
      </div>
      <UTooltip :text="t('codex.newEntryIn', { category: category.name })">
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          class="ms-1 shrink-0 text-muted max-lg:size-11 max-lg:justify-center"
          :aria-label="t('codex.newEntryIn', { category: category.name })"
          @click="emit('newEntry', category.id)"
        />
      </UTooltip>
      <UDropdownMenu :items="menu" :content="{ align: 'end', onCloseAutoFocus: keepRenameFocus }">
        <UButton data-category-menu icon="i-lucide-ellipsis" color="neutral" variant="ghost" class="me-1 shrink-0 text-muted max-lg:size-11 max-lg:justify-center" :aria-label="t('codex.categoryActions', { category: category.name })" />
      </UDropdownMenu>
    </div>

    <ArchitectureSortableList
      :items="entries"
      :item-label="(e: CodexEntry) => e.title"
      :label="category.name"
      handle=".codex-entry-handle"
      group="codex-entries"
      @reorder="reorderEntries"
      @enter="enterEntry"
    >
      <template #default="{ item, first: firstEntry, last: lastEntry, move }">
        <CodexEntryRow
          :entry="item"
          :first="firstEntry"
          :last="lastEntry"
          :active="route.params.entryId === item.id"
          @move="move"
          @move-to="(categoryId) => moveEntryTo(item.id, categoryId)"
        />
      </template>
    </ArchitectureSortableList>
  </section>
</template>
