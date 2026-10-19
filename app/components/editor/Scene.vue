<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Editor } from '@tiptap/vue-3'
import type { EntityRef, RichDoc } from '#shared/types/domain'
import type { WritingStats } from '#shared/types/entities'
import { countCharacters, countWords, docWordCount, mentionId, richToPlainText } from '#shared/utils/richtext'
import { applyLineIds, centerCaret, scrollParent } from './Surface.vue'
import type { EditorPanel } from './TopBar.vue'
import type { PreviewRequest } from './RevisionsPanel.vue'

/**
 * The scene editor (spec 4.5, DESIGN.md "Scene editor"): the page is the canvas. A top bar and a slim
 * writing bar, the text at the measure with its position line and title, a colophon at the foot; the
 * details, revisions and find in the margin on a desktop and in drawers on a phone; focus mode.
 */
const props = defineProps<{ sceneId: string }>()

const store = useProjectStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { term } = useTerms()
const { number, words } = useFormat()
const toast = useToast()

const content = useSceneContent(props.sceneId)
const typography = useEditorTypography()
const desktop = useMediaQuery('(min-width: 1024px)')
const touch = useMediaQuery('(pointer: coarse)')
const searchOpen = useState('dramatis:search-open', () => false)

// Inside the editor the phone's bottom bar gives way to the keyboard toolbar (spec 2): the shell reads this.
const hidePhoneBar = useState('dramatis:hide-phone-bar', () => false)
onMounted(() => { hidePhoneBar.value = true })
onBeforeUnmount(() => { hidePhoneBar.value = false })

const scene = computed(() => store.get('scenes', props.sceneId))
const chapter = computed(() => store.get('chapters', scene.value?.chapterId))
const settings = computed(() => store.project?.settings ?? {})
const quoteStyle = computed(() => settings.value.dialogueStyle ?? (store.project?.language.startsWith('it') ? 'guillemets' : 'double_quotes'))
const modules = computed(() => store.modules)

useHead({ title: () => `${scene.value?.title || t('common.untitled.scene')} · ${store.project?.title ?? ''}` })

// ---------------------------------------------------------------- typography

const prefs = typography.prefs
const sans = computed(() => prefs.value.font === 'sans')
const defaultSize = computed(() => (desktop.value ? 19 : 18))
const defaultLineHeight = computed(() => Math.round(((sans.value ? 1.55 : 1.6) - (desktop.value ? 0 : 0.05)) * 100) / 100)
const manuscriptStyle = computed(() => ({
  '--manuscript-font': sans.value ? 'var(--font-readable)' : 'var(--font-serif)',
  '--manuscript-avg-char': sans.value ? '0.433em' : '0.462em',
  '--manuscript-size': `${(prefs.value.size ?? defaultSize.value) / 16}rem`,
  '--manuscript-leading': String(prefs.value.lineHeight ?? defaultLineHeight.value),
  '--manuscript-measure': String({ narrow: 60, medium: 70, wide: 80 }[prefs.value.width ?? 'medium']),
  // A break looks as the reading view and the exports print it (Settings, Writing).
  ...(settings.value.sceneSeparator?.trim() ? { '--scene-break': JSON.stringify(settings.value.sceneSeparator.trim()) } : {}),
}))

// ---------------------------------------------------------------- panels (?panel=details|revisions|find)

const PANELS = ['details', 'revisions', 'find'] as const
const PANEL_KEY = 'dramatis:editor-panel'
const panel = computed<EditorPanel | null>(() => PANELS.find(p => p === route.query.panel) ?? null)

function setPanel(next: EditorPanel | null, options: { replace?: boolean } = {}) {
  const query = { ...route.query }
  if (next) query.panel = next
  else delete query.panel
  if (next !== 'find') delete query.q
  void (options.replace ? router.replace({ query }) : router.push({ query }))
  if (desktop.value && next !== 'find') {
    try { localStorage.setItem(PANEL_KEY, next ?? '') }
    catch {}
  }
}

function togglePanel(name: EditorPanel) {
  if (name === 'find') return openFind()
  setPanel(panel.value === name ? null : name)
}

// The docked details panel comes back as the author left it, on this device.
onMounted(() => {
  if (panel.value || !desktop.value) return
  try {
    if (localStorage.getItem(PANEL_KEY) === 'details') setPanel('details', { replace: true })
  }
  catch {}
})

const findPanel = useTemplateRef<{ focus: () => void }>('findPanel')
const findRef = ref<string | null>(null)
const findText = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))

function openFind(refId?: string) {
  findRef.value = refId ?? null
  if (panel.value === 'find') {
    if (!refId) findPanel.value?.focus()
    return
  }
  setPanel('find')
}

/**
 * "Sostituisci tutto" is one step: Annulla undoes it, while nothing was written after it. The next
 * change the author makes closes the toast, so Annulla never undoes their typing instead.
 */
