<script lang="ts">
import type { Editor } from '@tiptap/core'
import { Extension, InputRule, canInsertNode, isNodeSelection, nodeInputRule } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import type { RichDoc } from '#shared/types/domain'
import { extractDialogueLines } from '#shared/utils/richtext'
import LineView from './LineView.vue'

/*
 * The editing side of the scene's text: smart typography, the scene break, script lines, the state of
 * mentions, paste cleanup, paragraph focus and typewriter scrolling. The schema shared with the
 * read-only views lives in RichView.vue, find and replace in FindPanel.vue.
 */

/** Meta of a transaction made by the app (names, line ids), not by the author: it is not a change to save. */
export const SYNC = 'dramatisSync'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sceneEditor: {
      insertSceneBreak: () => ReturnType
      /** The current paragraph becomes a line of dialogue, or a new line follows the current block. */
      insertDialogueLine: () => ReturnType
      insertDialoguePunctuation: (kind: 'quotes' | 'dash' | 'ellipsis') => ReturnType
    }
  }
}

export interface QuoteStyle {
  enabled: boolean
  /** The dialogue punctuation of the project: guillemets, double quotes or the dash. */
  style: 'guillemets' | 'double_quotes' | 'dash'
}

export const QUOTES = {
  guillemets: { open: '«', close: '»' },
  double_quotes: { open: '“', close: '”' },
  dash: { open: '“', close: '”' },
} as const

/**
 * Smart typography (spec 6): straight quotes become the project's, -- an em dash, ... an ellipsis,
 * << and >> guillemets. Backspace right after a replacement brings the typed characters back.
 */
