<script setup lang="ts">
/**
 * The note of a highlight (VRS-643): a small card under the highlighted words. What is typed is kept
 * when the card closes, however it closes, as everywhere else in the editor; "Togli la nota" empties
 * it. ⌘Enter closes it too.
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  anchor: HTMLElement | null
  note: string
  /** The highlighted words, for the card's label. */
  excerpt: string
}>()
/** The card closed, with the note as it now reads; `back`: closed from the card, the text takes the keyboard. */
const emit = defineEmits<{ close: [note: string, back: boolean] }>()

const { t } = useI18n()
const draft = ref('')
/** Closed from the card (Fatto, ⌘Enter, Esc), not by a click elsewhere. */
let back = false

watch(open, (isOpen) => {
  if (isOpen) {
    draft.value = props.note
    back = false
  }
  else emit('close', draft.value.trim(), back)
})

function close() {
  back = true
  open.value = false
}

function removeNote() {
  draft.value = ''
  close()
}

/** The editor takes the keyboard back itself: the card does not return it to the highlight. */
const content = {
  side: 'bottom' as const,
  align: 'start' as const,
  sideOffset: 6,
  collisionPadding: 12,
  onCloseAutoFocus: (event: Event) => event.preventDefault(),
  onEscapeKeyDown: () => {
    back = true
  },
}
</script>

<template>
  <UPopover v-model:open="open" :reference="anchor ?? undefined" :content="content" :ui="{ content: 'p-0' }">
    <template #content>
      <form class="w-80 max-w-[calc(100vw-2rem)] space-y-3 p-4" @submit.prevent="close">
        <p id="highlight-note-label" class="line-clamp-2 text-sm text-muted">
          {{ t('editor.highlight.noteOn') }} <span class="voice-author italic text-default">{{ excerpt }}</span>
        </p>
        <UTextarea
          v-model="draft"
          autofocus
          autoresize
          :rows="3"
          :maxrows="10"
          :maxlength="2000"
          :placeholder="t('editor.highlight.notePlaceholder')"
          aria-labelledby="highlight-note-label"
          class="w-full"
          :ui="{ base: 'text-base sm:text-sm' }"
          @keydown.meta.enter.prevent="close"
          @keydown.ctrl.enter.prevent="close"
        />
        <div class="flex flex-wrap items-center gap-2">
          <UButton type="submit" size="sm" color="primary" variant="subtle" class="max-lg:min-h-11" :label="t('editor.highlight.done')" />
          <UButton
            v-if="note"
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            class="max-lg:min-h-11"
            :label="t('editor.highlight.removeNote')"
            @click="removeNote"
          />
        </div>
      </form>
    </template>
  </UPopover>
</template>