let replacedToast: { id: string | number } | null = null
function onReplaced(count: number) {
  const mark = { id: '' as string | number }
  mark.id = toast.add({
    title: t('editor.find.replaced', { n: number(count) }, count),
    icon: 'i-lucide-replace-all',
    actions: [{
      label: t('common.actions.undo'),
      onClick: () => {
        if (replacedToast === mark) editor.value?.commands.undo()
        replacedToast = null
      },
    }],
  }).id
  replacedToast = mark
}

function closePanel() {
  setPanel(null)
  editor.value?.commands.focus()
}

// ---------------------------------------------------------------- the editor

const editor = shallowRef<Editor | null>(null)
const counts = reactive({ words: 0, chars: 0, charsNoSpaces: 0, selection: 0 })
/** Words when the scene was opened (moved along when the text is replaced, so the session stays honest). */
const openedWords = ref<number | null>(null)
let wordsBeforeReload: number | null = null

function recount() {
  const instance = editor.value
  if (!instance || instance.isDestroyed) return
  const text = richToPlainText(instance.getJSON() as RichDoc, { speakers: false, directions: false })
  counts.words = countWords(text)
  counts.chars = countCharacters(text, true)
  counts.charsNoSpaces = countCharacters(text, false)
}
const recountSoon = useDebounceFn(recount, 150)

function onSelection() {
  const instance = editor.value
  if (!instance) return
  const { from, to, empty } = instance.state.selection
  counts.selection = empty ? 0 : docWordCount(instance.state.doc.cut(from, to).toJSON() as RichDoc)
  rememberSoon()
}

function onReady(instance: Editor) {
  editor.value = instance
  content.attach(() => instance.getJSON() as RichDoc, (sent, saved) => applyLineIds(instance, sent, saved))
  recount()
  if (openedWords.value === null) openedWords.value = counts.words
  else if (wordsBeforeReload !== null) openedWords.value += counts.words - wordsBeforeReload
  wordsBeforeReload = null
  instance.on('selectionUpdate', onSelection)
  void restorePosition(instance)
}

function onDestroy() {
  wordsBeforeReload = counts.words
  editor.value?.off('selectionUpdate', onSelection)
  content.detach()
  editor.value = null
}

function onChange() {
  content.changed()
  recountSoon()
  if (replacedToast) {
    toast.remove(replacedToast.id)
    replacedToast = null
  }
}

const session = computed(() => (openedWords.value === null ? 0 : counts.words - openedWords.value))
const todayBase = ref(0)
const today = computed(() => todayBase.value + content.writtenHere.value)

onMounted(async () => {
  void typography.load()
  await content.load()
  try {
    const stats = await $fetch<WritingStats>(`/api/projects/${store.projectId}/stats`, { query: { days: 7 } })
    todayBase.value = stats.todayAdded - content.writtenHere.value
  }
  catch {}
})

const placeholder = computed(() => (modules.value.script ? t('editor.surface.placeholderScript', { at: '@' }) : t('editor.surface.placeholder', { at: '@' })))

// ---------------------------------------------------------------- where the author was (scroll, caret)

const POSITION_KEY = `dramatis:scene-position:${props.sceneId}`

function remember() {
  const instance = editor.value
  if (!instance || instance.isDestroyed) return
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ head: instance.state.selection.head, top: scrollParent(instance.view.dom).scrollTop }))
  }
  catch {}
}
const rememberSoon = useDebounceFn(remember, 800)

async function restorePosition(instance: Editor) {
  let saved: { head: number, top: number } | null = null
  try {
    saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null')
  }
  catch {}
  await nextTick()
  requestAnimationFrame(() => {
    if (instance.isDestroyed) return
    // Opened on a search result: the find panel takes the author to the occurrence and keeps the focus.
    if (panel.value === 'find') return
    const size = instance.state.doc.content.size
    if (saved) {
      instance.commands.setTextSelection(Math.max(1, Math.min(saved.head, size - 1)))
      scrollParent(instance.view.dom).scrollTop = saved.top
    }
    // On a phone the keyboard waits for a tap.
    if (!touch.value) instance.commands.focus(undefined, { scrollIntoView: false })
  })
}

onBeforeRouteLeave(remember)
onBeforeUnmount(remember)

// ---------------------------------------------------------------- the chrome that fades, focus mode

const typing = ref(false)
/** Focus mode survives the move to the previous or next scene; leaving the editor ends it. */
const focusMode = useState('dramatis:editor-focus', () => false)
onBeforeRouteLeave(() => {
  focusMode.value = false
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
})

const fullscreen = ref(false)
useEventListener(document, 'fullscreenchange', () => { fullscreen.value = !!document.fullscreenElement })

/** The browser's full screen, from the focus strip (P1). */
function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  else void document.documentElement.requestFullscreen?.().catch(() => {})
}
const strip = ref(false)
const cornerWords = ref(true)
const cornerSave = ref(true)
let pointer = { x: -1, y: -1 }
let stripTimer: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('dramatis:focus-corner') ?? '{}') as { words?: boolean, save?: boolean }
    cornerWords.value = saved.words ?? true
    cornerSave.value = saved.save ?? true
  }
  catch {}
})
watch([cornerWords, cornerSave], () => {
  try { localStorage.setItem('dramatis:focus-corner', JSON.stringify({ words: cornerWords.value, save: cornerSave.value })) }
  catch {}
})

