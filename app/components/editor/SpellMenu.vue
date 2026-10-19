<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { refreshSpelling, replaceSpellError, spellSuggestions, type SpellError, type Speller } from '~/utils/spelling'

/**
 * The menu of a misspelled word, opened by a click or a tap on it: the suggestions (one replaces the
 * word), "Aggiungi al dizionario" (right from now on, in the whole project), "Ignora" (until the page
 * is reloaded). Esc or a choice brings the caret back to the text.
 */
const props = defineProps<{
  editor: Editor | null
  speller: Speller | null
  error: SpellError | null
  anchor: HTMLElement | null
}>()

const emit = defineEmits<{ close: [], add: [word: string], ignore: [word: string] }>()

const { t } = useI18n()

const open = computed({
  get: () => !!(props.error && props.anchor && props.speller),
  set: (value: boolean) => {
    if (!value) close()
  },
})

const suggestions = computed(() => (props.error && props.speller ? spellSuggestions(props.error.word, props.speller) : []))

function close() {
  emit('close')
  props.editor?.commands.focus()
}

function replace(text: string) {
  if (props.editor && props.error) {
    replaceSpellError(props.editor, props.error, text)
    refreshSpelling(props.editor)
  }
  close()
}

function add() {
  if (props.error) emit('add', props.error.word)
  close()
}

/** A menu: the arrows, Home and End move between its items (WAI-ARIA). */
function onKeydown(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]')]
  const index = items.indexOf(document.activeElement as HTMLElement)
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[next]?.focus()
}

function ignore() {
  if (props.error) emit('ignore', props.error.word)
  close()
}
</script>

<template>
  <UPopover v-model:open="open" :reference="anchor ?? undefined" :content="{ side: 'bottom', align: 'start', sideOffset: 6 }" :ui="{ content: 'p-0' }">
    <template #content>
      <div v-if="error" class="w-64 max-w-[calc(100vw-2rem)] p-1.5" role="menu" :aria-label="t('editor.spelling.menu', { word: error.word })" @keydown="onKeydown">
        <p class="px-2 pt-1 pb-1.5 text-xs text-muted">{{ suggestions.length ? t('editor.spelling.suggestions') : t('editor.spelling.noSuggestions') }}</p>
        <button
          v-for="suggestion in suggestions"
          :key="suggestion"
          type="button"
          role="menuitem"
          class="d-spell-item voice-author font-semibold text-highlighted"
          @click="replace(suggestion)"
        >
          {{ suggestion }}
        </button>
        <div class="my-1 h-px bg-(--ui-border)" role="separator" />
        <button type="button" role="menuitem" class="d-spell-item" @click="add">
          <UIcon name="i-lucide-book-plus" class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0">{{ t('editor.spelling.add') }} <span class="voice-author text-muted">{{ t('editor.spelling.quoted', { word: error.word }) }}</span></span>
        </button>
        <button type="button" role="menuitem" class="d-spell-item" @click="ignore">
          <UIcon name="i-lucide-eye-off" class="size-4 shrink-0 text-muted" aria-hidden="true" />
          {{ t('editor.spelling.ignore') }}
        </button>
      </div>
    </template>
  </UPopover>
</template>

<style>
.d-spell-item {
  display: flex;
  width: 100%;
  min-height: 2.25rem;
  align-items: center;
  gap: 0.5rem;
  border-radius: calc(var(--ui-radius) * 1.5);
  padding: 0.375rem 0.5rem;
  text-align: start;
  font-size: 0.875rem;
}
.d-spell-item:hover,
.d-spell-item:focus-visible {
  background: var(--ui-bg-elevated);
  outline: none;
}
@media (pointer: coarse) {
  .d-spell-item {
    min-height: 2.75rem;
  }
}
</style>
