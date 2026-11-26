import { Mark, mergeAttributes, Node } from '@tiptap/core'
import type { Mark as PMMark } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { HighlighterColor } from '#shared/types/domain'

/**
 * A line of dialogue in script form: a speaker (character), an optional delivery direction
 * and the line itself as inline content. Used by game projects and by anyone who writes
 * dialogue as a script. The scene editor gives it a richer node view (speaker picker);
 * this base definition keeps the content intact in every other editor.
 */
export const DialogueLine = Node.create({
  name: 'dialogueLine',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      speakerId: { default: null },
      speakerName: { default: '' },
      direction: { default: '' },
      lineId: { default: null },
    }
  },

  parseHTML() {
    return [{
      tag: 'p[data-dialogue-line]',
      getAttrs: el => ({
        speakerId: (el as HTMLElement).getAttribute('data-speaker-id'),
        speakerName: (el as HTMLElement).getAttribute('data-speaker') ?? '',
        direction: (el as HTMLElement).getAttribute('data-direction') ?? '',
        lineId: (el as HTMLElement).getAttribute('data-line-id'),
      }),
    }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'p',
      mergeAttributes(HTMLAttributes, {
        'class': 'dialogue-line',
        'data-dialogue-line': '',
        'data-speaker': node.attrs.speakerName || '',
        'data-speaker-id': node.attrs.speakerId || '',
        'data-direction': node.attrs.direction || '',
        'data-line-id': node.attrs.lineId || '',
      }),
      0,
    ]
  },
})

/** A centred break between two sections of the same scene (printed as * * * in exports). */
export const SceneBreak = Node.create({
  name: 'sceneBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'hr[data-scene-break]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes(HTMLAttributes, { 'class': 'scene-break', 'data-scene-break': '' })]
  },
})

/** A short id for a new dialogue line, stable across exports (voice-over scripts use it). */
export function newLineId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ------------------------------------------------------------------ highlighters

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    highlighter: {
      /** Highlights the selection, or recolours the highlight at the caret; notes already there stay. */
      setHighlighter: (color: HighlighterColor) => ReturnType
      /** Takes the highlight off the selection, or the whole highlight at the caret (its note with it). */
      unsetHighlighter: () => ReturnType
      toggleHighlighter: (color: HighlighterColor) => ReturnType
      /** Opens the note of the highlight at the caret; plain words in the selection are highlighted first. */
      openHighlightNote: () => ReturnType
      /** Sets the note on the highlights of a stretch of text (empty removes it). */
      setHighlightNote: (range: { from: number, to: number }, note: string) => ReturnType
    }
  }
}

export interface HighlighterOptions {
  /** The editor asks for the note of a highlight: the stretch it covers and its note so far. */
  onNote: ((range: { from: number, to: number }, note: string) => void) | null
  /** The name of a colour ("Verde"), said on hover with the note: the colour is never the only sign. */
  colorName: (color: string) => string
}

/**
 * The highlight at the caret or under the selection, whole: across paragraphs as long as the same
 * highlight (colour and note) runs on, mentions included. Null when there is none.
 */
export function highlightAt(state: EditorState): { from: number, to: number, mark: PMMark } | null {
  const type = state.schema.marks.highlight
  if (!type) return null
  const { from, to, empty } = state.selection
  let mark: PMMark | undefined
  state.doc.nodesBetween(from, empty ? Math.min(to + 1, state.doc.content.size) : to, (node) => {
    mark ??= node.isInline ? type.isInSet(node.marks) ?? undefined : undefined
  })
  // A caret just after a highlight counts: it is where the author lands having made one.
  if (!mark && empty && from > 0) mark = type.isInSet(state.doc.resolve(from).nodeBefore?.marks ?? []) ?? undefined
  if (!mark) return null
  // Inline runs in reading order, with whether they carry this very highlight.
  const runs: { from: number, to: number, on: boolean }[] = []
  state.doc.descendants((node, pos) => {
    if (!node.isInline) return true
    runs.push({ from: pos, to: pos + node.nodeSize, on: !!mark!.isInSet(node.marks) })
    return false
  })
  let first = runs.findIndex(run => run.on && run.to >= from && (empty || run.from < to))
  if (first < 0) return null
  let last = first
  while (first > 0 && runs[first - 1]!.on) first--
  while (last < runs.length - 1 && runs[last + 1]!.on) last++
  return { from: runs[first]!.from, to: runs[last]!.to, mark }
}