function showStrip() {
  strip.value = true
  clearTimeout(stripTimer)
  stripTimer = setTimeout(() => { strip.value = false }, 2000)
}

/** The strip stays while the pointer or the focus is on it. */
function holdStrip() {
  strip.value = true
  clearTimeout(stripTimer)
}

useEventListener(document, 'pointermove', (event: PointerEvent) => {
  const moved = Math.abs(event.clientX - pointer.x) + Math.abs(event.clientY - pointer.y) > 6
  pointer = { x: event.clientX, y: event.clientY }
  if (!moved) return
  typing.value = false
  if (focusMode.value && desktop.value) {
    if (event.clientY < 56) holdStrip()
    else if (strip.value) showStrip()
  }
})

function enterFocus() {
  focusMode.value = true
  typing.value = false
  if (desktop.value) showStrip()
  nextTick(() => {
    const instance = editor.value
    if (!instance) return
    instance.commands.focus()
    if (prefs.value.typewriter) centerCaret(instance.view)
    else instance.commands.scrollIntoView()
  })
}

function exitFocus() {
  focusMode.value = false
  strip.value = false
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  nextTick(() => editor.value?.commands.scrollIntoView())
}

// Capture on the window: this runs before the menus close themselves, so an open menu is still there to
// be seen (ProseMirror swallows every Escape typed in the text, so the default cannot tell).
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return
  // A menu, a popover, a drawer, the speaker list or the find field takes its own Escape first.
  if (document.querySelector('[data-dismissable-layer], .d-mention-menu, [role="listbox"][data-state="open"]')) return
  if ((document.activeElement as HTMLElement | null)?.closest('.d-line__meta, .d-find')) return
  if (focusMode.value) {
    event.preventDefault()
    exitFocus()
    return
  }
  if (typing.value) {
    typing.value = false
    return
  }
  if (panel.value && desktop.value && (document.activeElement as HTMLElement | null)?.closest('.d-inspector')) closePanel()
}, { capture: true })

// Alt+Enter opens the details everywhere; ⌘J only on a Mac, because Ctrl+J opens the browser's downloads.
const { macOS } = useKbd()
defineShortcuts(computed(() => ({
  ...(macOS.value ? { meta_j: { usingInput: true, handler: () => togglePanel('details') } } : {}),
  alt_enter: { usingInput: true, handler: () => togglePanel('details') },
  meta_f: { usingInput: true, handler: () => openFind() },
  meta_shift_enter: { usingInput: true, handler: () => (focusMode.value ? exitFocus() : enterFocus()) },
  // The palette opens from the text too.
  meta_k: { usingInput: true, handler: () => { searchOpen.value = true } },
})))

// ---------------------------------------------------------------- where the scene is

const usesParts = computed(() => settings.value.parts ?? store.isGame)
const positionLine = computed(() => {
  const current = scene.value
  const ch = chapter.value
  if (!current || !ch) return ''
  const parts: string[] = []
  if (usesParts.value && ch.partId) parts.push(`${term('part')} ${store.orderedParts.findIndex(p => p.id === ch.partId) + 1}`)
  parts.push(`${term('chapter')} ${store.chapterNumber(ch.id)}`)
  parts.push(`${term('scene')} ${store.chapterScenes(ch.id).findIndex(s => s.id === current.id) + 1}`)
  return parts.join(' · ')
})

const order = computed(() => store.orderedScenes)
const index = computed(() => order.value.findIndex(s => s.id === props.sceneId))
const previous = computed(() => order.value[index.value - 1] ?? null)
const next = computed(() => order.value[index.value + 1] ?? null)
const scenePath = (id: string) => store.refPath({ type: 'scene', id })

const title = useTemplateRef<HTMLElement>('title')
const titleVisible = ref(true)
useIntersectionObserver(title, ([entry]) => { titleVisible.value = entry?.isIntersecting ?? true }, { rootMargin: '-56px 0px 0px 0px' })

function onTitle(value: string) {
  store.patchSoon('scenes', props.sceneId, { title: value })
}

/** Enter in the title goes on to the text. */
function titleDone() {
  nextTick(() => editor.value?.commands.focus('start'))
}

// ---------------------------------------------------------------- the menu: move, trash

const chapterLabel = (id: string) => {
  const ch = store.get('chapters', id)
  return ch?.title || `${term('chapter')} ${store.chapterNumber(id)}`
}

async function moveTo(chapterId: string) {
  if (!scene.value || scene.value.chapterId === chapterId) return
  // A failed move has its own message from the store.
  const moved = await store.update('scenes', props.sceneId, { chapterId }).then(() => true, () => false)
  if (moved) toast.add({ title: t('editor.menu.moved', { chapter: chapterLabel(chapterId) }), icon: 'i-lucide-folder-input' })
}

async function trashScene() {
  await content.flush()
  const outline = `/p/${store.projectId}/manuscript`
  await navigateTo(outline)
  await store.remove('scenes', props.sceneId).catch(() => {})
}

