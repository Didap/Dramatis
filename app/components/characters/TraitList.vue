<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { CharacterTraits } from '#shared/types/domain'
import type { Character } from '#shared/types/entities'
import { useCharacterSaves } from './saving'

type TraitField = keyof CharacterTraits

/**
 * One of the three short ordered lists of a character (spec 5.2 step 7): type and Enter adds; an item
 * edits in place; drag, Alt+Up/Down or the item's menu reorder; removing it has an undo toast (a field
 * deletion, not the trash) and leaves the focus on the next item. Saved like typing (saving.ts): what
 * is added offline stays and goes out when the connection comes back.
 */
const props = defineProps<{ character: Character, field: TraitField }>()

const { t } = useI18n()
const toast = useToast()
const { save: saveSoon } = useCharacterSaves()
const uid = useId()

const MAX_ITEMS = 40
const MAX_LENGTH = 200

const items = computed(() => props.character.traits[props.field] ?? [])

/** The working copy the drag and drop rearranges. Keys follow the texts, so a moved item keeps its element. */
const list = ref<{ key: string, text: string }[]>([])
let nextKey = 0
watch(items, (texts) => {
  const free = new Map<string, string[]>()
  for (const item of list.value) free.set(item.text, [...(free.get(item.text) ?? []), item.key])
  list.value = texts.map(text => ({ text, key: free.get(text)?.shift() ?? `t${nextKey++}` }))
}, { immediate: true })

const draft = ref('')
const editing = ref<number | null>(null)
const editText = ref('')
const announcement = ref('')
const root = useTemplateRef<HTMLElement>('root')

/** Only this list goes up: the store and the server merge the three lists one by one. */
function save(next: string[]) {
  saveSoon('characters', props.character.id, { traits: { [props.field]: next } }, 0)
}

// ---------------------------------------------------------------- focus

const itemButtons = () => [...(root.value?.querySelectorAll<HTMLElement>('[data-trait]') ?? [])]
const addField = () => root.value?.querySelector<HTMLElement>('[data-trait-add]')

type Target = () => HTMLElement | null | undefined

function focusLater(target: Target) {
  void nextTick(() => setTimeout(() => target()?.focus(), 0))
}

/** Where the focus goes once the item's menu has closed: Reka gives it back to the menu's button first. */
let afterMenu: Target | null = null
const menuContent = {
  align: 'end' as const,
  onCloseAutoFocus: (event: Event) => {
    if (!afterMenu) return
    event.preventDefault()
    const target = afterMenu
    afterMenu = null
    target()?.focus()
  },
}

/** The item now at `index`, else the one before, else the field to add one. */
const afterRemoval = (index: number) => () => {
  const buttons = itemButtons()
  return buttons[index] ?? buttons[index - 1] ?? addField()
}

// ---------------------------------------------------------------- changes

function add() {
  const text = draft.value.trim().slice(0, MAX_LENGTH)
  if (!text || items.value.length >= MAX_ITEMS) return
  save([...items.value, text])
  draft.value = ''
}

/** `refocus` false when the author has already moved on (an emptied item left with a click elsewhere). */
function remove(index: number, refocus = true) {
  const removed = items.value[index]
  if (removed === undefined) return
  save(items.value.filter((_, i) => i !== index))
  if (refocus) focusLater(afterRemoval(index))
  toast.add({
    title: t('characters.traits.removed', { text: removed }),
    icon: 'i-lucide-trash-2',
    actions: [{
      label: t('common.actions.undo'),
      onClick: () => {
        const now = [...(props.character.traits[props.field] ?? [])]
        now.splice(Math.min(index, now.length), 0, removed)
        save(now)
      },
    }],
  })
}

function move(index: number, delta: number, refocus = true) {
  const to = index + delta
  if (to < 0 || to >= items.value.length) return
  const next = [...items.value]
  next.splice(to, 0, next.splice(index, 1)[0]!)
  save(next)
  announcement.value = t('characters.traits.moved', { text: next[to], n: to + 1, total: next.length })
  if (refocus) focusLater(() => itemButtons()[to])
}

function onDragEnd() {
  const next = list.value.map(item => item.text)
  if (next.join('\u0000') !== items.value.join('\u0000')) save(next)
}

const editField = () => root.value?.querySelector<HTMLInputElement>('[data-trait-edit]')

function startEdit(index: number, refocus = true) {
  editing.value = index
  editText.value = items.value[index] ?? ''
  if (refocus) focusLater(editField)
}

/** Enter keeps the focus on the item; leaving the field (blur) leaves it where the author went. */
function commitEdit(refocus = false) {
  const index = editing.value
  if (index === null) return
  editing.value = null
  const text = editText.value.trim().slice(0, MAX_LENGTH)
  if (!text) return remove(index, refocus)
  if (text !== items.value[index]) save(items.value.map((item, i) => (i === index ? text : item)))
  if (refocus) focusLater(() => itemButtons()[index])
}