const SmartTypography = Extension.create<{ settings: () => QuoteStyle }>({
  name: 'smartTypography',
  addOptions: () => ({ settings: () => ({ enabled: true, style: 'guillemets' as const }) }),
  addInputRules() {
    const settings = this.options.settings
    const rule = (find: RegExp, replace: () => string) => new InputRule({
      find,
      handler: ({ state, range, match }) => {
        if (!settings().enabled) return null
        // As TipTap's textInputRule: only the captured group is replaced.
        let insert = replace()
        let start = range.from
        const end = range.to
        if (match[1]) {
          const offset = match[0].lastIndexOf(match[1])
          insert += match[0].slice(offset + match[1].length)
          start += offset
          const cutOff = start - end
          if (cutOff > 0) {
            insert = match[0].slice(offset - cutOff, offset) + insert
            start = end
          }
        }
        state.tr.insertText(insert, start, end)
      },
    })
    return [
      rule(/--$/, () => '—'),
      rule(/\.\.\.$/, () => '…'),
      rule(/<<$/, () => '«'),
      rule(/>>$/, () => '»'),
      rule(/(?:^|[\s{[(<'"‘“«])(")$/, () => QUOTES[settings().style].open),
      rule(/"$/, () => QUOTES[settings().style].close),
      rule(/(?:^|[\s{[(<'"‘“«])(')$/, () => '‘'),
      rule(/'$/, () => '’'),
    ]
  },
  addCommands() {
    const settings = this.options.settings
    return {
      insertDialoguePunctuation: kind => ({ state, tr, dispatch }) => {
        const { from, to, empty, $from } = state.selection
        if (!$from.parent.isTextblock) return false
        const style = settings().style
        const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
        if (kind === 'ellipsis') {
          if (dispatch) tr.insertText('…', from, to)
          return true
        }
        if (kind === 'dash') {
          // With the dialogue dash it opens a line ("— Vieni") and closes an aside (" — disse"); elsewhere it is a plain dash.
          const spaced = !before.trim() || /\s$/.test(before) ? '— ' : ' — '
          if (dispatch) tr.insertText(style === 'dash' ? spaced : '—', from, to)
          return true
        }
        const { open, close } = QUOTES[style]
        if (!empty) {
          if (dispatch) tr.insertText(close, to).insertText(open, from)
          return true
        }
        const after = $from.parent.textBetween($from.parentOffset, Math.min($from.parent.content.size, $from.parentOffset + 1), undefined, '￼')
        if (after === close) {
          // Closed by the toolbar: step over the closing quote.
          if (dispatch) tr.setSelection(TextSelection.create(tr.doc, from + 1))
          return true
        }
        const opened = before.split(open).length - before.split(close).length > 0
        if (dispatch) {
          if (opened) tr.insertText(close, from)
          else tr.insertText(open + close, from).setSelection(TextSelection.create(tr.doc, from + open.length))
        }
        return true
      },
    }
  },
})

/**
 * The break between two sections of a scene (* * *). Typed as --- or *** on an empty line, and
 * pasted horizontal rules become breaks too.
 */
const ManuscriptBreak = SceneBreak.extend({
  priority: 150,
  parseHTML() {
    return [{ tag: 'hr[data-scene-break]' }, { tag: 'hr', priority: 60 }, { tag: 'div[data-type="horizontalRule"]', priority: 60 }]
  },
  addInputRules() {
    return [nodeInputRule({ find: /^(?:---|—-|\*\*\*\s|\* \* \*\s)$/, type: this.type })]
  },
  addCommands() {
    return {
      insertSceneBreak: () => ({ chain, state }) => {
        if (!canInsertNode(state, state.schema.nodes[this.name]!)) return false
        const current = chain()
        if (isNodeSelection(state.selection)) current.insertContentAt(state.selection.$to.pos, { type: this.name })
        else current.insertContent({ type: this.name })
        return current.command(({ tr, dispatch }) => {
          if (!dispatch) return true
          const { $to } = tr.selection
          if ($to.nodeAfter?.isTextblock) tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1))
          else if ($to.nodeAfter?.isBlock) tr.setSelection(NodeSelection.create(tr.doc, $to.pos))
          else if (!$to.nodeAfter) {
            const paragraph = state.schema.nodes.paragraph!.create()
            tr.insert($to.end(), paragraph)
            tr.setSelection(TextSelection.create(tr.doc, $to.end() + 1))
          }
          tr.scrollIntoView()
          return true
        }).run()
      },
    }
  },
})

interface Speaker {
  speakerId: string | null
  speakerName: string
}

/**
 * The speaker of the line before last, among the top-level blocks before `index`: a two-person
 * exchange alternates by itself. A scene break starts a new exchange.
 */
function alternateSpeaker(doc: PMNode, index: number): Speaker | null {
  const lines: PMNode[] = []
  for (let i = index - 1; i >= 0 && lines.length < 2; i--) {
    const node = doc.child(i)
    if (node.type.name === 'sceneBreak') break
    if (node.type.name === 'dialogueLine') lines.push(node)
  }
  const before = lines[1]
  if (!before || (!before.attrs.speakerId && !before.attrs.speakerName)) return null
  return { speakerId: before.attrs.speakerId ?? null, speakerName: String(before.attrs.speakerName ?? '') }
}

const lineAttrs = (speaker: Speaker | null) => ({ speakerId: speaker?.speakerId ?? null, speakerName: speaker?.speakerName ?? '', direction: '', lineId: null })

/** Script lines (module script): the node view, Enter alternating the speakers, Shift+Tab to the direction. */
const ScriptLine = DialogueLine.extend({
  addStorage: () => ({ focusSpeakerAt: null as number | null }),
  addNodeView() {
    return VueNodeViewRenderer(LineView, {
      // The speaker and direction fields, their list and the id are not text: ProseMirror leaves them alone.
      stopEvent: ({ event }) => !!(event.target as HTMLElement | null)?.closest?.('.d-line__meta, .d-line__aside'),
    })
  },
  addCommands() {
    return {
      insertDialogueLine: () => ({ state, tr, dispatch }) => {
        const type = state.schema.nodes.dialogueLine!
        const { $from } = state.selection
        if ($from.depth < 1) return false
        const index = $from.index(0)
        const block = state.doc.child(index)
        const blockPos = $from.before(1)
        // An empty paragraph becomes the line; after text, the line follows it. The speakers alternate
        // only inside an exchange (a line right before); after narration the speaker field opens.
        if (block.type.name === 'paragraph' && block.content.size === 0) {
          const speaker = index > 0 && state.doc.child(index - 1).type.name === 'dialogueLine' ? alternateSpeaker(state.doc, index) : null
          if (dispatch) {
            this.storage.focusSpeakerAt = speaker ? null : blockPos
            tr.setNodeMarkup(blockPos, type, lineAttrs(speaker))
          }
          return true
        }
        const at = blockPos + block.nodeSize
        const speaker = block.type.name === 'dialogueLine' ? alternateSpeaker(state.doc, index + 1) : null
        if (dispatch) {
          this.storage.focusSpeakerAt = speaker ? null : at
          tr.insert(at, type.create(lineAttrs(speaker)))
          tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView()
        }
        return true
      },
    }
  },
  addKeyboardShortcuts() {
    return {
      'Enter': () => {
        const { state } = this.editor
        const { $from } = state.selection
        if ($from.parent.type.name !== 'dialogueLine' || $from.depth !== 1) return false
        // Enter on an empty line turns it back into a paragraph.
        if ($from.parent.content.size === 0) return this.editor.commands.setNode('paragraph')
        // At the start of a line: a new empty line above it. This line keeps its speaker, its id and the caret.
        if (state.selection.empty && $from.parentOffset === 0) {
          const index = $from.index(0)
          const above = index > 0 && state.doc.child(index - 1).type.name === 'dialogueLine' ? alternateSpeaker(state.doc, index) : null
          return this.editor.commands.command(({ tr }) => {
            const at = $from.before(1)
            tr.insert(at, state.schema.nodes.dialogueLine!.create(lineAttrs(above)))
            this.storage.focusSpeakerAt = above ? null : at
            tr.scrollIntoView()
            return true
          })
        }
        const speaker = alternateSpeaker(state.doc, $from.index(0) + 1)
        return this.editor.commands.command(({ tr }) => {
          if (!tr.selection.empty) tr.deleteSelection()
          tr.split(tr.selection.from, 1, [{ type: state.schema.nodes.dialogueLine!, attrs: lineAttrs(speaker) }])
          this.storage.focusSpeakerAt = speaker ? null : tr.selection.$from.before()
          tr.scrollIntoView()
          return true
        })
      },
      'Backspace': () => {
        const { $from, empty } = this.editor.state.selection
        if (!empty || $from.parent.type.name !== 'dialogueLine' || $from.parentOffset !== 0) return false
        return this.editor.commands.setNode('paragraph')
      },
      'Shift-Tab': () => {
        const { $from } = this.editor.state.selection
        if ($from.parent.type.name !== 'dialogueLine') return false
        const dom = this.editor.view.nodeDOM($from.before()) as HTMLElement | null
        if (!dom) return false
        dom.dispatchEvent(new CustomEvent('d-line-direction'))
        return true
      },
    }
  },
})

/**
 * Tab leaves the text, as from any field: forward to what follows the page, backward to the title.
 * Without it the browser would step into the speaker fields of the dialogue lines. Lists keep their
 * Tab (nesting), and Shift+Tab in a line goes to its direction (ScriptLine, which runs first).
 */
const TabOut = Extension.create({
  name: 'tabOut',
  priority: 50,
  addKeyboardShortcuts() {
    const leave = (forward: boolean) => {
      const dom = this.editor.view.dom
      const focusable = [...document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(el => !dom.contains(el) && el.getClientRects().length > 0)
      const target = forward
        ? focusable.find(el => dom.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
        : focusable.filter(el => dom.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING).at(-1)
      target?.focus()
      return true
    }
    return {
      'Tab': () => leave(true),
      'Shift-Tab': () => leave(false),
    }
  },
})

const mentionStateKey = new PluginKey<DecorationSet>('sceneMentionState')

/** Mentions of an entity that is gone (trashed, or from another project) read as plain text. */
const MentionState = Extension.create<{ nameOf: (refId: string) => string | null }>({
  name: 'mentionState',
  addOptions: () => ({ nameOf: () => null }),
  addProseMirrorPlugins() {
    const nameOf = this.options.nameOf
    const build = (doc: PMNode) => {
      const decorations: Decoration[] = []
      doc.descendants((node, pos) => {
        if (node.type.name === 'mention' && nameOf(String(node.attrs.id ?? '')) === null) {
          decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-missing' }))
        }
      })
      return DecorationSet.create(doc, decorations)
    }
    return [new Plugin<DecorationSet>({
      key: mentionStateKey,
      state: {
        init: (_, state) => build(state.doc),
        apply: (tr, set) => (tr.docChanged || tr.getMeta(mentionStateKey) ? build(tr.doc) : set),
      },
      props: { decorations: state => mentionStateKey.getState(state) },
    })]
  },
})

/**
 * Follows renames: mentions whose text is the entity's name, and the speakers of dialogue lines, show
 * the current name. Not a change of the author's: it is not saved by itself.
 */
export function syncNames(editor: Editor, nameOf: (refId: string) => string | null) {
  if (editor.isDestroyed) return
  const { state } = editor
  const tr = state.tr
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'mention') {
      const name = nameOf(String(node.attrs.id ?? ''))
      if (name === null) return
      const follows = node.attrs.followsName ?? (node.attrs.label === name ? true : null)
      if (follows === true && (node.attrs.label !== name || node.attrs.followsName !== true)) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, label: name, followsName: true })
      }
    }
    else if (node.type.name === 'dialogueLine' && node.attrs.speakerId) {
      const name = nameOf(`character:${node.attrs.speakerId}`)
      if (name && name !== node.attrs.speakerName) tr.setNodeMarkup(pos, undefined, { ...node.attrs, speakerName: name })
    }
  })
  tr.setMeta(mentionStateKey, true).setMeta('addToHistory', false).setMeta(SYNC, true)
  editor.view.dispatch(tr)
}

/**
 * Applies the line ids the server assigned on save (new lines, pasted copies). The k-th line that had
 * an id (or none) when the text was sent is the k-th line with that id now.
 */
export function applyLineIds(editor: Editor, sent: RichDoc, saved: RichDoc) {
  if (editor.isDestroyed) return
  const before = extractDialogueLines(sent).map(l => l.lineId ?? '')
  const after = extractDialogueLines(saved).map(l => l.lineId ?? '')
  if (before.length !== after.length) return
  const wanted = new Map<string, string>()
  const seen = new Map<string, number>()
  before.forEach((id, i) => {
    const k = (seen.get(id) ?? 0) + 1
    seen.set(id, k)
    if (after[i] && after[i] !== id) wanted.set(`${id}#${k}`, after[i]!)
  })
  if (!wanted.size) return
  const tr = editor.state.tr
  const counts = new Map<string, number>()
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'dialogueLine') return
    const id = String(node.attrs.lineId ?? '')
    const k = (counts.get(id) ?? 0) + 1
    counts.set(id, k)
    const next = wanted.get(`${id}#${k}`)
    if (next) tr.setNodeAttribute(pos, 'lineId', next)
    return false
  })
  if (tr.docChanged) editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta(SYNC, true))
}

/** The marks of the manuscript (spec 6): links and code may be in the schema for old texts, never added. */
const MANUSCRIPT_MARKS = new Set(['bold', 'italic', 'underline', 'strike'])

/**
 * Paste cleanup (spec 6): paragraphs, bold, italic, underline and strikethrough stay; fonts and colours
 * were never in the schema; links and code go, headings become paragraphs and rules become breaks.
 * Empty paragraphs between pasted ones go, and mentions of entities that are not in this project
 * become plain text.
 */
const PasteCleanup = Extension.create<{ isLive: (refId: string) => boolean }>({
  name: 'pasteCleanup',
  addOptions: () => ({ isLive: () => true }),
  addProseMirrorPlugins() {
    const isLive = this.options.isLive
    const marksOf = (node: PMNode) => node.marks.filter(mark => MANUSCRIPT_MARKS.has(mark.type.name))
    const clean = (fragment: Fragment, schema: Schema, top: boolean): Fragment => {
      const nodes: PMNode[] = []
      fragment.forEach((node, _offset, index) => {
        if (node.type.name === 'mention' && !isLive(String(node.attrs.id ?? ''))) {
          const label = String(node.attrs.label ?? '')
          if (label) nodes.push(schema.text(label, marksOf(node)))
          return
        }
        if (node.isText) {
          nodes.push(node.mark(marksOf(node)))
          return
        }
        const blank = node.type.name === 'paragraph' && !node.textContent.trim() && node.content.content.every(child => child.isText)
        if (top && blank && index > 0 && index < fragment.childCount - 1) return
        let next = node
        if (node.type.name === 'horizontalRule' && schema.nodes.sceneBreak) next = schema.nodes.sceneBreak.create()
        else if (node.type.name === 'heading') next = schema.nodes.paragraph!.create({ textAlign: node.attrs.textAlign ?? null }, node.content)
        else if (node.type.name === 'dialogueLine' && node.attrs.speakerId && !isLive(`character:${node.attrs.speakerId}`)) {
          next = node.type.create({ ...node.attrs, speakerId: null }, node.content, node.marks)
        }
        nodes.push(!next.content.size ? next.mark(marksOf(next)) : next.copy(clean(next.content, schema, false)).mark(marksOf(next)))
      })
      return Fragment.fromArray(nodes)
    }
    return [new Plugin({
      props: {
        transformPastedHTML: html => html
          .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
          .replace(/<o:p>[\s\S]*?<\/o:p>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, ''),
        transformPasted: (slice, view) => new Slice(clean(slice.content, view.state.schema, true), slice.openStart, slice.openEnd),
      },
    })]
  },
})

/**
 * Headings, inline code, links and rules can be in older texts (so the schema keeps them), but the
 * manuscript never makes them (spec 6): their shortcuts do nothing here, their input rules are off.
 */
const ManuscriptOnly = Extension.create({
  name: 'manuscriptOnly',
  priority: 1000,
  addKeyboardShortcuts() {
    const nothing = () => true
    return { 'Mod-Alt-1': nothing, 'Mod-Alt-2': nothing, 'Mod-Alt-3': nothing, 'Mod-e': nothing }
  },
})

/** The extensions whose input and paste rules the manuscript uses: no "## " heading, no `code`, no "___" rule. */
export const INPUT_RULES = ['blockquote', 'bold', 'bulletList', 'italic', 'orderedList', 'strike', 'underline', 'smartTypography', 'sceneBreak']
export const PASTE_RULES = ['bold', 'italic', 'strike', 'underline', 'smartTypography', 'sceneBreak']

/** The scrolling ancestor of the editor (the workspace column, or the focus-mode layer). */
export function scrollParent(element: HTMLElement | null): HTMLElement {
  let node = element?.parentElement ?? null
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return document.scrollingElement as HTMLElement
}

/** Keeps the line being written at the same height on the screen. */
export function centerCaret(view: EditorView, ratio = 0.45) {
  const scroller = scrollParent(view.dom)
  const caret = view.coordsAtPos(view.state.selection.head)
  const box = scroller === document.scrollingElement ? { top: 0, height: window.innerHeight } : scroller.getBoundingClientRect()
  const delta = caret.top - (box.top + box.height * ratio)
  if (Math.abs(delta) > 4) scroller.scrollBy({ top: delta, behavior: 'instant' })
}

/**
 * Where the author is: the line being written carries has-caret; with paragraph focus the current block
 * is is-current (the others dim); typewriter scrolling keeps the caret at the same height.
 */
const WritingFocus = Extension.create<{ settings: () => { paragraph: boolean, typewriter: boolean } }>({
  name: 'writingFocus',
  addOptions: () => ({ settings: () => ({ paragraph: false, typewriter: false }) }),
  addProseMirrorPlugins() {
    const settings = this.options.settings
    return [new Plugin({
      props: {
        decorations: (state) => {
          const { $head } = state.selection
          if ($head.depth < 1) return null
          const pos = $head.before(1)
          const node = state.doc.nodeAt(pos)
          if (!node) return null
          const classes = [settings().paragraph ? 'is-current' : '', node.type.name === 'dialogueLine' ? 'has-caret' : ''].filter(Boolean)
          return classes.length ? DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, { class: classes.join(' ') })]) : null
        },
      },
      view: () => ({
        update: (view, previous) => {
          if (!settings().typewriter || !view.hasFocus() || previous.doc.eq(view.state.doc)) return
          centerCaret(view)
        },
      }),
    })]
  },
})
</script>