const chapterChoices = computed(() => store.orderedChapters.map(ch => ({
  id: ch.id,
  label: chapterLabel(ch.id),
  part: ch.partId ? store.get('parts', ch.partId)?.title ?? '' : '',
})))

const menu = computed<DropdownMenuItem[][]>(() => [
  [{
    label: t('editor.menu.moveTo'),
    icon: 'i-lucide-folder-input',
    children: chapterChoices.value.map(ch => ({
      label: ch.label,
      description: ch.part || undefined,
      type: 'checkbox' as const,
      checked: ch.id === scene.value?.chapterId,
      onSelect: () => { void moveTo(ch.id) },
    })),
  }],
  [
    ...(previous.value ? [{ label: t('editor.menu.previous'), icon: 'i-lucide-arrow-up', to: scenePath(previous.value.id) }] : []),
    ...(next.value ? [{ label: t('editor.menu.next'), icon: 'i-lucide-arrow-down', to: scenePath(next.value.id) }] : []),
  ],
  [{ label: t('editor.menu.trash'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { void trashScene() } }],
].filter(group => group.length))

// Phone: the menu is a drawer of rows.
const moreOpen = ref(false)
const moveOpen = ref(false)
const typographyOpen = ref(false)

function phoneAction(run: () => void) {
  moreOpen.value = false
  run()
}

const noFocusReturn = { onCloseAutoFocus: (event: Event) => event.preventDefault() }

// ---------------------------------------------------------------- previews of revisions and history

const preview = shallowRef<PreviewRequest | null>(null)

// "Solo dialoghi": the lines alone; one of them opens the text right there.
const linesOnly = ref(false)

function openLine(pos: number) {
  linesOnly.value = false
  nextTick(() => {
    const instance = editor.value
    const node = instance?.state.doc.nodeAt(pos)
    if (!instance || !node) return
    instance.chain().focus().setTextSelection(pos + 1 + node.content.size).scrollIntoView().run()
  })
}
const currentDoc = () => (editor.value && !editor.value.isDestroyed ? editor.value.getJSON() as RichDoc : null)

/** "Confronta" from the conflict message: my text (the conflict revision) against the one now in the editor. */
function compareConflict() {
  const info = content.conflict.value
  if (!info) return
  preview.value = { kind: 'revision', id: info.conflictRevision.id, title: info.conflictRevision.label, meta: words(info.conflictRevision.wordCount), compare: true }
}

// ---------------------------------------------------------------- mentions and tags open their entity

const peek = computed({
  get: () => (typeof route.query.peek === 'string' ? route.query.peek : null),
  set: (value: string | null) => {
    const query = { ...route.query }
    if (value) query.peek = value
    else delete query.peek
    void router.push({ query })
  },
})

function openEntity(ref: EntityRef) {
  if (desktop.value) {
    peek.value = mentionId(ref.type, ref.id)
    return
  }
  remember()
  void navigateTo(store.refPath(ref))
}

const DETAILS_SNAPS = ['390px', 1]
const detailsSnap = ref<string | number | null>(DETAILS_SNAPS[0]!)
watch(panel, (value) => {
  if (value === 'details') detailsSnap.value = DETAILS_SNAPS[0]!
})

function openChoices() {
  setPanel('details')
  detailsSnap.value = 1
  setTimeout(() => document.getElementById('d-scene-flow')?.scrollIntoView({ block: 'start' }), 350)
}

// ---------------------------------------------------------------- banners

const now = ref(Date.now())
useIntervalFn(() => { now.value = Date.now() }, 5000)
const longFailure = computed(() => content.failure.value === 'network' && !!content.failingSince.value && now.value - content.failingSince.value > 30_000)

async function useMine() {
  const info = content.conflict.value
  if (!info) return
  try {
    await content.activateRevision(info.conflictRevision.id)
    toast.add({ title: t('editor.conflict.usingMine'), icon: 'i-lucide-check' })
  }
  catch (error) {
    notifyError(error)
  }
}

const loginPath = computed(() => `/login?redirect=${encodeURIComponent(route.fullPath)}`)

// ---------------------------------------------------------------- line ids need room in the margin

const mainEl = useTemplateRef<HTMLElement>('main')
const columnEl = useTemplateRef<HTMLElement>('column')
const { width: mainWidth } = useElementSize(mainEl)
const { width: columnWidth } = useElementSize(columnEl)
const narrow = computed(() => !desktop.value || (mainWidth.value - columnWidth.value) / 2 < 184)
</script>

<template>
  <div
    class="d-scene flex min-h-full shrink-0"
    :class="{ 'is-typing': typing && !focusMode, 'is-focus': focusMode }"
    :style="manuscriptStyle"
  >
    <main id="main" ref="main" class="relative flex min-w-0 flex-1 flex-col" :aria-label="term('scene')">
      <!-- Desktop: the top bar and the writing bar -->
      <header v-if="desktop && !focusMode" class="d-chrome sticky top-0 z-20 border-b border-default/60 bg-default">
        <EditorTopBar
          :scene-id="sceneId"
          :panel="panel"
          :show-title="!titleVisible"
          :menu="menu"
          :default-size="defaultSize"
          :default-line-height="defaultLineHeight"
          @panel="togglePanel"
          @focus="enterFocus"
        />
        <div class="d-column mx-auto flex h-9 w-full items-center px-4 sm:px-6">
          <EditorWritingBar v-model:lines-only="linesOnly" :editor="editor" :quote-style="quoteStyle" :script="modules.script" class="d-fade -ms-2" />
        </div>
      </header>

      <!-- Phone: back, title, save state, details, menu -->
      <header v-else-if="!desktop && !focusMode" class="d-chrome sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-default/60 bg-default px-2">
        <UButton :to="`/p/${store.projectId}/manuscript`" icon="i-lucide-arrow-left" size="lg" class="size-11 justify-center" :aria-label="t('editor.bar.back', { where: term('manuscript').toLocaleLowerCase() })" />
        <p class="voice-author min-w-0 flex-1 truncate font-semibold text-highlighted">{{ scene?.title || t('common.untitled.scene') }}</p>
        <EditorSaveState compact class="max-w-28 shrink-0" />
        <UButton icon="i-lucide-panel-bottom-open" size="lg" class="size-11 justify-center" :aria-label="t('editor.bar.details')" @click="togglePanel('details')" />
        <UButton icon="i-lucide-ellipsis" size="lg" class="size-11 justify-center" :aria-label="t('editor.bar.more')" @click="moreOpen = true" />
      </header>

      <!-- Focus mode: the strip at the top and the quiet corner -->
      <template v-if="focusMode">
        <div
          v-if="desktop"
          class="d-focus-strip fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-2 border-b border-default/60 bg-default px-4 transition-opacity duration-150 motion-reduce:transition-none"
          :class="strip ? 'opacity-100' : 'pointer-events-none opacity-0'"
          @focusin="holdStrip"
          @focusout="showStrip"
          @mouseenter="holdStrip"
          @mouseleave="showStrip"
        >
          <UButton icon="i-lucide-minimize-2" :label="t('editor.focus.exit')" @click="exitFocus" />
          <EditorSaveState class="w-44" />
          <span class="flex-1" />
          <USwitch v-model="cornerWords" :label="t('editor.focus.showWords')" size="sm" />
          <USwitch v-model="cornerSave" :label="t('editor.focus.showSave')" size="sm" />
          <UButton
            :icon="fullscreen ? 'i-lucide-shrink' : 'i-lucide-expand'"
            :label="fullscreen ? t('editor.focus.leaveFullscreen') : t('editor.focus.fullscreen')"
            :aria-pressed="fullscreen"
            size="sm"
            @click="toggleFullscreen"
          />
          <UPopover :content="{ align: 'end', sideOffset: 6 }">
            <UButton :aria-label="t('editor.bar.typography')" class="voice-author font-semibold">Aa</UButton>
            <template #content>
              <EditorTypographyMenu :default-size="defaultSize" :default-line-height="defaultLineHeight" />
            </template>
          </UPopover>
        </div>
        <!-- Phone: Fine at the top end, the save state at the top start (dimmed until something is wrong) -->
        <div v-else class="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 flex items-center justify-between gap-3">
          <EditorSaveState compact class="pointer-events-auto min-h-8 max-w-44 rounded-[calc(var(--ui-radius)*1.5)] bg-default/90 px-2" />
          <UButton class="pointer-events-auto min-h-11 px-4" variant="outline" :label="t('editor.focus.done')" @click="exitFocus" />
        </div>
        <div v-if="desktop" class="pointer-events-none fixed end-5 bottom-4 z-30 flex items-center gap-3 text-xs text-dimmed">
          <span v-if="cornerWords" class="tabular">{{ session > 0 ? `+${number(session)}` : session < 0 ? `−${number(-session)}` : number(0) }}</span>
          <EditorSaveState v-if="cornerSave || content.failure.value || content.conflict.value || content.stale.value" class="pointer-events-auto" />
        </div>
      </template>

      <div class="flex-1">
        <div ref="column" class="d-column mx-auto w-full px-4 pt-6 sm:px-6 lg:pt-16" :class="desktop ? 'pb-16' : 'pb-[calc(7rem+env(safe-area-inset-bottom))]'">
          <!-- Banners: never a toast for the state of the text -->
          <div v-if="content.conflict.value || longFailure || content.failure.value === 'signedOut' || content.failure.value === 'gone' || content.failure.value === 'invalid' || content.recovered.value" class="mb-8 space-y-3">
            <UAlert
              v-if="content.conflict.value"
              color="warning"
              variant="subtle"
              icon="i-lucide-git-fork"
              :title="t('editor.conflict.title')"
              :description="t('editor.conflict.body', { revision: content.conflict.value.conflictRevision.label })"
              :actions="[
                { label: t('editor.conflict.useMine'), color: 'warning', variant: 'solid', onClick: useMine },
                { label: t('editor.conflict.compare'), color: 'neutral', variant: 'outline', onClick: compareConflict },
                { label: term('revision', 2), color: 'neutral', variant: 'ghost', onClick: () => setPanel('revisions') },
              ]"
              close
              @update:open="(open: boolean) => !open && content.dismissConflict()"
            />
            <UAlert
              v-else-if="content.failure.value === 'signedOut'"
              color="error"
              variant="subtle"
              icon="i-lucide-log-in"
              :title="t('editor.banner.signedOut')"
              :description="t('editor.banner.keptHere')"
              :actions="[{ label: t('editor.banner.signIn'), color: 'error', variant: 'solid', to: loginPath }]"
            />
            <UAlert
              v-else-if="content.failure.value === 'gone'"
              color="error"
              variant="subtle"
              icon="i-lucide-trash-2"
              :title="t('editor.banner.gone')"
              :description="t('editor.banner.keptHere')"
              :actions="[{ label: term('trash'), color: 'error', variant: 'outline', to: `/p/${store.projectId}/trash` }]"
            />
            <UAlert
              v-else-if="content.failure.value === 'invalid'"
              color="error"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              :title="t('editor.banner.invalid')"
              :description="t('editor.banner.keptHere')"
            />
            <UAlert
              v-else-if="longFailure"
              color="error"
              variant="subtle"
              icon="i-lucide-cloud-alert"
              :title="t('editor.banner.failing')"
              :description="t('editor.banner.failingBody')"
              :actions="[{ label: t('common.actions.retry'), color: 'error', variant: 'solid', onClick: () => { void content.retryNow() } }]"
            />
            <UAlert
              v-if="content.recovered.value"
              color="info"
              variant="subtle"
              icon="i-lucide-life-buoy"
              :title="t('editor.banner.recovered')"
              close
              @update:open="(open: boolean) => !open && content.dismissRecovered()"
            />
          </div>

          <template v-if="scene">
            <p class="position-line mb-4">{{ positionLine }}</p>
            <h1 ref="title" class="mb-8">
              <DInlineText
                :model-value="scene.title"
                variant="title"
                :maxlength="300"
                :placeholder="t('common.untitled.scene')"
                :aria-label="t('editor.surface.title')"
                class="voice-author font-semibold"
                @update:model-value="onTitle"
                @keydown.enter="titleDone"
              />
            </h1>

            <div v-if="content.status.value === 'loading'" class="space-y-3" aria-busy="true">
              <USkeleton v-for="i in 7" :key="i" class="h-5" :class="i % 4 === 0 ? 'w-1/2' : 'w-full'" />
              <span class="sr-only">{{ t('common.status.loading') }}</span>
            </div>

            <DEmptyState
              v-else-if="content.status.value === 'error'"
              icon="i-lucide-cloud-off"
              :title="errorStatus(content.loadError.value) === 0 ? t('editor.load.offline') : t('editor.load.error')"
              :actions="[{ label: t('common.actions.retry'), color: 'neutral', variant: 'outline', onClick: () => { void content.load() } }]"
            />

            <template v-else>
              <EditorPreview v-if="preview" :request="preview" :current="currentDoc" @close="preview = null" />
              <EditorLinesView v-else-if="linesOnly && editor" :editor="editor" @open="openLine" @close="linesOnly = false" />
              <div v-show="!preview && !linesOnly">
                <EditorSurface
                  :key="content.loadKey.value"
                  :content="content.initial.value"
                  :editable="true"
                  :placeholder="placeholder"
                  :lang="store.project?.language ?? 'it'"
                  :quote-style="quoteStyle"
                  :smart-typography="settings.smartTypography !== false"
                  :focus-paragraph="focusMode && !!prefs.focusParagraph"
                  :typewriter="focusMode && !!prefs.typewriter"
                  :script="modules.script"
                  :touch="touch || !desktop"
                  :narrow="narrow"
                  @ready="onReady"
                  @destroy="onDestroy"
                  @change="onChange"
                  @typing="typing = true"
                  @open-entity="openEntity"
                />
              </div>
            </template>

            <!-- Previous and next scene -->
            <nav v-if="previous || next" class="mt-16 grid gap-2 border-t border-default pt-6 sm:grid-cols-2" :class="focusMode ? 'border-transparent' : ''" :aria-label="t('editor.nav.label')">
              <NuxtLink v-if="previous" :to="scenePath(previous.id)" class="group flex min-h-11 flex-col justify-center rounded-[calc(var(--ui-radius)*2)] px-3 py-2 hover:bg-elevated">
                <span class="text-xs text-muted"><UIcon name="i-lucide-arrow-left" class="me-1 size-3.5 align-[-2px]" aria-hidden="true" />{{ t('editor.nav.previous') }}</span>
                <span class="voice-author truncate font-semibold text-highlighted">{{ previous.title || t('common.untitled.scene') }}</span>
              </NuxtLink>
              <span v-else aria-hidden="true" />
              <NuxtLink v-if="next" :to="scenePath(next.id)" class="group flex min-h-11 flex-col justify-center rounded-[calc(var(--ui-radius)*2)] px-3 py-2 text-end hover:bg-elevated sm:col-start-2">
                <span class="text-xs text-muted">{{ t('editor.nav.next') }}<UIcon name="i-lucide-arrow-right" class="ms-1 size-3.5 align-[-2px]" aria-hidden="true" /></span>
                <span class="voice-author truncate font-semibold text-highlighted">{{ next.title || t('common.untitled.scene') }}</span>
              </NuxtLink>
            </nav>
          </template>
        </div>
      </div>

      <!-- The colophon -->
      <EditorColophon
        v-if="desktop && !focusMode"
        class="d-chrome sticky bottom-0 z-10 border-t border-default/60 bg-default"
        :words="counts.words"
        :chars="counts.chars"
        :chars-no-spaces="counts.charsNoSpaces"
        :selection="counts.selection"
        :session="session"
        :today="today"
      />
    </main>

    <!-- Desktop: the margin with details, revisions or find -->
    <aside
      v-if="desktop && panel && !focusMode"
      class="d-inspector d-chrome sticky top-0 flex h-dvh w-80 shrink-0 flex-col border-s border-default/70 bg-muted"
      :aria-label="panel === 'details' ? t('editor.details.title') : panel === 'revisions' ? term('revision', 2) : t('editor.find.title')"
    >
      <div class="flex h-12 shrink-0 items-center gap-2 px-4">
        <h2 class="min-w-0 flex-1 truncate text-sm font-semibold text-highlighted">
          {{ panel === 'details' ? t('editor.details.title') : panel === 'revisions' ? term('revision', 2) : t('editor.find.title') }}
        </h2>
        <UButton icon="i-lucide-x" size="sm" :aria-label="t('common.actions.close')" @click="closePanel" />
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-4 pt-1">
        <EditorDetailsPanel
          v-if="panel === 'details'"
          :scene-id="sceneId"
          :words="counts.words"
          :chars="counts.chars"
          @find="openFind"
          @open="openEntity"
        />
        <EditorRevisionsPanel v-else-if="panel === 'revisions'" :scene-id="sceneId" @preview="(r) => { preview = r }" />
        <EditorFindPanel
          v-else-if="panel === 'find' && editor"
          ref="findPanel"
          :editor="editor"
          :initial-text="findText"
          :ref-id="findRef"
          @close="closePanel"
          @replaced="onReplaced"
        />
      </div>
    </aside>

    <!-- Phone: drawers and the keyboard toolbar -->
    <template v-if="!desktop">
      <!-- The smallest snap shows status, point of view and the counts (DESIGN.md "Scene editor"). -->
      <UDrawer
        v-model:active-snap-point="detailsSnap"
        :open="panel === 'details'"
        :title="t('editor.details.title')"
        :snap-points="DETAILS_SNAPS"
        :ui="{ body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }"
        @update:open="(open: boolean) => !open && panel === 'details' && setPanel(null)"
      >
        <template #body>
          <EditorDetailsPanel :scene-id="sceneId" :words="counts.words" :chars="counts.chars" @find="openFind" @open="openEntity" />
        </template>
      </UDrawer>
      <UDrawer
        :open="panel === 'revisions'"
        :title="term('revision', 2)"
        :ui="{ content: 'max-h-[88dvh]', body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }"
        @update:open="(open: boolean) => !open && panel === 'revisions' && setPanel(null)"
      >
        <template #body>
          <EditorRevisionsPanel :scene-id="sceneId" @preview="(r) => { preview = r; setPanel(null) }" />
        </template>
      </UDrawer>
      <!-- The focus goes where the chosen action leads, not back to the ⋯ button. -->
      <UDrawer v-model:open="moreOpen" :title="t('editor.bar.more')" :content="noFocusReturn" :ui="{ body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }">
        <template #body>
          <ul class="-mx-2">
            <li><button type="button" class="d-drawer-row" @click="phoneAction(() => openFind())"><UIcon name="i-lucide-search" />{{ t('editor.bar.find') }}</button></li>
            <li><button type="button" class="d-drawer-row" @click="phoneAction(() => setPanel('revisions'))"><UIcon name="i-lucide-history" />{{ term('revision', 2) }}</button></li>
            <li><button type="button" class="d-drawer-row" @click="phoneAction(enterFocus)"><UIcon name="i-lucide-maximize-2" />{{ t('editor.bar.focus') }}</button></li>
            <li v-if="modules.script"><button type="button" class="d-drawer-row" :aria-pressed="linesOnly" @click="phoneAction(() => { linesOnly = !linesOnly })"><UIcon name="i-lucide-message-square-text" />{{ t('editor.writingBar.linesOnly') }}</button></li>
            <li><button type="button" class="d-drawer-row" @click="phoneAction(() => { typographyOpen = true })"><span class="voice-author w-5 text-center font-semibold" aria-hidden="true">Aa</span>{{ t('editor.bar.typography') }}</button></li>
            <li><button type="button" class="d-drawer-row" @click="phoneAction(() => { moveOpen = true })"><UIcon name="i-lucide-folder-input" />{{ t('editor.menu.moveTo') }}</button></li>
            <li v-if="previous"><NuxtLink :to="scenePath(previous.id)" class="d-drawer-row" @click="moreOpen = false"><UIcon name="i-lucide-arrow-up" />{{ t('editor.menu.previous') }}</NuxtLink></li>
            <li v-if="next"><NuxtLink :to="scenePath(next.id)" class="d-drawer-row" @click="moreOpen = false"><UIcon name="i-lucide-arrow-down" />{{ t('editor.menu.next') }}</NuxtLink></li>
            <li><button type="button" class="d-drawer-row text-error" @click="phoneAction(() => { void trashScene() })"><UIcon name="i-lucide-trash-2" />{{ t('editor.menu.trash') }}</button></li>
          </ul>
        </template>
      </UDrawer>
      <UDrawer v-model:open="moveOpen" :title="t('editor.menu.moveTo')" :content="noFocusReturn" :ui="{ content: 'max-h-[80dvh]', body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }">
        <template #body>
          <ul class="-mx-2">
            <li v-for="ch in chapterChoices" :key="ch.id">
              <button type="button" class="d-drawer-row" :aria-current="ch.id === scene?.chapterId ? 'true' : undefined" @click="moveOpen = false; moveTo(ch.id)">
                <UIcon :name="ch.id === scene?.chapterId ? 'i-lucide-check' : 'i-lucide-book-open'" :class="ch.id === scene?.chapterId ? 'text-primary' : ''" />
                <span class="min-w-0 flex-1 truncate text-start"><span class="voice-author">{{ ch.label }}</span><span v-if="ch.part" class="block text-xs text-muted">{{ ch.part }}</span></span>
              </button>
            </li>
          </ul>
        </template>
      </UDrawer>
      <UDrawer v-model:open="typographyOpen" :title="t('editor.bar.typography')" :ui="{ body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }">
        <template #body>
          <EditorTypographyMenu :default-size="defaultSize" :default-line-height="defaultLineHeight" class="!w-full !p-0" />
        </template>
      </UDrawer>

      <EditorKeyboardBar
        :editor="editor"
        :quote-style="quoteStyle"
        :script="modules.script"
        :branching="modules.branching"
        @details="togglePanel('details')"
        @choice="openChoices"
      >
        <template #above>
          <EditorFindPanel
            v-if="panel === 'find' && editor"
            ref="findPanel"
            compact
            :editor="editor"
            :initial-text="findText"
            :ref-id="findRef"
            class="border-b border-default"
            @close="setPanel(null)"
            @replaced="onReplaced"
          />
        </template>
      </EditorKeyboardBar>
    </template>

    <EditorEntityPeek v-if="desktop" v-model:ref-id="peek" />
  </div>
