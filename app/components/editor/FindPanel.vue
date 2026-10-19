<script lang="ts">
import type { Editor } from '@tiptap/core'
import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { parseMentionId } from '#shared/utils/richtext'

/*
 * Find and replace in the open scene (spec 5.9): match case, whole word, "3 di 12", Enter and
 * Shift+Enter to move, replace one or all. Mentions and speakers are never touched: they are not
 * text. "Trova nel testo" from a tag highlights the mentions of an entity (and its lines) instead.
 */

export interface FindQuery {
  text: string
  matchCase: boolean
  wholeWord: boolean
  /** Mentions of this entity ("character:uuid") instead of a text. */
  refId: string | null
}

export interface FindMatch {
  from: number
  to: number
  /** A whole dialogue line (the entity speaks it). */
  node?: boolean
}

export interface FindState extends FindQuery {
  matches: FindMatch[]
  current: number
  decorations: DecorationSet
}

type FindMeta = Partial<FindQuery> & { current?: number, close?: boolean }

export const findKey = new PluginKey<FindState>('sceneFind')

const EMPTY: FindState = { text: '', matchCase: false, wholeWord: false, refId: null, matches: [], current: -1, decorations: DecorationSet.empty }

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function findMatches(doc: PMNode, query: FindQuery): FindMatch[] {
  const matches: FindMatch[] = []
  if (query.refId) {
    const speaker = query.refId.startsWith('character:') ? query.refId.slice('character:'.length) : null
    doc.descendants((node, pos) => {
      if (node.type.name === 'mention' && node.attrs.id === query.refId) matches.push({ from: pos, to: pos + node.nodeSize })
      else if (speaker && node.type.name === 'dialogueLine' && node.attrs.speakerId === speaker) matches.push({ from: pos, to: pos + node.nodeSize, node: true })
    })
    return matches
  }
  if (!query.text) return matches
  const source = escapeRegExp(query.text)
  const pattern = query.wholeWord ? `(?<![\\p{L}\\p{N}_])${source}(?![\\p{L}\\p{N}_])` : source
  const regexp = new RegExp(pattern, query.matchCase ? 'gu' : 'giu')
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // Inline atoms (mentions, line breaks) become a character that never matches.
    let text = ''
    node.forEach((child) => { text += child.isText ? child.text! : '￼'.repeat(child.nodeSize) })
    for (const match of text.matchAll(regexp)) {
      if (!match[0]) continue
      const from = pos + 1 + match.index!
      matches.push({ from, to: from + match[0].length })
    }
    return false
  })
  return matches
}

function decorate(doc: PMNode, matches: FindMatch[], current: number) {
  return DecorationSet.create(doc, matches.map((m, i) => {
    const attrs = { class: i === current ? 'd-find-match is-current' : 'd-find-match' }
    return m.node ? Decoration.node(m.from, m.to, attrs) : Decoration.inline(m.from, m.to, attrs)
  }))
}

export const FindReplace = Extension.create({
  name: 'sceneFind',
  addProseMirrorPlugins() {
    return [new Plugin<FindState>({
      key: findKey,
      state: {
        init: () => EMPTY,
        apply(tr, prev, _old, state) {
          const meta = tr.getMeta(findKey) as FindMeta | undefined
          if (meta?.close) return EMPTY
          if (!meta && (!tr.docChanged || (!prev.text && !prev.refId))) return prev
          const query: FindQuery = {
            text: meta?.text ?? prev.text,
            matchCase: meta?.matchCase ?? prev.matchCase,
            wholeWord: meta?.wholeWord ?? prev.wholeWord,
            refId: meta && 'refId' in meta ? meta.refId ?? null : prev.refId,
          }
          const matches = findMatches(tr.doc, query)
          let current = meta?.current ?? prev.current
          // A new search starts from the caret, like the browser's.
          if (meta && meta.current === undefined && (meta.text !== undefined || meta.refId !== undefined || meta.matchCase !== undefined || meta.wholeWord !== undefined)) {
            const after = matches.findIndex(m => m.from >= state.selection.from)
            current = after >= 0 ? after : 0
          }
          if (!matches.length) current = -1
          else current = Math.min(Math.max(current, 0), matches.length - 1)
          return { ...query, matches, current, decorations: decorate(tr.doc, matches, current) }
        },
      },
      props: {
        decorations: state => findKey.getState(state)?.decorations,
      },
    })]
  },
})

export function findState(editor: Editor): FindState {
  return findKey.getState(editor.state) ?? EMPTY
}