<script setup lang="ts">
import type { Editor as VueEditor } from '@tiptap/vue-3'
import type { EditorToolbarItem } from '@nuxt/ui'
import type { Transaction } from '@tiptap/pm/state'
import type { EntityRef } from '#shared/types/domain'
import { parseMentionId } from '#shared/utils/richtext'
import { FindReplace } from './FindPanel.vue'
import { SceneMention, TextAlign } from './RichView.vue'
import { refreshSpelling, Spelling, type SpellChecker, type SpellError } from '~/utils/spelling'

/**
 * The page the author writes on (DESIGN.md "Scene editor"): the text at the measure, a bubble menu on
 * selection, / for blocks, @ for mentions with a card on hover or tap, dialogue lines with `script`.
 */
const props = defineProps<{
  content: RichDoc | null
  editable: boolean
  placeholder: string
  /** The language of the work, for hyphenation and the browser's spell check. */
  lang: string
  /** Our spell check is on (the browser's is then off); `spellChecker` is null while it loads. */
  spellcheck: boolean
  spellChecker: SpellChecker | null
  quoteStyle: QuoteStyle['style']
  smartTypography: boolean
  focusParagraph: boolean
  typewriter: boolean
  script: boolean
  /** Phones: no bubble menu (the keyboard toolbar formats), mentions open on tap. */
  touch: boolean
  /** No room in the margin for line ids. */
  narrow: boolean
}>()

