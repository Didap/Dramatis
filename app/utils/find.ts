import type { Node as PMNode } from '@tiptap/pm/model'

/*
 * Find in the open scene (spec 5.9), the pure part: which ranges of a document match a query, and what
 * a tag's name becomes when replaced. The panel, the highlights and the steps live in
 * components/editor/FindPanel.vue.
 */

export interface FindQuery {
  text: string
  matchCase: boolean
  wholeWord: boolean
  /** Mentions of this entity ("character:uuid") instead of a text. */
  refId: string | null
}

export interface FindMatch {
  from: number
  to: number
  /** A whole dialogue line (the entity speaks it). */
  node?: boolean
  /** A tag whose name matches: replacing changes the name it shows, and the tag stays. */
  tag?: boolean
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The query as a global regular expression; a whole word has no letter, digit or _ on either side. */
function findRegExp(query: FindQuery): RegExp {
  const source = escapeRegExp(query.text)
  const pattern = query.wholeWord ? `(?<![\\p{L}\\p{N}_])${source}(?![\\p{L}\\p{N}_])` : source
  return new RegExp(pattern, query.matchCase ? 'gu' : 'giu')
}

export function findMatches(doc: PMNode, query: FindQuery): FindMatch[] {
  const matches: FindMatch[] = []
  if (query.refId) {
    const speaker = query.refId.startsWith('character:') ? query.refId.slice('character:'.length) : null
    doc.descendants((node, pos) => {
      if (node.type.name === 'mention' && node.attrs.id === query.refId) matches.push({ from: pos, to: pos + node.nodeSize })
      else if (speaker && node.type.name === 'dialogueLine' && node.attrs.speakerId === speaker) matches.push({ from: pos, to: pos + node.nodeSize, node: true })
    })
    return matches
  }
  if (!query.text) return matches
  const regexp = findRegExp(query)
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // Inline atoms (mentions, line breaks) become a character that never matches the text around them;
    // a tag is found on its own when its name matches.
    let text = ''
    const found: FindMatch[] = []
    node.forEach((child, offset) => {
      if (child.isText) return void (text += child.text!)
      text += '￼'.repeat(child.nodeSize)
      if (child.type.name === 'mention' && String(child.attrs.label ?? '').search(regexp) !== -1) {
        found.push({ from: pos + 1 + offset, to: pos + 1 + offset + child.nodeSize, tag: true })
      }
    })
    for (const match of text.matchAll(regexp)) {
      if (!match[0]) continue
      const from = pos + 1 + match.index!
      found.push({ from, to: from + match[0].length })
    }
    for (const match of found.sort((a, b) => a.from - b.from)) matches.push(match)
    return false
  })
  return matches
}

/** A tag's name after a replace: every match in it takes the new text. Blank means the tag goes. */
export function replacedLabel(label: string, query: FindQuery, text: string): string {
  return label.replace(findRegExp(query), () => text)
}