export function setFind(editor: Editor, query: Partial<FindQuery>) {
  editor.view.dispatch(editor.state.tr.setMeta(findKey, query))
  const state = findState(editor)
  if (state.current >= 0) goToMatch(editor, state.current)
}

export function closeFind(editor: Editor) {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(findKey, { close: true }))
}

/**
 * Brings a position to the middle of the screen. ProseMirror only scrolls to its selection while it has
 * the focus, and here the focus stays in the find field.
 */
function reveal(editor: Editor, pos: number) {
  const { view } = editor
  let scroller = view.dom.parentElement
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
  if (!scroller) return
  const box = scroller.getBoundingClientRect()
  const caret = view.coordsAtPos(pos)
  // Keep clear of the sticky bar at the top and the colophon at the foot.
  if (caret.top < box.top + 120 || caret.bottom > box.bottom - 80) {
    scroller.scrollBy({ top: caret.top - (box.top + box.height * 0.4), behavior: 'instant' })
  }
}

/** Selects a match and scrolls to it, without taking the focus away from the find field. */
export function goToMatch(editor: Editor, index: number) {
  const { matches } = findState(editor)
  const match = matches[index]
  if (!match) return
  const tr = editor.state.tr.setMeta(findKey, { current: index })
  const from = match.node ? match.from + 1 : match.from
  const to = match.node ? match.to - 1 : match.to
  tr.setSelection(TextSelection.create(tr.doc, from, Math.max(from, to)))
  editor.view.dispatch(tr)
  reveal(editor, from)
}

export function findStep(editor: Editor, direction: 1 | -1) {
  const { matches, current } = findState(editor)
  if (!matches.length) return
  goToMatch(editor, (current + direction + matches.length) % matches.length)
}

export function replaceCurrent(editor: Editor, text: string): boolean {
  const { matches, current, refId } = findState(editor)
  const match = matches[current]
  if (!match || refId) return false
  const tr = editor.state.tr
  if (text) tr.insertText(text, match.from, match.to)
  else tr.delete(match.from, match.to)
  editor.view.dispatch(tr.setMeta(findKey, { current }))
  const next = findState(editor)
  if (next.current >= 0) goToMatch(editor, next.current)
  return true
}

/** Replaces every occurrence in one step (a single undo). Returns how many. */
export function replaceAll(editor: Editor, text: string): number {
  const { matches, refId } = findState(editor)
  if (!matches.length || refId) return 0
  const tr = editor.state.tr
  for (const match of [...matches].reverse()) {
    if (text) tr.insertText(text, match.from, match.to)
    else tr.delete(match.from, match.to)
  }
  editor.view.dispatch(tr.setMeta(findKey, { current: 0 }))
  return matches.length
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  editor: Editor
  /** Phone: one compact bar above the keyboard toolbar. */
  compact?: boolean
  initialText?: string
  /** Start on the mentions of an entity ("Trova nel testo"). */
  refId?: string | null
}>(), { compact: false, initialText: '', refId: null })

const emit = defineEmits<{ close: [], replaced: [count: number] }>()

const { t } = useI18n()
const { number } = useFormat()
const store = useProjectStore()

const text = ref(props.initialText)
const replacement = ref('')
const matchCase = ref(false)
const wholeWord = ref(false)
const showReplace = ref(!props.compact)
const mode = ref<'text' | 'ref'>(props.refId ? 'ref' : 'text')
const refId = ref(props.refId)
const state = shallowRef<FindState>(findState(props.editor))
const input = useTemplateRef<{ inputRef: HTMLInputElement | null }>('input')

const refName = computed(() => {
  const ref = parseMentionId(refId.value)
  return ref ? store.refLabel(ref) : ''
})

function sync() {
  state.value = findState(props.editor)
}

onMounted(() => {
  props.editor.on('transaction', sync)
  run()
  // On a phone the find bar often opens from a drawer that is still closing: wait for it.
  if (mode.value === 'text') setTimeout(() => input.value?.inputRef?.select(), props.compact ? 380 : 0)
})
onBeforeUnmount(() => {
  props.editor.off('transaction', sync)
  closeFind(props.editor)
})

function run() {
  if (mode.value === 'ref') setFind(props.editor, { refId: refId.value, text: '' })
  else setFind(props.editor, { refId: null, text: text.value, matchCase: matchCase.value, wholeWord: wholeWord.value })
}

watch([text, matchCase, wholeWord], () => {
  if (mode.value === 'text') run()
})
watch(() => props.refId, (value) => {
  if (!value) return
  refId.value = value
  mode.value = 'ref'
  run()
})
watch(() => props.initialText, (value) => {
  if (!value) return
  mode.value = 'text'
  text.value = value
})

