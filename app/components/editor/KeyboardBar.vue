<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DialogueStyle } from '#shared/types/domain'
import { QUOTES } from './Surface.vue'
import { useToolbarFocus } from './WritingBar.vue'

/**
 * The phone's toolbar above the keyboard (spec 4.5, DESIGN.md): bold, italic, the project's quotes, the
 * dash, the ellipsis, @, with `script` a line of dialogue, with `branching` a choice, undo and redo,
 * the details. It takes the place of the bottom bar and rides on the keyboard.
 */
const props = defineProps<{
  editor: Editor | null
  quoteStyle: DialogueStyle
  script: boolean
  branching: boolean
}>()

const emit = defineEmits<{ details: [], choice: [] }>()

const { t } = useI18n()

/** Height of the on-screen keyboard over the layout viewport (iOS and Android). */
const keyboard = ref(0)
function measure() {
  const viewport = window.visualViewport
  if (!viewport) return
  keyboard.value = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
}
onMounted(() => {
  measure()
  window.visualViewport?.addEventListener('resize', measure)
  window.visualViewport?.addEventListener('scroll', measure)
})
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', measure)
  window.visualViewport?.removeEventListener('scroll', measure)
})

// Bold and italic show their state: follow the editor's transactions.
const tick = ref(0)
const bump = () => tick.value++
watch(() => props.editor, (editor, previous) => {
  previous?.off('transaction', bump)
  editor?.on('transaction', bump)
}, { immediate: true })
onBeforeUnmount(() => props.editor?.off('transaction', bump))
const isActive = (mark: string) => {
  void tick.value
  return !!props.editor?.isActive(mark)
}

const quotes = computed(() => `${QUOTES[props.quoteStyle].open}${QUOTES[props.quoteStyle].close}`)

function chain() {
  return props.editor?.chain().focus()
}

function mention() {
  const editor = props.editor
  if (!editor) return
  const { $from } = editor.state.selection
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, undefined, ' ')
  editor.chain().focus().insertContent(before && before !== ' ' ? ' @' : '@').run()
}

const buttons = computed(() => [
  { key: 'bold', label: t('editor.format.bold'), icon: 'i-lucide-bold', pressed: isActive('bold'), run: () => chain()?.toggleBold().run() },
  { key: 'italic', label: t('editor.format.italic'), icon: 'i-lucide-italic', pressed: isActive('italic'), run: () => chain()?.toggleItalic().run() },
  { key: 'quotes', label: t('editor.writingBar.quotes', { quotes: quotes.value }), text: quotes.value, run: () => chain()?.insertDialoguePunctuation('quotes').run() },
  { key: 'dash', label: t('editor.writingBar.dash'), text: '—', run: () => chain()?.insertDialoguePunctuation('dash').run() },
  { key: 'ellipsis', label: t('editor.writingBar.ellipsis'), text: '…', run: () => chain()?.insertDialoguePunctuation('ellipsis').run() },
  { key: 'mention', label: t('editor.keyboard.mention'), icon: 'i-lucide-at-sign', run: mention },
  ...(props.script ? [{ key: 'line', label: t('editor.writingBar.line'), icon: 'i-lucide-message-square-quote', run: () => chain()?.insertDialogueLine().run() }] : []),
  ...(props.branching ? [{ key: 'choice', label: t('editor.keyboard.choice'), icon: 'i-lucide-split', run: () => emit('choice') }] : []),
  { key: 'undo', label: t('common.actions.undo'), icon: 'i-lucide-undo-2', run: () => chain()?.undo().run() },
  { key: 'redo', label: t('common.actions.redo'), icon: 'i-lucide-redo-2', run: () => chain()?.redo().run() },
  { key: 'details', label: t('editor.bar.details'), icon: 'i-lucide-panel-bottom-open', run: () => emit('details') },
])

const bar = useTemplateRef<HTMLElement>('bar')
const { onKeydown, onFocusin } = useToolbarFocus(bar)
</script>

<template>
  <div
    class="d-keyboard-bar fixed inset-x-0 z-50 border-t border-default bg-default lg:hidden"
    :style="{ bottom: `${keyboard}px` }"
    :class="keyboard > 80 ? '' : 'pb-[env(safe-area-inset-bottom)]'"
  >
    <slot name="above" />
    <!-- As tall as the shell's bottom bar, which it covers (the bar should not render here at all). -->
    <div
      ref="bar"
      class="flex h-14 items-stretch overflow-x-auto overscroll-x-contain px-1"
      role="toolbar"
      :aria-label="t('editor.keyboard.label')"
      @keydown="onKeydown"
      @focusin="onFocusin"
    >
      <button
        v-for="button in buttons"
        :key="button.key"
        type="button"
        class="grid min-w-11 shrink-0 place-items-center rounded-[calc(var(--ui-radius)*1.5)] px-1.5 text-default outline-none active:bg-elevated focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
        :class="'pressed' in button && button.pressed ? 'bg-elevated text-primary' : ''"
        :aria-label="button.label"
        :aria-pressed="'pressed' in button ? button.pressed : undefined"
        :disabled="!editor"
        @pointerdown.prevent
        @click="button.run()"
      >
        <UIcon v-if="'icon' in button && button.icon" :name="button.icon" class="size-5" aria-hidden="true" />
        <span v-else class="voice-author text-lg leading-none" aria-hidden="true">{{ 'text' in button ? button.text : '' }}</span>
      </button>
    </div>
  </div>
</template>