const emit = defineEmits<{
  ready: [editor: VueEditor]
  change: []
  typing: []
  destroy: []
  /** "Apri scheda" from the mention card. */
  openEntity: [ref: EntityRef]
  /** A misspelled word was clicked or tapped. */
  spell: [error: SpellError, anchor: HTMLElement]
}>()

const { t } = useI18n()
const store = useProjectStore()

/** Name of a live entity of the project ("character:uuid"), or null when it does not exist or is trashed. */
function nameOf(refId: string): string | null {
  const ref = parseMentionId(refId)
  if (!ref) return null
  const item = store.getRef(ref) as { name?: string, title?: string } | undefined
  return item ? (item.name ?? item.title ?? '') : null
}

const extensions = [
  SmartTypography.configure({ settings: () => ({ enabled: props.smartTypography, style: props.quoteStyle }) }),
  TextAlign,
  ManuscriptBreak,
  ScriptLine,
  SceneMention,
  MentionState.configure({ nameOf }),
  PasteCleanup.configure({ isLive: refId => nameOf(refId) !== null }),
  WritingFocus.configure({ settings: () => ({ paragraph: props.focusParagraph, typewriter: props.typewriter }) }),
  FindReplace,
  Spelling.configure({ checker: () => props.spellChecker, onPick: (error, anchor) => emit('spell', error, anchor) }),
  TabOut,
  ManuscriptOnly,
]

