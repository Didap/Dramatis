<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { TextSelection } from '@tiptap/pm/state'
import { refreshSpelling, setSpellCurrent, spellState, spellSuggestions, spellWordKey, type Speller } from '~/utils/spelling'

/**
 * "Ortografia": the words of the scene to check, one at a time, in the order of the text. Each shows
 * where it is, the suggestions (one replaces it, here or everywhere it occurs), "Aggiungi al
 * dizionario" and "Ignora"; then the next comes. Below, every word with how many times it occurs.
 * The text keeps its caret: the word on show is tinted and scrolled into view.
 */
const props = withDefaults(defineProps<{
  editor: Editor
  speller: Speller | null
  /** The spell check is on but no dictionary could be loaded. */
  failed?: boolean
  /** The phone's drawer: no room for the list of every word. */
  compact?: boolean
}>(), { failed: false, compact: false })

const emit = defineEmits<{ add: [word: string], ignore: [word: string] }>()

const { t } = useI18n()
const { number } = useFormat()

// The errors follow the editor's transactions.
const tick = ref(0)
const bump = () => tick.value++
watch(() => props.editor, (editor, previous) => {
  previous?.off('transaction', bump)
  editor?.on('transaction', bump)
}, { immediate: true })
onBeforeUnmount(() => {
  props.editor.off('transaction', bump)
  setSpellCurrent(props.editor, -1)
})

const errors = computed(() => {
  void tick.value
  return spellState(props.editor).errors
})

const index = ref(0)
const current = computed(() => errors.value[Math.min(index.value, errors.value.length - 1)] ?? null)

/** The same word elsewhere in the scene (as written, apostrophes aside). */
const sameWord = computed(() => (current.value ? errors.value.filter(e => spellWordKey(e.word) === spellWordKey(current.value!.word)) : []))
const replaceAll = ref(false)
watch(() => current.value?.word, () => { replaceAll.value = false })

const suggestions = computed(() => (current.value && props.speller ? spellSuggestions(current.value.word, props.speller) : []))

/** The sentence around the word, cut to a line or two. */
const context = computed(() => {
  const error = current.value
  if (!error) return null
  const { doc } = props.editor.state
  const $from = doc.resolve(error.from)
  const start = Math.max($from.start(), error.from - 60)
  const end = Math.min($from.end(), error.to + 60)
  return {
    before: (start > $from.start() ? '…' : '') + doc.textBetween(start, error.from, ' ', ' '),
    after: doc.textBetween(error.to, end, ' ', ' ') + (end < $from.end() ? '…' : ''),
  }
})

/** Every word to check, with how many times it occurs and where it first does. */
const words = computed(() => {
  const map = new Map<string, { word: string, count: number, first: number }>()
  errors.value.forEach((error, i) => {
    const key = spellWordKey(error.word)
    const entry = map.get(key)
    if (entry) entry.count++
    else map.set(key, { word: error.word, count: 1, first: i })
  })
  return [...map.values()]
})

/** Selects the word in the text without taking the focus, and brings it into view. */
function show(i: number) {
  const error = errors.value[i]
  if (!error) return
  index.value = i
  const { editor } = props
  setSpellCurrent(editor, i)
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, error.from, error.to)))
  const { node } = editor.view.domAtPos(error.from)
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as HTMLElement
  element?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}

function step(by: number) {
  if (!errors.value.length) return
  show((index.value + by + errors.value.length) % errors.value.length)
}

/** After a change the list is checked again; the next word takes the place of this one. */
function afterChange() {
  refreshSpelling(props.editor)
  if (errors.value.length) show(Math.min(index.value, errors.value.length - 1))
  else setSpellCurrent(props.editor, -1)
}

function replace(text: string) {
  const targets = replaceAll.value ? sameWord.value : current.value ? [current.value] : []
  const { state } = props.editor
  const tr = state.tr
  // From the end of the text, so the positions before stay true; one step for Annulla.
  for (const error of [...targets].sort((a, b) => b.from - a.from)) {
    if (state.doc.textBetween(error.from, error.to) === error.word) tr.insertText(text, error.from, error.to)
  }
  if (tr.docChanged) props.editor.view.dispatch(tr)
  afterChange()
}

function add() {
  if (!current.value) return
  emit('add', current.value.word)
  void nextTick(afterChange)
}

function ignore() {
  if (!current.value) return
  emit('ignore', current.value.word)
  void nextTick(afterChange)
}

