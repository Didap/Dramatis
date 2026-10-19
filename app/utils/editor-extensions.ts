import { mergeAttributes, Node } from '@tiptap/core'

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