const ueditor = useTemplateRef<{ editor?: VueEditor }>('ueditor')
let editor: VueEditor | null = null

/** Custom kinds of the toolbars and the / menu. */
const handlers = {
  dialogueLine: {
    canExecute: () => true,
    execute: (e: VueEditor) => e.chain().focus().insertDialogueLine(),
    isActive: (e: VueEditor) => e.isActive('dialogueLine'),
  },
  sceneBreak: {
    canExecute: (e: VueEditor) => e.can().insertSceneBreak(),
    execute: (e: VueEditor) => e.chain().focus().insertSceneBreak(),
    isActive: () => false,
  },
  textAlign: {
    canExecute: () => true,
    execute: (e: VueEditor, cmd: { align: 'left' | 'center' | 'right' }) => e.chain().focus().setTextAlign(cmd.align),
    isActive: (e: VueEditor, cmd: { align: 'left' | 'center' | 'right' }) =>
      cmd.align === 'left' ? !e.isActive({ textAlign: 'center' }) && !e.isActive({ textAlign: 'right' }) : e.isActive({ textAlign: cmd.align }),
    isDisabled: (e: VueEditor) => e.isActive('dialogueLine'),
  },
}

const bubbleItems = computed<EditorToolbarItem[][]>(() => [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: t('editor.format.bold') } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: t('editor.format.italic') } },
    { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', tooltip: { text: t('editor.format.underline') } },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', tooltip: { text: t('editor.format.strike') } },
  ],
  [
    { kind: 'blockquote', icon: 'i-lucide-text-quote', tooltip: { text: t('editor.format.quote') } },
    {
      icon: 'i-lucide-align-left',
      tooltip: { text: t('editor.format.align') },
      content: { align: 'start' },
      items: [
        { kind: 'textAlign', align: 'left', icon: 'i-lucide-align-left', label: t('editor.format.alignLeft') },
        { kind: 'textAlign', align: 'center', icon: 'i-lucide-align-center', label: t('editor.format.alignCenter') },
        { kind: 'textAlign', align: 'right', icon: 'i-lucide-align-right', label: t('editor.format.alignRight') },
      ],
    },
  ],
] as EditorToolbarItem[][])

