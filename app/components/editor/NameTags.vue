<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { Character } from '#shared/types/entities'
import { CHARACTER_IMPORTANCES } from '#shared/utils/constants'
import { mentionId, parseMentionId } from '#shared/utils/richtext'
import { OBJECT, buildNameIndex, endsName, longestPhrase, matchBefore } from '~/utils/name-tags'

/**
 * Characters tagged while writing, without the @ (VRS-577). A first name, a surname, the full name or
 * another name, followed by a space, a punctuation mark or a new paragraph, becomes a mention of that
 * character: its own step in the history, and Backspace right after gives the plain text back.
 * "Giovanni" then "Bubbolo" make one mention of the full name. A name more characters answer to asks
 * who it is: the chooser opens under it; typing on leaves it marked, and a click or Tab on it asks again.
 *
 * The tag waits for the typed character to settle (quotes and dashes of the smart typography first),
 * then goes in as a transaction of its own.
 */
const props = defineProps<{ editor: Editor }>()

const store = useProjectStore()
const { t } = useI18n()
const { label: enumLabel } = useEnums()
const uid = useId()

const names = computed(() => buildNameIndex(store.rows.characters))
const longest = computed(() => longestPhrase(names.value))

interface Undecided { from: number, to: number, phrase: string, ids: string[] }
type Plan = { kind: 'tag', from: number, to: number, text: string, id: string, label: string } | ({ kind: 'choose', text: string } & Undecided)

// ---------------------------------------------------------------- finding a name

/** The name that ends at `pos`, in the text of its paragraph; a mention and the new name next to it merge. */
function planAt(state: EditorState, pos: number): Plan | null {
  const index = names.value
  if (!index.size || pos < 1 || pos > state.doc.content.size) return null
  const $pos = state.doc.resolve(pos)
  const parent = $pos.parent
  if (!parent.isTextblock || parent.type.spec.code) return null
  // Every position of a paragraph is one character here (a mention is OBJECT), so offsets are positions.
  const text = parent.textBetween(Math.max(0, $pos.parentOffset - longest.value - 2), $pos.parentOffset, undefined, OBJECT)
  const match = matchBefore(text, index, longest.value)
  if (!match) return null
  const from = pos - text.length + match.start
  if (match.start >= 2 && text[match.start - 1] === ' ' && text[match.start - 2] === OBJECT) {
    const node = state.doc.nodeAt(from - 2)
    const ref = node?.type.name === 'mention' ? parseMentionId(String(node.attrs.id ?? '')) : null
    if (node && ref?.type === 'character' && match.ids.includes(ref.id)) {
      return { kind: 'tag', from: from - 2, to: pos, text: `${OBJECT} ${match.phrase}`, id: ref.id, label: `${node.attrs.label} ${match.phrase}` }
    }
  }
  if (match.ids.length === 1) return { kind: 'tag', from, to: pos, text: match.phrase, id: match.ids[0]!, label: match.phrase }
  return { kind: 'choose', from, to: pos, text: match.phrase, phrase: match.phrase, ids: [...match.ids] }
}

/** Once the typed character is in (and the smart typography has had its turn), the name before it. */
function checkSoon(pos: number) {
  queueMicrotask(() => {
    if (props.editor.isDestroyed || !props.editor.isEditable) return
    const { state } = props.editor.view
    if (pos > state.doc.content.size) return
    const next = state.doc.textBetween(pos, Math.min(pos + 1, state.doc.content.size), undefined, OBJECT)
    if (next && !endsName(next)) return
    const plan = planAt(state, pos)
    if (plan && state.doc.textBetween(plan.from, plan.to, undefined, OBJECT) === plan.text) apply(plan)
  })
}

function apply(plan: Plan) {
  const view = props.editor.view
  if (plan.kind === 'choose') {
    view.dispatch(view.state.tr.setMeta(namesKey, { add: plan }))
    if (view.hasFocus()) open(plan)
    return
  }
  const tr = tagTransaction(view.state, plan.from, plan.to, plan.id, plan.label)
  if (!tr) return
  closeHistory(tr)
  // Read by TipTap's undoInputRule (Backspace right after): the tag steps are undone, nothing else.
  tr.setMeta(undoKey, { transform: tr, from: tr.selection.from, to: tr.selection.from, text: '' })
  view.dispatch(tr)
}

function tagTransaction(state: EditorState, from: number, to: number, id: string, label: string): Transaction | null {
  const character = store.get('characters', id)
  const type = state.schema.nodes.mention
  if (!character || !type) return null
  return state.tr.replaceWith(from, to, type.create({ id: mentionId('character', id), label, followsName: label === character.name }))
}

// ---------------------------------------------------------------- the plugins

