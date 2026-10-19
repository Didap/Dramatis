<script lang="ts">
import { defineComponent, h, type PropType, type VNode, type VNodeChild } from 'vue'
import type { RichDoc, RichNode } from '#shared/types/domain'
import { parseMentionId } from '#shared/utils/richtext'

/*
 * The author's text, read only, set like the printed book: paragraphs indented with no space between
 * them, flush after a title or a break; script lines with the speaker in tracked capitals and the
 * direction in italics, the line id in the right margin on wide screens; breaks as the project's scene
 * separator; mentions as plain text with a dotted underline. Renders TipTap JSON directly, without an
 * editor. Names are the current ones, as in the editor and the exports: a speaker or a mention that
 * follows its entity shows the name it has now, and the mention of an entity in the trash is plain text.
 */

const MARK_TAGS: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' }

/** Links that may open from the reading view (what TipTap's link extension lets through, minus the rare ones). */
const SAFE_HREF = /^(?:https?:|mailto:|tel:)/i

export default defineComponent({
  name: 'ManuscriptProse',
  props: {
    doc: { type: Object as PropType<RichDoc | null>, default: null },
    /** Printed for a break between two sections of the scene (Settings, Writing). */
    separator: { type: String, default: '*  *  *' },
    /** Show the line ids of script lines in the right margin (module script, wide screens). */
    lineIds: { type: Boolean, default: false },
  },
  setup(props) {
    const store = useProjectStore()

    /** A mention: its current name when it follows the entity, its own text otherwise; plain text when the entity is gone. */
    function mention(node: RichNode, key: number): VNodeChild {
      const label = String(node.attrs?.label ?? '')
      const ref = parseMentionId(node.attrs?.id)
      if (!ref || !store.getRef(ref)) return label
      const name = store.refLabel(ref)
      return h('span', { key, class: 'mention' }, name && (node.attrs?.followsName || !label) ? name : label)
    }

    function inline(node: RichNode, key: number): VNodeChild {
      if (node.type === 'text') {
        let out: VNodeChild = node.text ?? ''
        for (const mark of node.marks ?? []) {
          const href = mark.type === 'link' && typeof mark.attrs?.href === 'string' ? mark.attrs.href.trim() : ''
          if (href && SAFE_HREF.test(href)) {
            out = h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'underline underline-offset-3' }, [out])
          }
          else if (MARK_TAGS[mark.type]) {
            out = h(MARK_TAGS[mark.type]!, [out])
          }
        }
        return out
      }
      if (node.type === 'hardBreak') return h('br', { key })
      if (node.type === 'mention') return mention(node, key)
      return (node.content ?? []).map(inline)
    }

    const inlines = (node: RichNode) => (node.content ?? []).map(inline)

    function dialogueLine(node: RichNode, key: number): VNode {
      const speakerId = typeof node.attrs?.speakerId === 'string' ? node.attrs.speakerId : ''
      const speaker = (store.get('characters', speakerId)?.name ?? String(node.attrs?.speakerName ?? '')).trim()
      // An author may type the parentheses around a direction: they are printed once.
      const raw = String(node.attrs?.direction ?? '').trim()
      const direction = (/^\((.*)\)$/s.exec(raw)?.[1] ?? raw).trim()
      const lineId = props.lineIds && typeof node.attrs?.lineId === 'string' ? node.attrs.lineId : ''
      return h('p', { key, class: 'prose-line' }, [
        speaker ? h('span', { class: 'prose-speaker' }, speaker) : null,
        direction ? h('span', { class: 'prose-direction' }, `(${direction})`) : null,
        h('span', { class: 'prose-said' }, inlines(node)),
        // The outer box keeps the line's own height, so the id sits on the line's first baseline.
        lineId ? h('span', { 'class': 'prose-line-id', 'aria-hidden': 'true' }, [h('span', lineId)]) : null,
      ])
    }

    function block(node: RichNode, key: number): VNode | VNode[] | null {
      const align = typeof node.attrs?.textAlign === 'string' && node.attrs.textAlign !== 'left' ? { textAlign: node.attrs.textAlign } : undefined
      switch (node.type) {
        case 'paragraph':
          return h('p', { key, style: align }, inlines(node))
        case 'heading': {
          const level = Math.min(Math.max(Number(node.attrs?.level ?? 3), 3), 6)
          return h(`h${level}`, { key, class: 'prose-heading', style: align }, inlines(node))
        }
        case 'blockquote':
          return h('blockquote', { key }, blocks(node))
        case 'bulletList':
          return h('ul', { key }, blocks(node))
        case 'orderedList':
          return h('ol', { key }, blocks(node))
        case 'listItem':
          return h('li', { key }, blocks(node))
        case 'horizontalRule':
        case 'sceneBreak':
          return h('p', { 'key': key, 'class': 'prose-break', 'aria-hidden': 'true' }, props.separator || ' ')
        case 'dialogueLine':
          return dialogueLine(node, key)
        case 'codeBlock':
          return h('pre', { key }, inlines(node))
        case 'image':
          return null
        default:
          return node.content ? h('div', { key }, blocks(node)) : null
      }
    }

    function blocks(node: RichNode): VNodeChild[] {
      return (node.content ?? []).map(block)
    }

    return () => h('div', { class: 'manuscript-prose voice-author' }, props.doc ? blocks(props.doc) : [])
  },
})
</script>