const slashItems = computed(() => [
  [
    { type: 'label' as const, label: t('editor.slash.title') },
    ...(props.script ? [{ kind: 'dialogueLine', label: t('editor.slash.line'), description: t('editor.slash.lineHint'), icon: 'i-lucide-message-square-quote' }] : []),
    { kind: 'sceneBreak', label: t('editor.slash.break'), description: t('editor.slash.breakHint'), icon: 'i-lucide-asterisk' },
    { kind: 'blockquote', label: t('editor.slash.quote'), description: t('editor.slash.quoteHint'), icon: 'i-lucide-text-quote' },
    { kind: 'bulletList', label: t('editor.slash.bulletList'), icon: 'i-lucide-list' },
    { kind: 'orderedList', label: t('editor.slash.orderedList'), icon: 'i-lucide-list-ordered' },
    { kind: 'paragraph', label: t('editor.slash.paragraph'), icon: 'i-lucide-pilcrow' },
  ],
])

const editorProps = computed(() => ({
  attributes: {
    'spellcheck': props.spellcheck ? 'false' : 'true',
    'lang': props.lang,
    'autocorrect': 'on',
    'autocapitalize': 'sentences',
    'role': 'textbox',
    'aria-multiline': 'true',
    'aria-label': t('editor.surface.label'),
  },
  // Phones: the keyboard toolbar lies over the foot of the page, so the caret scrolls into view above it.
  handleScrollToSelection: (view: EditorView) => props.touch && keepAboveKeyboardBar(view),
}))