function searchText() {
  mode.value = 'text'
  run()
  nextTick(() => input.value?.inputRef?.focus())
}

/** Puts the focus back in the find field (⌘F while the panel is open). */
function focus() {
  if (mode.value === 'ref') searchText()
  else input.value?.inputRef?.select()
}
defineExpose({ focus })

const total = computed(() => state.value.matches.length)
const position = computed(() => (total.value ? t('editor.find.count', { current: number(state.value.current + 1), total: number(total.value) }) : ''))
/** Phone: icon buttons are 44px touch targets. */
const touchClass = computed(() => (props.compact ? 'size-11 justify-center' : ''))

function onFindKey(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  findStep(props.editor, event.shiftKey ? -1 : 1)
}

function onReplaceKey(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  replaceOne()
}

/** Esc closes the panel from any of its fields, buttons and boxes. */
function onEscape(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  event.preventDefault()
  emit('close')
}

function replaceOne() {
  replaceCurrent(props.editor, replacement.value)
}

/**
 * "Sostituisci tutto" (spec 5.9.4): the text goes to the server first, and the save that carries the
 * replacement asks the server to keep a version of the text as it was. When the text cannot be saved
 * now, the button waits.
 */
const scene = useOpenScene()
const replacing = ref(false)
async function replaceEvery() {
  if (replacing.value) return
  replacing.value = true
  const saved = await scene.flush().finally(() => { replacing.value = false })
  if (!saved || !findState(props.editor).matches.length) return
  scene.beforeBulk()
  const count = replaceAll(props.editor, replacement.value)
  if (count) emit('replaced', count)
}
const unsaved = computed(() => !!scene.failure.value || scene.stale.value)

/** A few words around each match, for the list of results. */
function context(match: FindMatch) {
  const doc = props.editor.state.doc
  const $from = doc.resolve(match.node ? match.from + 1 : match.from)
  const start = $from.start()
  const end = $from.end()
  const from = match.node ? match.from + 1 : match.from
  const to = match.node ? match.to - 1 : match.to
  // Mentions read as their text in the snippets.
  const leaf = (node: PMNode) => (node.type.name === 'mention' ? String(node.attrs.label ?? '') : ' ')
  const before = doc.textBetween(Math.max(start, from - 40), from, ' ', leaf)
  const hit = doc.textBetween(from, Math.min(to, end), ' ', leaf)
  const after = doc.textBetween(Math.min(to, end), Math.min(end, to + 60), ' ', leaf)
  return { before: (from - 40 > start ? '…' : '') + before.trimStart(), hit, after }
}

const results = computed(() => (props.compact ? [] : state.value.matches.slice(0, 200).map((m, i) => ({ i, ...context(m) }))))
</script>