</template>

<style>
/* The manuscript column: the measure in real characters at the manuscript size (DESIGN.md "The
   manuscript"), plus the gutters. */
.d-column {
  font-size: var(--manuscript-size);
  max-width: calc(var(--manuscript-measure) * var(--manuscript-avg-char) + 3rem);
}

/* Focus mode: the page alone, above the sidebar. */
.d-scene.is-focus {
  position: fixed;
  inset: 0;
  z-index: 45;
  overflow-y: auto;
  background: var(--ui-bg);
}
.d-scene.is-focus main {
  padding-top: 3rem;
}
/* Height of the sticky bar, for what sticks under it (a preview's banner). */
.d-scene {
  --d-header: 3.5rem;
}
@media (min-width: 1024px) {
  .d-scene {
    --d-header: 5.3rem;
  }
}
.d-scene.is-focus {
  --d-header: 0px;
}

/* From the first keystroke the chrome fades to dimmed ink and loses its hairlines; an error never fades. */
.d-scene .d-chrome,
.d-scene .d-chrome .d-fade,
.d-scene .d-chrome .d-fade * {
  transition: color 150ms var(--ease-out-expo), border-color 150ms var(--ease-out-expo);
}
.d-scene.is-typing .d-chrome {
  border-color: transparent;
  transition-duration: 250ms;
}
.d-scene.is-typing .d-chrome .d-fade,
.d-scene.is-typing .d-chrome .d-fade * {
  color: var(--ui-text-dimmed);
  transition-duration: 250ms;
}
.d-scene.is-typing .d-inspector:not(:hover, :focus-within) :is(p, span, label, h2, h3, button, a) {
  color: var(--ui-text-dimmed);
}

/* Rows of the phone drawers: 44px targets. */
.d-drawer-row {
  display: flex;
  width: 100%;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.75rem;
  padding-inline: 0.5rem;
  border-radius: calc(var(--ui-radius) * 2);
  color: var(--ui-text);
  text-align: start;
}
.d-drawer-row:hover,
.d-drawer-row:focus-visible {
  background: var(--ui-bg-elevated);
}
.d-drawer-row > .iconify,
.d-drawer-row > span:first-child {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  color: var(--ui-text-muted);
}
</style>
