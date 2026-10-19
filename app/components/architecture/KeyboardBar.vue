<script setup lang="ts">
import type { Editor } from '@tiptap/core'

/**
 * The bar above the phone keyboard (spec 4.3: "full-screen editor with the keyboard toolbar") for the
 * rich text fields inside `target`: bold, italic, list, a mention, undo, redo and "Fine" to put the
 * keyboard away. It follows the visual viewport, so it sits on the keyboard on iOS and Android alike.
 * Below lg only, and only while a text inside `target` has the focus. The editor keeps the caret clear
 * of the bar and of the page's header, and a spacer as tall as the keyboard lets the last line rise.
 */
const props = defineProps<{ target: HTMLElement | null | undefined }>()

const { t } = useI18n()
const phone = useMediaQuery('(max-width: 1023.98px)')
const bar = ref<HTMLElement | null>(null)
const editor = shallowRef<Editor | null>(null)
const focused = ref(false)
/** How far the bar rises to sit on the keyboard, and how tall the keyboard is. */
const offset = ref(0)
const keyboard = ref(0)
const active = reactive({ bold: false, italic: false, bulletList: false })

function editorOf(node: EventTarget | null): Editor | null {
  // TipTap keeps its instance on the editable element.
  const dom = (node as HTMLElement | null)?.closest?.('.ProseMirror') as (HTMLElement & { editor?: Editor }) | null
  return dom?.editor ?? null
}

function refresh() {
  const e = editor.value
  if (!e) return
  active.bold = e.isActive('bold')
  active.italic = e.isActive('italic')
  active.bulletList = e.isActive('bulletList')
}

watch(editor, (next, previous) => {
  previous?.off('transaction', refresh)
  next?.on('transaction', refresh)
  refresh()
})
onBeforeUnmount(() => editor.value?.off('transaction', refresh))

useEventListener(() => props.target ?? null, 'focusin', (event: FocusEvent) => {
  const found = editorOf(event.target)
  if (!found || !found.isEditable) return
  editor.value = found
  focused.value = true
})
useEventListener(() => props.target ?? null, 'focusout', (event: FocusEvent) => {
  if (bar.value?.contains(event.relatedTarget as Node | null)) return
  focused.value = false
})
useEventListener(bar, 'focusout', (event: FocusEvent) => {
  const next = event.relatedTarget as Node | null
  if (bar.value?.contains(next) || props.target?.contains(next)) return
  focused.value = false
})

function place() {
  const viewport = window.visualViewport
  offset.value = viewport ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)) : 0
  keyboard.value = viewport ? Math.max(0, Math.round(window.innerHeight - viewport.height)) : 0
}
onMounted(() => {
  place()
  window.visualViewport?.addEventListener('resize', place)
  window.visualViewport?.addEventListener('scroll', place)
})
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', place)
  window.visualViewport?.removeEventListener('scroll', place)
})

const visible = computed(() => phone.value && focused.value && !!editor.value)

/** Room kept around the caret when the editor scrolls it into view: the page's sticky bar, the keyboard and this bar. */
const HEADER_ROOM = 72
function reserve() {
  const e = editor.value
  if (!e || e.isDestroyed) return
  const bottom = visible.value ? offset.value + (bar.value?.offsetHeight || 56) + 16 : 16
  const now = e.view.props.scrollMargin
  if (typeof now === 'object' && now.top === HEADER_ROOM && now.bottom === bottom) return
  e.view.setProps({
    scrollMargin: { top: HEADER_ROOM, bottom, left: 5, right: 5 },
    scrollThreshold: { top: HEADER_ROOM, bottom, left: 0, right: 0 },
  })
}
watch([editor, visible, offset], () => nextTick(reserve))

function run(action: 'bold' | 'italic' | 'bulletList' | 'mention' | 'undo' | 'redo' | 'done') {
  const e = editor.value
  if (!e) return
  const chain = e.chain().focus()
  switch (action) {
    case 'bold': chain.toggleBold().run(); break
    case 'italic': chain.toggleItalic().run(); break
    case 'bulletList': chain.toggleBulletList().run(); break
    case 'mention': chain.insertContent('@').run(); break
    case 'undo': chain.undo().run(); break
    case 'redo': chain.redo().run(); break
    case 'done':
      e.commands.blur()
      focused.value = false
      break
  }
}

const buttons = computed(() => [
  { action: 'bold' as const, icon: 'i-lucide-bold', label: t('architecture.keyboard.bold'), pressed: active.bold },
  { action: 'italic' as const, icon: 'i-lucide-italic', label: t('architecture.keyboard.italic'), pressed: active.italic },
  { action: 'bulletList' as const, icon: 'i-lucide-list', label: t('architecture.keyboard.list'), pressed: active.bulletList },
  { action: 'mention' as const, icon: 'i-lucide-at-sign', label: t('architecture.keyboard.mention') },
  { action: 'undo' as const, icon: 'i-lucide-undo-2', label: t('common.actions.undo') },
  { action: 'redo' as const, icon: 'i-lucide-redo-2', label: t('common.actions.redo') },
])
</script>

<template>
  <div v-if="visible && keyboard" aria-hidden="true" :style="{ height: `${keyboard}px` }" />
  <div
    v-show="visible"
    ref="bar"
    role="toolbar"
    :aria-label="t('architecture.keyboard.label')"
    class="fixed inset-x-0 bottom-0 z-50 flex h-14 items-center gap-0.5 border-t border-default bg-default px-1"
    :class="offset < 1 ? 'box-content pb-[env(safe-area-inset-bottom)]' : ''"
    :style="{ transform: offset ? `translateY(-${offset}px)` : undefined }"
  >
    <UButton
      v-for="button in buttons"
      :key="button.action"
      :icon="button.icon"
      color="neutral"
      :variant="button.pressed ? 'soft' : 'ghost'"
      size="lg"
      square
      class="size-11 justify-center"
      :aria-label="button.label"
      :aria-pressed="button.pressed === undefined ? undefined : button.pressed"
      @pointerdown.prevent
      @click="run(button.action)"
    />
    <span class="flex-1" />
    <UButton
      color="neutral"
      variant="ghost"
      size="lg"
      class="min-h-11"
      :label="t('architecture.keyboard.done')"
      @pointerdown.prevent
      @click="run('done')"
    />
  </div>
</template>
