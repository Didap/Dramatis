<script setup lang="ts">
/**
 * The colophon at the foot of the page (DESIGN.md "Scene editor"): "Salvato · 412 parole · oggi 1.240".
 * The word count opens every count (characters with and without spaces, this session, today).
 */
const props = defineProps<{
  words: number
  chars: number
  charsNoSpaces: number
  selection: number
  session: number
  today: number
}>()

const { t } = useI18n()
const { number, words: wordsLabel } = useFormat()

const wordsText = computed(() => (props.selection
  ? t('editor.counts.selectedOf', { n: number(props.selection), total: wordsLabel(props.words) }, props.selection)
  : wordsLabel(props.words)))
</script>

<template>
  <footer class="d-colophon flex h-9 items-center gap-2 px-4 text-xs text-muted sm:px-6">
    <EditorSaveState class="min-w-36 shrink-0" />
    <span class="d-fade-rule" aria-hidden="true">·</span>
    <UPopover :content="{ side: 'top', align: 'start', sideOffset: 6 }">
      <button
        type="button"
        class="d-fade tabular rounded-[calc(var(--ui-radius)*1.5)] px-1 py-0.5 hover:text-highlighted focus-visible:text-highlighted"
        :aria-label="t('editor.counts.open', { words: wordsText })"
      >
        {{ wordsText }}
      </button>
      <template #content>
        <div class="w-72 p-4">
          <p class="mb-3 text-sm font-semibold text-highlighted">{{ t('editor.counts.title') }}</p>
          <EditorCounts v-bind="props" />
        </div>
      </template>
    </UPopover>
    <span class="d-fade-rule" aria-hidden="true">·</span>
    <span class="d-fade tabular">{{ t('editor.counts.todayShort', { n: number(today) }) }}</span>
  </footer>
</template>