function cancelEdit() {
  const index = editing.value
  editing.value = null
  if (index !== null) focusLater(() => itemButtons()[index])
}

function onItemKeydown(event: KeyboardEvent, index: number) {
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    move(index, event.key === 'ArrowUp' ? -1 : 1)
  }
  else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    remove(index)
  }
}

/** The menu of an item: the way to reorder without dragging, on a phone too. */
function menuOf(index: number, text: string): DropdownMenuItem[][] {
  const moveBy = (delta: number) => () => {
    afterMenu = () => itemButtons()[index + delta]
    move(index, delta, false)
  }
  return [
    [{ label: t('characters.traits.edit'), icon: 'i-lucide-pencil', onSelect: () => { afterMenu = editField; startEdit(index, false) } }],
    [
      { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', kbds: ['alt', 'arrowup'], disabled: index === 0, onSelect: moveBy(-1) },
      { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', kbds: ['alt', 'arrowdown'], disabled: index === list.value.length - 1, onSelect: moveBy(1) },
    ],
    // The item leaves with its menu: nothing gives the focus back, so it moves at once.
    [{ label: t('characters.traits.remove', { text }), icon: 'i-lucide-x', onSelect: () => remove(index) }],
  ]
}
</script>

<template>
  <div ref="root">
    <h3 :id="`${uid}-title`" class="text-sm font-medium text-toned">{{ t(`characters.traits.${field}`) }}</h3>
    <p :id="`${uid}-help`" class="sr-only">{{ t('characters.traits.help') }}</p>
    <VueDraggable
      v-model="list"
      tag="ul"
      role="list"
      :aria-labelledby="`${uid}-title`"
      handle=".characters-trait-handle"
      :animation="150"
      :delay="200"
      :delay-on-touch-only="true"
      ghost-class="opacity-40"
      class="mt-1.5 -mx-1"
      @end="onDragEnd"
    >
      <li
        v-for="(item, index) in list"
        :key="item.key"
        class="group/trait flex items-start gap-0.5 rounded-[calc(var(--ui-radius)*2)] hover:bg-elevated/70 focus-within:bg-elevated/70"
      >
        <span
          class="characters-trait-handle flex h-8 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-dimmed opacity-0 select-none group-hover/trait:opacity-100 active:cursor-grabbing pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:opacity-60"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-grip-vertical" class="size-3.5 pointer-coarse:size-4" />
        </span>
        <input
          v-if="editing === index"
          v-model="editText"
          data-trait-edit
          type="text"
          :maxlength="MAX_LENGTH"
          :aria-label="t('characters.traits.editLabel', { text: item.text })"
          class="voice-author min-w-0 flex-1 rounded-[4.5px] bg-default px-1.5 py-1 text-[0.9375rem] leading-normal text-highlighted pointer-coarse:min-h-11"
          @keydown.enter.prevent="commitEdit(true)"
          @keydown.esc.prevent="cancelEdit"
          @blur="commitEdit()"
        >
        <button
          v-else
          type="button"
          data-trait
          class="voice-author min-w-0 flex-1 rounded-[4.5px] px-1.5 py-1 text-start text-[0.9375rem] leading-normal text-default wrap-anywhere pointer-coarse:min-h-11"
          :aria-describedby="`${uid}-help`"
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete"
          @click="startEdit(index)"
          @keydown="onItemKeydown($event, index)"
        >
          {{ item.text }}
        </button>
        <UDropdownMenu :items="menuOf(index, item.text)" :content="menuContent">
          <UButton
            icon="i-lucide-ellipsis"
            size="xs"
            color="neutral"
            variant="ghost"
            class="mt-0.5 justify-center opacity-0 group-hover/trait:opacity-100 group-focus-within/trait:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:mt-0 pointer-coarse:size-11 pointer-coarse:opacity-100"
            :aria-label="t('characters.traits.actions', { text: item.text })"
          />
        </UDropdownMenu>
      </li>
    </VueDraggable>
    <form class="mt-1" @submit.prevent="add">
      <UInput
        v-model="draft"
        data-trait-add
        :placeholder="t('characters.traits.addShort')"
        :aria-label="t(`characters.traits.add.${field}`)"
        :maxlength="MAX_LENGTH"
        :disabled="items.length >= MAX_ITEMS"
        icon="i-lucide-plus"
        variant="ghost"
        class="-mx-1 w-[calc(100%+0.5rem)]"
        :ui="{ base: 'voice-author text-base placeholder:font-sans placeholder:text-sm md:text-[0.9375rem] pointer-coarse:min-h-11' }"
      />
    </form>
    <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
  </div>
</template>