/** Same shape as TipTap's input rules, so its Backspace (undoInputRule) takes a tag back. */
const undoKey = new PluginKey('sceneNameTagUndo')
const undoPlugin = new Plugin({
  key: undoKey,
  state: {
    init: () => null,
    apply: (tr, previous) => tr.getMeta(undoKey) ?? (tr.selectionSet || tr.docChanged ? null : previous),
  },
  isInputRules: true,
})

/** Names that wait for a choice: marked in the text until chosen, dismissed or edited into something else. */
const namesKey = new PluginKey<DecorationSet>('sceneNameTags')

function undecidedAt(state: EditorState, from: number, to = from): Undecided | null {
  const found = namesKey.getState(state)?.find(from, to)[0]
  if (!found) return null
  const phrase = state.doc.textBetween(found.from, found.to, undefined, OBJECT)
  const ids = names.value.get(phrase)
  return ids && ids.length > 1 ? { from: found.from, to: found.to, phrase, ids: [...ids] } : null
}

const namesPlugin = new Plugin<DecorationSet>({
  key: namesKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      let next = set.map(tr.mapping, tr.doc)
      const meta = tr.getMeta(namesKey) as { add?: Undecided, remove?: { from: number, to: number } } | undefined
      if (meta?.remove) next = next.remove(next.find(meta.remove.from, meta.remove.to))
      if (meta?.add) {
        next = next.remove(next.find(meta.add.from, meta.add.to))
        next = next.add(tr.doc, [Decoration.inline(meta.add.from, meta.add.to, { 'class': 'd-name-undecided', 'data-name-undecided': '' })])
      }
      if (tr.docChanged) {
        const stale = next.find().filter(d => (names.value.get(tr.doc.textBetween(d.from, d.to, undefined, OBJECT))?.length ?? 0) < 2)
        if (stale.length) next = next.remove(stale)
      }
      return next
    },
  },
  props: {
    decorations: state => namesKey.getState(state),
    handleTextInput(view, from, _to, text) {
      if (!view.composing && endsName(text.slice(-1))) checkSoon(from + text.length - 1)
      return false
    },
    handleKeyDown: (view, event) => onKeyDown(view, event),
    handleClick(view, pos) {
      const found = undecidedAt(view.state, pos)
      if (found) open(found)
      return false
    },
    handleDOMEvents: {
      // Phone keyboards compose a word and its space together.
      compositionend: (view) => {
        setTimeout(() => {
          const { selection } = view.state
          if (!selection.empty || selection.from < 2) return
          const last = view.state.doc.textBetween(selection.from - 1, selection.from, undefined, OBJECT)
          if (endsName(last)) checkSoon(selection.from - 1)
        })
        return false
      },
    },
  },
  view: () => ({
    update(view) {
      const current = chooser.value
      if (!current) return
      // The caret went elsewhere, or the name is gone: the chooser goes too.
      const { from } = view.state.selection
      if (from < current.from || from > current.to + 1 || !undecidedAt(view.state, current.from, current.to)) close()
    },
  }),
})

// ---------------------------------------------------------------- the chooser

const chooser = ref<Undecided | null>(null)
const active = ref(0)
const position = ref<{ x: number, y: number } | null>(null)
const announcement = ref('')
const listId = `${uid}-names`
const optionId = (index: number) => `${listId}-${index}`
/** Enter chooses only after the arrows: a paragraph ending with the name must still be able to end. */
let navigated = false

type Row = { kind: 'character', key: string, character: Character } | { kind: 'none', key: string }

const rows = computed<Row[]>(() => {
  const current = chooser.value
  if (!current) return []
  const order = (c: Character) => CHARACTER_IMPORTANCES.indexOf(c.importance)
  const characters = current.ids
    .map(id => store.get('characters', id))
    .filter((c): c is Character => !!c)
    .sort((a, b) => order(a) - order(b) || a.position - b.position)
  return [...characters.map(character => ({ kind: 'character' as const, key: character.id, character })), { kind: 'none' as const, key: 'none' }]
})

function place() {
  const current = chooser.value
  if (!current || props.editor.isDestroyed) return
  const at = props.editor.view.coordsAtPos(current.from)
  const room = document.documentElement.clientWidth - 288 - 8
  position.value = { x: Math.max(8, Math.min(at.left, room)), y: at.bottom + 6 }
}

function open(found: Undecided) {
  chooser.value = found
  active.value = 0
  navigated = false
  announcement.value = t('editor.names.announce', { name: found.phrase, n: found.ids.length })
  nextTick(place)
}

function close() {
  chooser.value = null
  position.value = null
}

function choose(row: Row) {
  const current = chooser.value
  close()
  if (!current || props.editor.isDestroyed) return
  const view = props.editor.view
  const tr = row.kind === 'character'
    ? tagTransaction(view.state, current.from, current.to, row.character.id, current.phrase)
    : view.state.tr
  if (!tr) return
  tr.setMeta(namesKey, { remove: { from: current.from, to: current.to } })
  // After a choice made with the pointer the caret stays where it was.
  if (row.kind === 'character' && view.state.selection.from > current.to) tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(view.state.selection.from))))
  view.dispatch(tr)
  view.focus()
}

