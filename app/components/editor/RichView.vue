<script lang="ts">
import { Extension, generateHTML } from '@tiptap/core'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import Mention from '@tiptap/extension-mention'
import StarterKit from '@tiptap/starter-kit'
import type { RichDoc } from '#shared/types/domain'
import { richToPlainText } from '#shared/utils/richtext'

/*
 * The scene's schema pieces shared by the editor (Surface) and every read-only view of a text
 * (history previews, revisions, the entity peek): the mention node and the alignment attribute.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sceneTextAlign: {
      /** left removes the attribute: the manuscript is ragged right by default. */
      setTextAlign: (alignment: 'left' | 'center' | 'right') => ReturnType
      unsetTextAlign: () => ReturnType
    }
  }
}

const ALIGNED = ['paragraph', 'heading']

/**
 * Alignment of paragraphs and headings (attrs.textAlign, center or right). Justified and left
 * alignments coming from pasted documents are dropped: the export decides how the book is set.
 */
export const TextAlign = Extension.create({
  name: 'textAlign',
  addGlobalAttributes() {
    return [{
      types: ALIGNED,
      attributes: {
        textAlign: {
          default: null,
          parseHTML: (element: HTMLElement) => (['center', 'right'].includes(element.style.textAlign) ? element.style.textAlign : null),
          renderHTML: (attributes: Record<string, unknown>) => (attributes.textAlign ? { style: `text-align: ${attributes.textAlign}` } : {}),
        },
      },
    }]
  },
  addCommands() {
    return {
      setTextAlign: alignment => ({ commands }) =>
        ALIGNED.map(type => commands.updateAttributes(type, { textAlign: alignment === 'left' ? null : alignment })).some(Boolean),
      unsetTextAlign: () => ({ commands }) => ALIGNED.map(type => commands.resetAttributes(type, 'textAlign')).some(Boolean),
    }
  },
})

/**
 * A mention: the entity's id ("character:uuid"), the text shown, and whether that text follows the
 * entity's name (true when it was the name at insertion; an alias or an epithet keeps its text).
 * Shown as plain text with a dotted underline, never a pill. Also reads the mentions written by the
 * other rich text fields of the workspace (span.mention[data-ref]).
 */
export const SceneMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      followsName: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute('data-follows-name')
          return value === null ? null : value === 'true'
        },
        renderHTML: (attributes: Record<string, unknown>) =>
          (typeof attributes.followsName === 'boolean' ? { 'data-follows-name': String(attributes.followsName) } : {}),
      },
    }
  },
  parseHTML() {
    return [
      { tag: 'span[data-type="mention"]' },
      { tag: 'span.mention[data-ref]', getAttrs: (element: HTMLElement) => ({ id: element.getAttribute('data-ref'), label: element.textContent ?? '' }) },
    ]
  },
  // Backspace right after a mention edits it like any word: it becomes its text, one letter shorter.
  addKeyboardShortcuts() {
    return {
      Backspace: () => this.editor.commands.command(({ tr, state }) => {
        const { selection } = state
        const before = selection.empty ? selection.$from.nodeBefore : null
        if (before?.type.name !== this.name) return false
        const from = selection.from - before.nodeSize
        const text = [...String(before.attrs.label ?? '')].slice(0, -1).join('')
        if (text) tr.insertText(text, from, selection.from)
        else tr.delete(from, selection.from)
        return true
      }),
    }
  },
}).configure({
  HTMLAttributes: { class: 'mention' },
  renderText: ({ node }) => String(node.attrs.label ?? ''),
  renderHTML: ({ options, node }) => ['span', options.HTMLAttributes, String(node.attrs.label ?? '')],
  // The editor has its own @ menu: this trigger never fires.
  suggestion: { char: '⁣' },
})

/** Read back, a line of dialogue keeps its layout: speaker, direction in parentheses, the line. */
const ViewLine = DialogueLine.extend({
  renderHTML({ node }) {
    const speaker = String(node.attrs.speakerName ?? '')
    const direction = String(node.attrs.direction ?? '')
    return ['p', { class: 'd-line-view' },
      ...(speaker ? [['span', { class: 'd-line-view__speaker' }, speaker]] : []),
      ...(direction ? [['span', { class: 'd-line-view__direction' }, `(${direction})`]] : []),
      ['span', {}, 0],
    ] as unknown as DOMOutputSpec
  },
})

const viewExtensions = [StarterKit.configure({ undoRedo: false, trailingNode: false, dropcursor: false, gapcursor: false }), SceneMention, ViewLine, SceneBreak, TextAlign]