/**
 * The author's highlighters (VRS-643): a colour from a small set over a stretch of the manuscript,
 * with an optional note. Kept in the text itself, so the note follows the words through revisions
 * and goes with them when they are cut and pasted. Readers never see it: the reading view and the
 * exports drop it.
 */
export const Highlighter = Mark.create<HighlighterOptions>({
  name: 'highlight',

  addOptions() {
    return { onNote: null, colorName: color => color }
  },

  addAttributes() {
    return {
      color: {
        default: 'yellow',
        parseHTML: element => element.getAttribute('data-highlight') || 'yellow',
        renderHTML: attributes => ({ 'data-highlight': attributes.color }),
      },
      note: {
        default: '',
        parseHTML: element => element.getAttribute('data-note') ?? '',
        // data-note also draws the dashed underline of a highlight with a note.
        renderHTML: attributes => (attributes.note ? { 'data-note': attributes.note } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'mark[data-highlight]' }]
  },

  renderHTML({ mark, HTMLAttributes }) {
    const name = this.options.colorName(String(mark.attrs.color))
    const title = mark.attrs.note ? `${name}: ${mark.attrs.note}` : name
    return ['mark', mergeAttributes({ class: 'd-highlight', title }, HTMLAttributes), 0]
  },

  addCommands() {
    /**
     * Colours the inline content of a stretch: `attrs` gets the highlight a piece already has (or
     * nothing), so that each piece keeps its own note.
     */
    const paint = (tr: Transaction, from: number, to: number, attrs: (existing: PMMark | undefined) => Record<string, unknown> | null) => {
      tr.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isInline) return true
        const next = attrs(this.type.isInSet(node.marks) ?? undefined)
        if (next) tr.addMark(Math.max(pos, from), Math.min(pos + node.nodeSize, to), this.type.create(next))
        return false
      })
    }
    /** What a command acts on: the selection, or the whole highlight at the caret. */
    const target = (state: EditorState) => (state.selection.empty ? highlightAt(state) : state.selection)

    return {
      setHighlighter: color => ({ state, tr, dispatch }) => {
        const range = target(state)
        if (!range) return false
        if (dispatch) paint(tr, range.from, range.to, existing => ({ color, note: existing?.attrs.note ?? '' }))
        return true
      },
      unsetHighlighter: () => ({ state, tr, dispatch }) => {
        const range = target(state)
        if (!range) return false
        if (dispatch) tr.removeMark(range.from, range.to, this.type)
        return true
      },
      toggleHighlighter: color => ({ state, commands }) => {
        const { from, to, empty } = state.selection
        let covered = !empty
        state.doc.nodesBetween(from, to, (node) => {
          if (node.isInline && !this.type.isInSet(node.marks)) covered = false
        })
        return (empty ? highlightAt(state) : covered) ? commands.unsetHighlighter() : commands.setHighlighter(color)
      },
      openHighlightNote: () => ({ state, tr, dispatch }) => {
        const range = target(state)
        if (!range || !this.options.onNote) return false
        if (!dispatch) return true
        // Plain words are highlighted in yellow; highlights already there keep their colour and note.
        paint(tr, range.from, range.to, existing => (existing ? null : { color: 'yellow', note: '' }))
        const whole = highlightAt(state.apply(tr))
        const stretch = { from: Math.min(range.from, whole?.from ?? range.from), to: Math.max(range.to, whole?.to ?? range.to) }
        this.options.onNote(stretch, String(whole?.mark.attrs.note ?? ''))
        return true
      },
      setHighlightNote: (range, note) => ({ tr, dispatch }) => {
        const to = Math.min(range.to, tr.doc.content.size)
        if (dispatch) paint(tr, range.from, to, existing => (existing ? { ...existing.attrs, note } : null))
        return true
      },
    }
  },

  addKeyboardShortcuts() {
    // Always handled: the browser's own ⌘⇧H (the home page) must never leave the manuscript.
    return {
      'Mod-Shift-h': () => {
        this.editor.commands.toggleHighlighter('yellow')
        return true
      },
    }
  },
})