function onKeyDown(view: EditorView, event: KeyboardEvent): boolean {
  const plain = !event.metaKey && !event.ctrlKey && !event.altKey
  if (chooser.value && !event.isComposing) {
    const count = rows.value.length
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      active.value = (active.value + (event.key === 'ArrowDown' ? 1 : count - 1)) % count
      navigated = true
      return true
    }
    if ((event.key === 'Tab' && !event.shiftKey && plain) || (event.key === 'Enter' && navigated)) {
      const row = rows.value[active.value]
      if (row) choose(row)
      return true
    }
    if (event.key === 'Escape') {
      close()
      return true
    }
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return false
    close()
  }
  if (event.key === 'Tab' && !event.shiftKey && plain) {
    const { from } = view.state.selection
    const found = undecidedAt(view.state, Math.max(0, from - 1), from)
    if (found) {
      open(found)
      return true
    }
  }
  if (event.key === 'Enter' && !event.shiftKey && plain && view.state.selection.empty) checkSoon(view.state.selection.from)
  return false
}

function onRowDown(event: MouseEvent, row: Row) {
  if (event.button === 0) choose(row)
}

/** Leaving the text closes the chooser; the name stays marked. */
function onBlur() {
  setTimeout(() => {
    if (chooser.value && !props.editor.isDestroyed && !props.editor.view.hasFocus()) close()
  })
}

useEventListener(window, 'scroll', place, { capture: true, passive: true })
useEventListener(window, 'resize', place, { passive: true })

// The text keeps the focus while the chooser is open: the highlighted row is its active descendant.
watchPostEffect(() => {
  if (props.editor.isDestroyed) return
  const dom = props.editor.view.dom
  const row = chooser.value ? rows.value[active.value] : undefined
  if (row) {
    dom.setAttribute('aria-controls', listId)
    dom.setAttribute('aria-activedescendant', optionId(active.value))
  }
  else if (dom.getAttribute('aria-controls') === listId) {
    dom.removeAttribute('aria-controls')
    dom.removeAttribute('aria-activedescendant')
  }
})

onMounted(() => {
  if (props.editor.isDestroyed) return
  // First among the plugins: Tab, Enter and the arrows reach the chooser before the text's own keys.
  props.editor.registerPlugin(namesPlugin, (added, plugins) => [added, ...plugins])
  props.editor.registerPlugin(undoPlugin)
  props.editor.view.dom.addEventListener('blur', onBlur)
})

onBeforeUnmount(() => {
  close()
  if (props.editor.isDestroyed) return
  props.editor.view.dom.removeEventListener('blur', onBlur)
  props.editor.unregisterPlugin(namesKey)
  props.editor.unregisterPlugin(undoKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="chooser"
      class="fixed z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[6px] bg-(--ui-bg-floating) shadow-(--shadow-floating) ring ring-default"
      :style="position ? { left: `${position.x}px`, top: `${position.y}px` } : { left: '0px', top: '0px', visibility: 'hidden' }"
      @mousedown.prevent
    >
      <p :id="`${listId}-title`" class="px-3 pt-2.5 pb-1 text-xs font-medium text-muted">
        {{ t('editor.names.who', { name: chooser.phrase }) }}
      </p>
      <div :id="listId" role="listbox" :aria-labelledby="`${listId}-title`" class="p-1">
        <div
          v-for="(row, index) in rows"
          :id="optionId(index)"
          :key="row.key"
          role="option"
          :aria-selected="index === active"
          :data-highlighted="index === active ? '' : undefined"
          class="flex w-full cursor-pointer select-none items-center gap-2.5 rounded-[4.5px] px-2 py-1.5 text-sm text-default data-highlighted:bg-elevated data-highlighted:text-highlighted pointer-coarse:min-h-11"
          @mousedown="onRowDown($event, row)"
          @pointermove="active = index"
        >
          <template v-if="row.kind === 'character'">
            <DEntityAvatar :name="row.character.name" :image-id="store.primaryImage('character', row.character.id)" :color="row.character.color || null" size="xs" />
            <span class="flex min-w-0 flex-1 items-baseline gap-2">
              <span class="voice-author max-w-[65%] shrink-0 truncate font-semibold">{{ row.character.name }}</span>
              <span class="min-w-0 truncate text-xs text-muted">{{ enumLabel('importance', row.character.importance) }}</span>
            </span>
          </template>
          <template v-else>
            <UIcon name="i-lucide-type" class="size-4 shrink-0 text-dimmed" />
            <span class="min-w-0 flex-1 truncate">{{ t('editor.names.none') }}</span>
          </template>
        </div>
      </div>
      <p class="border-t border-default px-3 py-1.5 text-xs text-muted pointer-coarse:hidden">{{ t('editor.names.keys') }}</p>
    </div>
  </Teleport>
  <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
</template>