/** When the caret would end up under the phone's keyboard toolbar, scrolls it just above. */
function keepAboveKeyboardBar(view: EditorView) {
  const bar = document.querySelector<HTMLElement>('.d-keyboard-bar')?.getBoundingClientRect()
  if (!bar?.height) return false
  const limit = bar.top - 16
  const caret = view.coordsAtPos(view.state.selection.head)
  if (caret.bottom <= limit) return false
  scrollParent(view.dom).scrollBy({ top: caret.bottom - limit, behavior: 'instant' })
  return true
}

function onTransaction({ transaction }: { transaction: Transaction }) {
  if (transaction.docChanged && !transaction.getMeta(SYNC)) emit('change')
}

function shouldShowBubble({ view, state, from, to }: { view: EditorView, state: VueEditor['state'], from: number, to: number }) {
  if (props.touch || !view.editable) return false
  const { selection, doc } = state
  if (selection.empty || !(selection instanceof TextSelection) || !doc.textBetween(from, to).trim()) return false
  return view.hasFocus() || !!document.activeElement?.closest('.d-bubble')
}

// ---------------------------------------------------------------- the editor's life

watch(() => ueditor.value?.editor, async (instance) => {
  if (!instance || instance === editor) return
  editor = instance
  await nextTick()
  syncNames(instance, nameOf)
  instance.view.dom.addEventListener('keydown', onKeydown)
  instance.view.dom.addEventListener('mouseover', onMouseOver)
  instance.view.dom.addEventListener('mouseout', onMouseOut)
  instance.view.dom.addEventListener('click', onClick)
  emit('ready', instance)
}, { immediate: true })

onBeforeUnmount(() => {
  if (editor && !editor.isDestroyed) {
    editor.view.dom.removeEventListener('keydown', onKeydown)
    editor.view.dom.removeEventListener('mouseover', onMouseOver)
    editor.view.dom.removeEventListener('mouseout', onMouseOut)
    editor.view.dom.removeEventListener('click', onClick)
  }
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  emit('destroy')
})

/** Renames, trash and restores elsewhere show at once in the text. */
const names = computed(() => [store.rows.characters, store.rows.locations, store.rows.objects, store.rows.groups, store.rows.codexEntries]
  .map(list => (list as { id: string, name?: string, title?: string }[]).map(e => `${e.id}:${e.name ?? e.title}`).join('|'))
  .join('/'))
watch(names, () => {
  if (editor) syncNames(editor, nameOf)
})

// The dictionary has loaded, or a word was added or ignored: check the text again.
watch(() => props.spellChecker, () => {
  if (editor) refreshSpelling(editor)
})

// The writing settings changed: decorations follow.
watch(() => [props.focusParagraph, props.typewriter], () => {
  if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(SYNC, true))
})

/** Menus of the editor live in the body (see MentionMenu.vue). */
const toBody = () => document.body

const QUIET_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'])

function onKeydown(event: KeyboardEvent) {
  if (!event.metaKey && !event.ctrlKey && !QUIET_KEYS.has(event.key)) emit('typing')
}

// ---------------------------------------------------------------- the mention card

const card = reactive({ open: false, refId: '', anchor: null as HTMLElement | null })
let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined

function mentionAt(target: EventTarget | null): HTMLElement | null {
  return (target as HTMLElement | null)?.closest?.('.mention:not(.is-missing)') ?? null
}