<style>
/* The size comes from the container (the reading view sets the manuscript size). */
.manuscript-prose {
  font-size: 1em;
  line-height: var(--manuscript-leading);
  color: var(--ui-text);
  font-variant-numeric: proportional-nums;
}
@media (max-width: 639.98px) {
  .manuscript-prose {
    line-height: calc(var(--manuscript-leading) - 0.05);
  }
}
.manuscript-prose p {
  margin: 0;
  text-indent: 1.5em;
}
/* Flush after the start, a title, a break or a script line, as in the printed book (script lines keep their hang). */
.manuscript-prose > p:not(.prose-line):first-child,
.manuscript-prose .prose-heading + p:not(.prose-line),
.manuscript-prose .prose-break + p:not(.prose-line),
.manuscript-prose .prose-line + p:not(.prose-line),
.manuscript-prose blockquote p:first-child {
  text-indent: 0;
}
.manuscript-prose .prose-heading {
  font-weight: 600;
  font-size: 1em;
  margin: 1.2em 0 0.4em;
}
.manuscript-prose .prose-break {
  text-indent: 0;
  text-align: center;
  margin: 1.2em 0;
  color: var(--ui-text-muted);
  letter-spacing: 0.3em;
  white-space: pre;
}
.manuscript-prose blockquote {
  margin: 0.8em 0;
  padding-inline-start: 1.5em;
  color: var(--ui-text-toned);
}
.manuscript-prose ul,
.manuscript-prose ol {
  margin: 0.6em 0;
  padding-inline-start: 1.5em;
}
.manuscript-prose ul {
  list-style: disc;
}
.manuscript-prose ol {
  list-style: decimal;
}
.manuscript-prose li p {
  text-indent: 0;
}
/* Script lines: speaker in tracked capitals, direction in italics, the line in roman; wraps hang 2em. */
.manuscript-prose .prose-line {
  position: relative;
  text-indent: -2em;
  padding-inline-start: 2em;
  margin-block: 0.25em;
}
.manuscript-prose .prose-speaker {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.8125em;
  font-weight: 600;
  color: var(--ui-text-toned);
  margin-inline-end: 0.5em;
}
.manuscript-prose .prose-direction {
  font-style: italic;
  color: var(--ui-text-muted);
  margin-inline-end: 0.4em;
}
/* Line ids sit in the right margin like line numbers in a critical edition, where there is room. */
.manuscript-prose .prose-line-id {
  display: none;
}
@media (min-width: 1280px) {
  .manuscript-prose .prose-line-id {
    display: block;
    position: absolute;
    inset-inline-start: calc(100% + 1.5rem);
    top: 0;
    text-indent: 0;
    white-space: nowrap;
  }
  .manuscript-prose .prose-line-id > span {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 400;
    font-style: normal;
    letter-spacing: 0;
    color: var(--ui-text-dimmed);
  }
}
</style>