// Opened, it starts from the word after the caret, as a search does: at once, or as soon as the
// dictionary has loaded and the words are there.
let started = false
function start() {
  if (started || !errors.value.length) return
  started = true
  const caret = props.editor.state.selection.from
  const after = errors.value.findIndex(e => e.from >= caret)
  show(after >= 0 ? after : 0)
}
watch(() => errors.value.length, start)
onMounted(() => {
  refreshSpelling(props.editor)
  start()
})
</script>

<template>
  <div class="d-spell space-y-6 pb-6">
    <p v-if="failed" class="text-sm text-pretty text-error">{{ t('editor.spelling.failed') }}</p>
    <p v-else-if="!speller" class="flex items-center gap-2 text-sm text-muted" role="status">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />{{ t('editor.spelling.loading') }}
    </p>
    <p v-else-if="!current" class="flex items-start gap-2 text-sm text-pretty text-muted" role="status">
      <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />{{ t('editor.spelling.none') }}
    </p>

    <template v-else>
      <section :aria-label="t('editor.spelling.currentLabel')">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="tabular text-xs text-muted" role="status">{{ t('editor.spelling.position', { n: number(index + 1), total: number(errors.length) }) }}</p>
          <div class="flex items-center">
            <UButton icon="i-lucide-chevron-up" size="sm" :aria-label="t('editor.spelling.previous')" class="pointer-coarse:size-11 pointer-coarse:justify-center" @click="step(-1)" />
            <UButton icon="i-lucide-chevron-down" size="sm" :aria-label="t('editor.spelling.next')" class="pointer-coarse:size-11 pointer-coarse:justify-center" @click="step(1)" />
          </div>
        </div>
        <p class="voice-author text-xl font-semibold break-words text-highlighted">{{ current.word }}</p>
        <p v-if="context" class="voice-author mt-1 text-sm text-pretty break-words text-muted">
          {{ context.before }}<mark class="rounded-sm bg-error/15 px-0.5 text-default">{{ current.word }}</mark>{{ context.after }}
        </p>

        <p class="mt-4 mb-1.5 text-xs font-medium text-muted">{{ suggestions.length ? t('editor.spelling.suggestions') : t('editor.spelling.noSuggestions') }}</p>
        <div v-if="suggestions.length" class="flex flex-wrap gap-1.5">
          <UButton
            v-for="suggestion in suggestions"
            :key="suggestion"
            :label="suggestion"
            size="sm"
            color="neutral"
            variant="outline"
            class="voice-author pointer-coarse:min-h-11"
            :aria-label="replaceAll ? t('editor.spelling.replaceAllWith', { word: current.word, with: suggestion, n: sameWord.length }) : t('editor.spelling.replaceWith', { word: current.word, with: suggestion })"
            @click="replace(suggestion)"
          />
        </div>
        <UCheckbox
          v-if="sameWord.length > 1"
          v-model="replaceAll"
          :label="t('editor.spelling.everywhere', { n: number(sameWord.length) })"
          class="mt-3"
          :ui="{ label: 'text-sm' }"
        />

        <div class="mt-4 flex flex-wrap gap-2">
          <UButton icon="i-lucide-book-plus" size="sm" color="neutral" variant="outline" :label="t('editor.spelling.add')" class="pointer-coarse:min-h-11" @click="add" />
          <UButton icon="i-lucide-eye-off" size="sm" color="neutral" variant="ghost" :label="t('editor.spelling.ignore')" class="pointer-coarse:min-h-11" @click="ignore" />
        </div>
        <p class="mt-2 text-xs text-pretty text-muted">{{ t('editor.spelling.addHint') }}</p>
      </section>

      <section v-if="!compact && words.length > 1">
        <h3 class="mb-1 text-xs font-medium text-muted">{{ t('editor.spelling.all') }}</h3>
        <ul class="-mx-2">
          <li v-for="entry in words" :key="entry.word">
            <button
              type="button"
              class="flex min-h-9 w-full items-baseline gap-2 rounded-[calc(var(--ui-radius)*1.5)] px-2 py-1.5 text-start text-sm hover:bg-elevated focus-visible:bg-elevated"
              :aria-current="current && spellWordKey(current.word) === spellWordKey(entry.word) ? 'true' : undefined"
              @click="show(entry.first)"
            >
              <span class="voice-author min-w-0 flex-1 truncate" :class="current && spellWordKey(current.word) === spellWordKey(entry.word) ? 'font-semibold text-highlighted' : 'text-default'">{{ entry.word }}</span>
              <span v-if="entry.count > 1" class="tabular text-xs text-muted">{{ t('editor.spelling.times', { n: number(entry.count) }, entry.count) }}</span>
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
