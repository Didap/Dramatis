<script lang="ts">
import type { Ref } from 'vue'

/**
 * A toolbar is one Tab stop (WAI-ARIA toolbar): the arrow keys, Home and End move between its buttons,
 * and Tab comes back to the one used last. Also the phone's keyboard toolbar.
 */
export function useToolbarFocus(root: Ref<HTMLElement | null | undefined>) {
  let last: HTMLButtonElement | null = null
  const buttons = () => [...(root.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]

  function settle() {
    const list = buttons()
    const stop = last && list.includes(last) && !last.disabled ? last : list.find(b => !b.disabled) ?? null
    for (const button of list) button.tabIndex = button === stop ? 0 : -1
  }

  function onKeydown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const list = buttons().filter(b => !b.disabled)
    const index = list.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length
    list[next]?.focus()
  }

  function onFocusin(event: FocusEvent) {
    const button = (event.target as HTMLElement | null)?.closest?.('button')
    if (!button || !root.value?.contains(button)) return
    last = button
    settle()
  }

  onMounted(settle)
  onUpdated(settle)
  return { onKeydown, onFocusin }
}
</script>

<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DialogueStyle } from '#shared/types/domain'
import { QUOTES } from './Surface.vue'

/**
 * The slim writing bar under the top bar (spec 4.5): the project's dialogue punctuation, the dash, the
 * ellipsis, and with `script` a line of dialogue. The buttons never take the caret away from the text.
 */
const props = defineProps<{
  editor: Editor | null
  quoteStyle: DialogueStyle
  script: boolean
}>()

const linesOnly = defineModel<boolean>('linesOnly', { default: false })
const { t } = useI18n()

const quotes = computed(() => `${QUOTES[props.quoteStyle].open} ${QUOTES[props.quoteStyle].close}`)

function punctuation(kind: 'quotes' | 'dash' | 'ellipsis') {
  props.editor?.chain().focus().insertDialoguePunctuation(kind).run()
}

function line() {
  props.editor?.chain().focus().insertDialogueLine().run()
}

const bar = useTemplateRef<HTMLElement>('bar')
const { onKeydown, onFocusin } = useToolbarFocus(bar)
</script>

<template>
  <div ref="bar" class="d-writing-bar flex items-center gap-0.5" role="toolbar" :aria-label="t('editor.writingBar.label')" @keydown="onKeydown" @focusin="onFocusin">
    <UTooltip :text="t('editor.writingBar.quotesHint')">
      <UButton
        size="sm"
        class="voice-author min-w-9 justify-center text-base"
        :aria-label="t('editor.writingBar.quotes', { quotes })"
        :disabled="!editor"
        @mousedown.prevent
        @click="punctuation('quotes')"
      >
        {{ quotes }}
      </UButton>
    </UTooltip>
    <UTooltip :text="quoteStyle === 'dash' ? t('editor.writingBar.dialogueDashHint') : t('editor.writingBar.dashHint')">
      <UButton size="sm" class="voice-author min-w-9 justify-center text-base" :aria-label="t('editor.writingBar.dash')" :disabled="!editor" @mousedown.prevent @click="punctuation('dash')">
        —
      </UButton>
    </UTooltip>
    <UTooltip :text="t('editor.writingBar.ellipsisHint')">
      <UButton size="sm" class="voice-author min-w-9 justify-center text-base" :aria-label="t('editor.writingBar.ellipsis')" :disabled="!editor" @mousedown.prevent @click="punctuation('ellipsis')">
        …
      </UButton>
    </UTooltip>
    <template v-if="script">
      <span class="mx-1.5 h-4 w-px bg-(--ui-border)" aria-hidden="true" />
      <UTooltip :text="t('editor.writingBar.lineHint')">
        <UButton size="sm" icon="i-lucide-message-square-quote" :label="t('editor.writingBar.line')" :disabled="!editor || linesOnly" @mousedown.prevent @click="line" />
      </UTooltip>
      <UTooltip :text="t('editor.writingBar.linesOnlyHint')">
        <UButton
          size="sm"
          icon="i-lucide-message-square-text"
          :label="t('editor.writingBar.linesOnly')"
          :aria-pressed="linesOnly"
          :color="linesOnly ? 'primary' : 'neutral'"
          :variant="linesOnly ? 'soft' : 'ghost'"
          :disabled="!editor"
          @click="linesOnly = !linesOnly"
        />
      </UTooltip>
    </template>
  </div>
</template>
