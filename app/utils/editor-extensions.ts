import { getMarkRange, Mark, mergeAttributes, Node } from '@tiptap/core'
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
      /** Highlights the selection, or recolours the highlight the caret is in (its note stays). */
      setHighlighter: (color: HighlighterColor) => ReturnType
      /** Takes the highlight (and its note) off the selection, or off the highlight the caret is in. */
      unsetHighlighter: () => ReturnType
      toggleHighlighter: (color: HighlighterColor) => ReturnType
      /** Opens the note of the highlight the caret is in; a plain selection is highlighted first. */
      openHighlightNote: () => ReturnType
      /** Sets the note on the highlights of a stretch of text (empty removes it). */
      setHighlightNote: (range: { from: number, to: number }, note: string) => ReturnType
    }
  }
}

export interface HighlighterOptions {
  /** The editor asks for the note of a highlight: the stretch it covers and its note so far. */
  onNote: ((range: { from: number, to: number }, note: string) => void) | null
}

/**
 * The author's highlighters (VRS-643): a colour from a small set over a stretch of the manuscript,
 * with an optional note. Kept in the text itself, so the note follows the words through revisions
 * and goes with them when they are cut. Readers never see it: the reading view and the exports drop it.
 */
export const Highlighter = Mark.create<HighlighterOptions>({
  name: 'highlight',
  // Typing on at the end of a highlight does not stretch it, as with a real highlighter.
  inclusive: false,

  addOptions() {
    return { onNote: null }
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
        // The note shows on hover (title) and marks the highlight (data-note: a dashed underline).
        renderHTML: attributes => (attributes.note ? { 'data-note': '', 'title': attributes.note } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'mark[data-highlight]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes({ class: 'd-highlight' }, HTMLAttributes), 0]
  },

  addCommands() {
    /** The stretch to act on: the selection, or the whole highlight around the caret. */
    const target = (state: import('@tiptap/pm/state').EditorState) => {
      const { from, to, empty, $from } = state.selection
      if (!empty) return { from, to }
      return getMarkRange($from, this.type) ?? null
    }
    const noteAt = (state: import('@tiptap/pm/state').EditorState, pos: number) =>
      String(state.doc.resolve(pos).marks().find(m => m.type === this.type)?.attrs.note
        ?? state.doc.nodeAt(pos)?.marks.find(m => m.type === this.type)?.attrs.note ?? '')

    return {
      setHighlighter: color => ({ state, tr, dispatch }) => {
        const range = target(state)
        if (!range) return false
        if (dispatch) tr.addMark(range.from, range.to, this.type.create({ color, note: noteAt(state, range.from) }))
        return true
      },
      unsetHighlighter: () => ({ state, tr, dispatch }) => {
        const range = target(state)
        if (!range) return false
        if (dispatch) tr.removeMark(range.from, range.to, this.type)
        return true
      },
      toggleHighlighter: color => ({ editor, commands }) =>
        editor.isActive(this.name) ? commands.unsetHighlighter() : commands.setHighlighter(color),
      openHighlightNote: () => ({ state, editor, commands }) => {
        const range = target(state)
        if (!range || !this.options.onNote) return false
        if (!editor.isActive(this.name)) commands.setHighlighter('yellow')
        this.options.onNote(range, noteAt(editor.state, range.from))
        return true
      },
      setHighlightNote: (range, note) => ({ state, tr, dispatch }) => {
        if (!dispatch) return true
        const to = Math.min(range.to, state.doc.content.size)
        state.doc.nodesBetween(range.from, to, (node, pos) => {
          const mark = node.isText ? node.marks.find(m => m.type === this.type) : undefined
          if (!mark) return
          tr.addMark(Math.max(pos, range.from), Math.min(pos + node.nodeSize, to), this.type.create({ ...mark.attrs, note }))
        })
        return true
      },
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift-h': () => this.editor.commands.toggleHighlighter('yellow') }
  },
})