/** HTML of a stored text, for reading only. Falls back to plain paragraphs if the text has unknown parts. */
export function docHtml(doc: RichDoc | null | undefined): string {
  if (!doc) return ''
  try {
    return generateHTML(doc, viewExtensions)
  }
  catch {
    const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    return richToPlainText(doc).split(/\n{2,}/).map(p => `<p>${escape(p)}</p>`).join('')
  }
}
</script>

<script setup lang="ts">
/** A stored text shown read-only with the manuscript typography (history, revisions, entity peek). */
const props = withDefaults(defineProps<{ doc: RichDoc | null | undefined, manuscript?: boolean }>(), { manuscript: true })
const html = computed(() => docHtml(props.doc))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- the HTML is serialised by ProseMirror from the author's own text -->
  <div class="tiptap d-rich-view" :class="manuscript ? 'd-manuscript-text' : 'd-ui-text'" v-html="html" />
</template>

<style>
/* The manuscript (DESIGN.md "The manuscript"): the author's face at the account's size and leading,
   paragraphs indented 1.5em with no space between, flush after a break, a title or another block.
   Unlayered on purpose: it wins over the editor's default utilities. */
.d-manuscript-text {
  font-family: var(--manuscript-font);
  font-size: var(--manuscript-size);
  line-height: var(--manuscript-leading);
  font-weight: var(--manuscript-weight);
  font-optical-sizing: auto;
  font-variant-numeric: proportional-nums;
  color: var(--ui-text);
  overflow-wrap: break-word;
  hyphens: manual;
}
.d-manuscript-text .tiptap {
  font: inherit;
  line-height: inherit;
  color: inherit;
}
.d-manuscript-text :is(.tiptap, .d-rich-view) > * {
  margin-block: 0;
}
.d-manuscript-text :is(p, li, blockquote) {
  line-height: inherit;
  margin: 0;
}
.d-manuscript-text p + p {
  text-indent: 1.5em;
}
.d-manuscript-text blockquote {
  margin-block: 0.75em;
  padding: 0 0 0 2em;
  border: 0;
  font-style: normal;
}
.d-manuscript-text blockquote + p,
.d-manuscript-text :is(ul, ol) + p {
  text-indent: 0;
}
.d-manuscript-text :is(ul, ol) {
  margin-block: 0.5em;
  padding-inline-start: 1.6em;
}
.d-manuscript-text ul {
  list-style: disc;
}
.d-manuscript-text ol {
  list-style: decimal;
}
.d-manuscript-text li {
  margin-block: 0.15em;
  padding-inline-start: 0.2em;
}
.d-manuscript-text li p + p {
  text-indent: 0;
}
.d-manuscript-text :is(h2, h3) {
  margin-block: 1.2em 0.5em;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ui-text-highlighted);
}
.d-manuscript-text h2 {
  font-size: 1.25em;
}
.d-manuscript-text h3 {
  font-size: 1.1em;
}
/* Mentions are plain text with a dotted underline, never a pill (main.css draws the underline). */
.d-manuscript-text .mention {
  color: inherit;
  font-weight: inherit;
}
.d-manuscript-text .mention.is-missing {
  text-decoration: none;
}
.d-manuscript-text a {
  color: var(--ui-primary);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
.d-manuscript-text code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  padding: 0;
  border: 0;
  background: transparent;
}
.d-manuscript-text [data-type='horizontalRule'] {
  margin-block: 1.5em;
  padding: 0;
}
.d-manuscript-text [data-type='horizontalRule'] hr {
  border: 0;
  text-align: center;
  overflow: visible;
}
.d-manuscript-text [data-type='horizontalRule'] hr::after {
  content: '*  *  *';
  white-space: pre;
  color: var(--ui-text-muted);
  letter-spacing: 0.3em;
}

/* Lines of dialogue read back (previews, the peek): as in the editor, without the fields. */
.d-line-view {
  padding-inline-start: 2em;
  text-indent: -2em;
  margin-block: 0.25em;
}
.d-line-view__speaker {
  margin-inline-end: 0.5em;
  font-size: 0.8125em;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-toned);
}
.d-line-view__direction {
  margin-inline-end: 0.4em;
  font-style: italic;
  color: var(--ui-text-muted);
}
.d-rich-view--small {
  --manuscript-size: 0.9375rem;
  --manuscript-leading: 1.55;
}
.d-ui-text {
  font-size: 0.9375rem;
  line-height: 1.55;
}
</style>