<template>
  <section class="d-find" :class="compact ? 'd-find--compact' : ''" :aria-label="t('editor.find.title')" @keydown.esc="onEscape">
    <!-- Mentions of an entity -->
    <template v-if="mode === 'ref'">
      <div class="flex items-center gap-2" :class="compact ? 'px-3 py-2' : ''">
        <p class="min-w-0 flex-1 truncate text-sm">
          {{ t('editor.find.mentionsOf') }} <span class="voice-author font-semibold text-highlighted">{{ refName }}</span>
        </p>
        <span class="tabular shrink-0 text-xs text-muted" aria-live="polite">{{ position || t('editor.find.none') }}</span>
        <UButton icon="i-lucide-chevron-up" :size="compact ? 'lg' : 'sm'" :class="touchClass" :aria-label="t('editor.find.previous')" :disabled="!total" @click="findStep(editor, -1)" />
        <UButton icon="i-lucide-chevron-down" :size="compact ? 'lg' : 'sm'" :class="touchClass" :aria-label="t('editor.find.next')" :disabled="!total" @click="findStep(editor, 1)" />
        <UButton v-if="compact" icon="i-lucide-x" size="lg" :class="touchClass" :aria-label="t('common.actions.close')" @click="emit('close')" />
      </div>
      <UButton v-if="!compact" variant="link" size="sm" class="mt-1 px-0" :label="t('editor.find.searchText')" @click="searchText" />
    </template>

    <!-- A text -->
    <template v-else>
      <div class="flex items-center gap-1.5" :class="compact ? 'px-2 pt-2' : ''">
        <label class="sr-only" for="d-find-text">{{ t('editor.find.label') }}</label>
        <UInput
          id="d-find-text"
          ref="input"
          v-model="text"
          :placeholder="t('editor.find.placeholder')"
          icon="i-lucide-search"
          size="md"
          class="min-w-0 flex-1"
          :ui="{ base: 'pe-16' }"
          autocomplete="off"
          enterkeyhint="search"
          @keydown="onFindKey"
        >
          <template #trailing>
            <span class="tabular text-xs text-muted" aria-live="polite">{{ text ? (position || t('editor.find.none')) : '' }}</span>
          </template>
        </UInput>
        <UButton icon="i-lucide-chevron-up" :size="compact ? 'lg' : 'md'" :class="touchClass" :aria-label="t('editor.find.previous')" :disabled="!total" @click="findStep(editor, -1)" />
        <UButton icon="i-lucide-chevron-down" :size="compact ? 'lg' : 'md'" :class="touchClass" :aria-label="t('editor.find.next')" :disabled="!total" @click="findStep(editor, 1)" />
        <UButton v-if="compact" :icon="showReplace ? 'i-lucide-chevrons-up' : 'i-lucide-replace'" size="lg" :class="touchClass" :aria-label="t('editor.find.toggleReplace')" :aria-expanded="showReplace" @click="showReplace = !showReplace" />
        <UButton v-if="compact" icon="i-lucide-x" size="lg" :class="touchClass" :aria-label="t('common.actions.close')" @click="emit('close')" />
      </div>

      <div class="flex flex-wrap gap-x-4 gap-y-1" :class="compact ? 'px-3' : 'mt-2.5'">
        <UCheckbox v-model="matchCase" :label="t('editor.find.matchCase')" :size="compact ? 'md' : 'sm'" :class="compact ? 'min-h-11 items-center' : ''" />
        <UCheckbox v-model="wholeWord" :label="t('editor.find.wholeWord')" :size="compact ? 'md' : 'sm'" :class="compact ? 'min-h-11 items-center' : ''" />
      </div>

      <div v-if="showReplace" class="space-y-2" :class="compact ? 'px-2 pt-2 pb-2' : 'mt-4'">
        <label class="sr-only" for="d-find-replace">{{ t('editor.find.replaceLabel') }}</label>
        <UInput
          id="d-find-replace"
          v-model="replacement"
          :placeholder="t('editor.find.replacePlaceholder')"
          icon="i-lucide-replace"
          size="md"
          class="w-full"
          autocomplete="off"
          @keydown="onReplaceKey"
        />
        <div class="flex flex-wrap gap-2">
          <UButton variant="outline" :size="compact ? 'lg' : 'sm'" :class="compact ? 'min-h-11' : ''" :label="t('editor.find.replace')" :disabled="!total" @click="replaceOne" />
          <UButton
            variant="outline"
            :size="compact ? 'lg' : 'sm'"
            :class="compact ? 'min-h-11' : ''"
            :label="t('editor.find.replaceAll', { n: number(total) }, total)"
            :loading="replacing"
            :disabled="!total || unsaved"
            :aria-describedby="unsaved ? 'd-find-waits' : undefined"
            @click="replaceEvery"
          />
        </div>
        <p v-if="unsaved && total" id="d-find-waits" class="text-xs text-muted">{{ t('editor.find.replaceAllWaits') }}</p>
      </div>
      <div v-else-if="compact" class="h-2" />
    </template>

    <ol v-if="results.length" class="mt-5 space-y-0.5" :aria-label="t('editor.find.results')">
      <li v-for="r in results" :key="r.i">
        <button
          type="button"
          class="w-full rounded-[calc(var(--ui-radius)*1.5)] px-2 py-1.5 text-start text-sm text-muted outline-none hover:bg-elevated focus-visible:bg-elevated"
          :class="r.i === state.current ? 'bg-elevated text-default' : ''"
          :aria-current="r.i === state.current ? 'true' : undefined"
          @click="goToMatch(editor, r.i)"
        >
          <span class="voice-author">{{ r.before }}<mark class="d-find-hit">{{ r.hit }}</mark>{{ r.after }}</span>
        </button>
      </li>
    </ol>
    <p v-if="!compact && total > 200" class="mt-2 text-xs text-muted">{{ t('editor.find.more', { n: number(total - 200) }) }}</p>
  </section>
</template>

<style>
.d-find-match {
  background: var(--ui-bg-accented);
  border-radius: 1px;
}
.d-find-match.is-current {
  background: var(--ui-selection);
  outline: 1px solid var(--ui-primary);
}
.d-line.d-find-match {
  background: transparent;
  outline: 1px dashed var(--ui-border-accented);
  outline-offset: 2px;
}
.d-line.d-find-match.is-current {
  outline: 2px solid var(--ui-primary);
}
.d-find-hit {
  background: var(--ui-bg-accented);
  color: var(--ui-text-highlighted);
  border-radius: 1px;
}
</style>