function openCard(element: HTMLElement) {
  const refId = element.getAttribute('data-id') ?? ''
  if (!parseMentionId(refId)) return
  card.anchor = element
  card.refId = refId
  card.open = true
}

function onMouseOver(event: MouseEvent) {
  if (props.touch) return
  const element = mentionAt(event.target)
  if (!element) return
  clearTimeout(hideTimer)
  clearTimeout(showTimer)
  showTimer = setTimeout(() => openCard(element), card.open ? 0 : 350)
}

function onMouseOut(event: MouseEvent) {
  if (props.touch || !mentionAt(event.target)) return
  clearTimeout(showTimer)
  hideSoon()
}

function hideSoon() {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { card.open = false }, 250)
}

function keepCard() {
  clearTimeout(hideTimer)
}

/** On a phone a tap on a mention opens its card. */
function onClick(event: MouseEvent) {
  if (!props.touch) return
  const element = mentionAt(event.target)
  if (element) openCard(element)
}

function openEntity(ref: EntityRef) {
  card.open = false
  emit('openEntity', ref)
}
</script>

<template>
  <div class="d-surface" :class="{ 'd-surface--narrow': narrow, 'd-surface--focus-paragraph': focusParagraph, 'd-surface--typewriter': typewriter }">
    <UEditor
      ref="ueditor"
      v-slot="{ editor: instance }"
      :model-value="content ?? undefined"
      content-type="json"
      :editable="editable"
      :extensions="extensions"
      :starter-kit="{ codeBlock: false, heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: false, linkOnPaste: false } }"
      :enable-input-rules="INPUT_RULES"
      :enable-paste-rules="PASTE_RULES"
      :image="false"
      :mention="false"
      :placeholder="{ placeholder, mode: 'firstLine' }"
      :editor-props="editorProps"
      :handlers="handlers"
      :on-transaction="onTransaction"
      class="d-manuscript-text"
      :ui="{ content: 'd-surface__content' }"
    >
      <UEditorToolbar
        v-if="!touch"
        :editor="instance"
        :items="bubbleItems"
        layout="bubble"
        :should-show="shouldShowBubble"
        class="d-bubble"
        :ui="{ base: 'bg-(--ui-bg-floating) shadow-(--shadow-floating) border-default rounded-[6px]' }"
      />
      <UEditorSuggestionMenu
        :editor="instance"
        :items="slashItems"
        :suggestion="{ startOfLine: true }"
        :append-to="toBody"
        :options="{ strategy: 'fixed', placement: 'bottom-start', offset: 6, flip: {}, shift: { padding: 8 } }"
        :ui="{ content: 'bg-(--ui-bg-floating) shadow-(--shadow-floating) rounded-[6px]' }"
      />
      <EditorMentionMenu :editor="instance" @open-entity="openEntity" />
    </UEditor>

    <EditorMentionCard
      v-model:open="card.open"
      :ref-id="card.refId"
      :anchor="card.anchor"
      :touch="touch"
      @enter="keepCard"
      @leave="hideSoon"
      @open-entity="openEntity"
    />
  </div>
</template>

<style>
/* The manuscript (DESIGN.md): the author's face at the account's size, paragraphs indented 1.5em with no
   space between, flush after a break. Unlayered on purpose: it wins over the editor's default utilities. */
.d-surface .tiptap {
  padding: 0;
  outline: none;
  caret-color: var(--ui-primary);
  min-height: 12em;
}
.d-surface .tiptap.ProseMirror-focused {
  outline: none;
}
.d-surface .tiptap p.is-editor-empty:first-child::before {
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  font-weight: 400;
  font-style: normal;
  color: var(--ui-text-dimmed);
}
.d-surface--typewriter .tiptap {
  padding-bottom: 50vh;
}
.d-surface--focus-paragraph .tiptap > * {
  transition: color 150ms var(--ease-out-expo);
}
.d-surface--focus-paragraph .tiptap > :not(.is-current) {
  color: var(--ui-text-dimmed);
}
.d-surface--focus-paragraph .tiptap > :not(.is-current) .d-line__speaker,
.d-surface--focus-paragraph .tiptap > :not(.is-current) .d-line__direction {
  color: var(--ui-text-dimmed);
}
.d-surface .ProseMirror-selectednode.scene-break,
.d-surface hr.scene-break.ProseMirror-selectednode {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
  border-radius: 2px;
}
.d-surface .ProseMirror-gapcursor::after {
  border-top-color: var(--ui-text);
}
</style>
