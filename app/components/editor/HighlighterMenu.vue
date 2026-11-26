<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Editor } from '@tiptap/vue-3'
import { HIGHLIGHTERS } from '#shared/utils/constants'
import { highlightAt } from '~/utils/editor-extensions'

/**
 * The "Evidenzia" menu of the writing bar and of the phone's keyboard bar (DESIGN.md "Highlighters"):
 * the four highlighters, the note, and off. Read from the editor each time it opens: the caret may be
 * in a highlight already. The trigger is the default slot.
 */
const props = defineProps<{ editor: Editor | null }>()

const { t } = useI18n()
const open = ref(false)
const items = ref<DropdownMenuItem[][]>([])
/** An item ran: it placed the keyboard itself (the text, or the note card). */
let chosen = false

function build(editor: Editor): DropdownMenuItem[][] {
  const found = highlightAt(editor.state)
  const active = !!found
  const { color, note } = (found?.mark.attrs ?? {}) as { color?: string, note?: string }
  // Something to act on: words chosen, or a highlight at the caret.
  const usable = active || !editor.state.selection.empty
  const run = (action: () => void) => () => {
    chosen = true
    action()
  }
  return [
    HIGHLIGHTERS.map(value => ({
      label: t(`editor.highlight.colors.${value}`),
      type: 'checkbox' as const,
      checked: active && color === value,
      slot: 'swatch' as const,
      swatch: value,
      disabled: !usable,
      onSelect: run(() => editor.chain().focus().setHighlighter(value).run()),
    })),
    [
      {
        label: note ? t('editor.highlight.editNote') : t('editor.highlight.addNote'),
        icon: 'i-lucide-sticky-note',
        disabled: !usable,
        onSelect: run(() => editor.commands.openHighlightNote()),
      },
      {
        label: t('editor.highlight.remove'),
        icon: 'i-lucide-eraser',
        disabled: !active,
        onSelect: run(() => editor.chain().focus().unsetHighlighter().run()),
      },
    ],
  ]
}

watch(open, (isOpen) => {
  if (!isOpen || !props.editor) return
  chosen = false
  items.value = build(props.editor)
})

/** The keyboard goes back to the text (an item may have placed it already), never to the menu's button. */
const content = {
  align: 'start' as const,
  onCloseAutoFocus: (event: Event) => {
    event.preventDefault()
    if (!chosen) props.editor?.commands.focus()
  },
}
</script>

<template>
  <UDropdownMenu v-model:open="open" :items="items" :content="content" :disabled="!editor">
    <slot />
    <template #swatch-leading="{ item }">
      <span
        class="size-4 shrink-0 rounded-[3px] border border-(--ui-border-accented)"
        :style="{ background: `var(--highlight-${(item as { swatch: string }).swatch})` }"
        aria-hidden="true"
      />
    </template>
  </UDropdownMenu>
</template>
