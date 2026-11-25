<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Editor } from '@tiptap/vue-3'
import { HIGHLIGHTERS } from '#shared/utils/constants'

/**
 * The "Evidenzia" menu of the writing bar and of the phone's keyboard bar (DESIGN.md "Highlighters"):
 * the four highlighters, the note, and off. Read from the editor each time it opens: the caret may be
 * in a highlight already. The trigger is the default slot.
 */
const props = defineProps<{ editor: Editor | null }>()

const { t } = useI18n()
const open = ref(false)
const items = ref<DropdownMenuItem[][]>([])

function build(editor: Editor): DropdownMenuItem[][] {
  const active = editor.isActive('highlight')
  const { color, note } = editor.getAttributes('highlight') as { color?: string, note?: string }
  // Something to act on: words chosen, or a highlight around the caret.
  const usable = active || !editor.state.selection.empty
  return [
    HIGHLIGHTERS.map(value => ({
      label: t(`editor.highlight.colors.${value}`),
      type: 'checkbox' as const,
      checked: active && color === value,
      slot: 'swatch' as const,
      swatch: value,
      disabled: !usable,
      onSelect: () => editor.chain().focus().setHighlighter(value).run(),
    })),
    [
      {
        label: note ? t('editor.highlight.editNote') : t('editor.highlight.addNote'),
        icon: 'i-lucide-sticky-note',
        disabled: !usable,
        onSelect: () => editor.commands.openHighlightNote(),
      },
      {
        label: t('editor.highlight.remove'),
        icon: 'i-lucide-eraser',
        disabled: !active,
        onSelect: () => editor.chain().focus().unsetHighlighter().run(),
      },
    ],
  ]
}

watch(open, (isOpen) => {
  if (isOpen && props.editor) items.value = build(props.editor)
})

/** The text takes the keyboard back (or the note card does): not the menu's button. */
const content = { align: 'start' as const, onCloseAutoFocus: (event: Event) => event.preventDefault() }
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
