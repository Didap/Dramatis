import type { EntityRef, RefType, RichDoc, RichNode } from '../types/domain'
import { MENTION_ID_SEPARATOR, REF_TYPES } from './constants'

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'bulletList',
  'orderedList',
  'horizontalRule',
  'dialogueLine',
  'sceneBreak',
  'codeBlock',
  'image',
])

/** An empty TipTap document. */
export function emptyDoc(): RichDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

/** Builds a document from plain paragraphs (used by templates, the demo importer, tests). */
export function docFromParagraphs(paragraphs: readonly string[]): RichDoc {
  const content = paragraphs
    .map(p => p.trim())
    .filter(Boolean)
    .map<RichNode>(p => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }))
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

export interface PlainTextOptions {
  /** Prefix dialogue lines with the speaker's name ("ANNA: ..."). Default true. */
  speakers?: boolean
  /** Keep the delivery direction of dialogue lines ("(whispering) ..."). Default true. */
  directions?: boolean
}

/** Plain text of a document: blocks separated by a blank line, hard breaks as newlines. */
export function richToPlainText(doc: RichDoc | null | undefined, options: PlainTextOptions = {}): string {
  if (!doc) return ''
  const speakers = options.speakers ?? true
  const directions = options.directions ?? true
  const blocks: string[] = []

  const inline = (node: RichNode): string => {
    if (node.type === 'text') return node.text ?? ''
    if (node.type === 'hardBreak') return '\n'
    if (node.type === 'mention') return String(node.attrs?.label ?? '')
    return (node.content ?? []).map(inline).join('')
  }

  const walk = (node: RichNode) => {
    switch (node.type) {
      case 'doc':
      case 'bulletList':
      case 'orderedList':
      case 'blockquote':
      case 'listItem':
        ;(node.content ?? []).forEach(walk)
        return
      case 'horizontalRule':
      case 'sceneBreak':
        blocks.push('* * *')
        return
      case 'image':
        return
      case 'dialogueLine': {
        const text = (node.content ?? []).map(inline).join('')
        const speaker = String(node.attrs?.speakerName ?? '').trim()
        const direction = String(node.attrs?.direction ?? '').trim()
        let line = text
        if (direction && directions) line = `(${direction}) ${line}`
        if (speakers && speaker) line = `${speaker.toUpperCase()}: ${line}`
        blocks.push(line)
        return
      }
      default:
        if (node.content || node.type === 'paragraph' || node.type === 'heading') {
          blocks.push((node.content ?? []).map(inline).join(''))
        }
        else if (node.text) {
          blocks.push(node.text)
        }
    }
  }

  walk(doc)
  return blocks
    .map(b => b.replace(/[ \t]+\n/g, '\n').trimEnd())
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const WORD_RE = /[\p{L}\p{N}]/u

/**
 * Counts words the way word processors do: whitespace-separated tokens that contain
 * at least one letter or digit ("l'amico" is one word, a lone dash is none).
 */
export function countWords(text: string): number {
  if (!text) return 0
  let count = 0
  for (const token of text.split(/\s+/)) {
    if (token && WORD_RE.test(token)) count++
  }
  return count
}

/** Characters without counting line breaks. */
export function countCharacters(text: string, withSpaces = true): number {
  const flat = text.replace(/\n/g, '')
  return withSpaces ? [...flat].length : [...flat.replace(/\s/g, '')].length
}

/** Words of a document by the shared rule: dialogue lines count their line text, not speaker or direction. */
export function docWordCount(doc: RichDoc | null | undefined): number {
  return countWords(richToPlainText(doc, { speakers: false, directions: false }))
}

export interface DialogueLineInfo {
  lineId: string | null
  speakerId: string | null
  speakerName: string
  direction: string
  text: string
}

/** The script lines of a document, in order (voice-over scripts, a character's lines). */
export function extractDialogueLines(doc: RichDoc | null | undefined): DialogueLineInfo[] {
  const lines: DialogueLineInfo[] = []
  const inline = (node: RichNode): string => {
    if (node.type === 'text') return node.text ?? ''
    if (node.type === 'hardBreak') return ' '
    if (node.type === 'mention') return String(node.attrs?.label ?? '')
    return (node.content ?? []).map(inline).join('')
  }
  const walk = (node: RichNode) => {
    if (node.type === 'dialogueLine') {
      lines.push({
        lineId: typeof node.attrs?.lineId === 'string' && node.attrs.lineId ? node.attrs.lineId : null,
        speakerId: typeof node.attrs?.speakerId === 'string' && node.attrs.speakerId ? node.attrs.speakerId : null,
        speakerName: String(node.attrs?.speakerName ?? ''),
        direction: String(node.attrs?.direction ?? ''),
        text: (node.content ?? []).map(inline).join('').trim(),
      })
      return
    }
    ;(node.content ?? []).forEach(walk)
  }
  if (doc) walk(doc)
  return lines
}

/** true when the document has no visible text and no images. */
export function isEmptyDoc(doc: RichDoc | null | undefined): boolean {
  if (!doc) return true
  let empty = true
  const walk = (node: RichNode) => {
    if (!empty) return
    if ((node.type === 'text' && node.text?.trim()) || node.type === 'image' || node.type === 'mention') {
      empty = false
      return
    }
    ;(node.content ?? []).forEach(walk)
  }
  walk(doc)
  return empty
}

/** First characters of the plain text, cut at a word boundary. */
export function excerpt(doc: RichDoc | null | undefined, max = 160): string {
  const text = richToPlainText(doc, { speakers: false }).replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** Builds the id stored in a mention node. */
export function mentionId(type: RefType, id: string): string {
  return `${type}${MENTION_ID_SEPARATOR}${id}`
}

/** Parses a mention id ("character:uuid"); returns null for anything else. */
export function parseMentionId(value: unknown): EntityRef | null {
  if (typeof value !== 'string') return null
  const at = value.indexOf(MENTION_ID_SEPARATOR)
  if (at <= 0) return null
  const type = value.slice(0, at) as RefType
  const id = value.slice(at + 1)
  if (!(REF_TYPES as readonly string[]).includes(type) || !id) return null
  return { type, id }
}

/** Every entity mentioned in a document, without duplicates, in order of appearance. */
export function extractMentions(doc: RichDoc | null | undefined): EntityRef[] {
  const seen = new Set<string>()
  const refs: EntityRef[] = []
  const walk = (node: RichNode) => {
    if (node.type === 'mention') {
      const ref = parseMentionId(node.attrs?.id)
      if (ref && !seen.has(`${ref.type}:${ref.id}`)) {
        seen.add(`${ref.type}:${ref.id}`)
        refs.push(ref)
      }
    }
    ;(node.content ?? []).forEach(walk)
  }
  if (doc) walk(doc)
  return refs
}

/** Speakers of the dialogue lines of a document (character ids), without duplicates. */
export function extractSpeakers(doc: RichDoc | null | undefined): string[] {
  const seen = new Set<string>()
  const walk = (node: RichNode) => {
    if (node.type === 'dialogueLine' && typeof node.attrs?.speakerId === 'string' && node.attrs.speakerId) {
      seen.add(node.attrs.speakerId)
    }
    ;(node.content ?? []).forEach(walk)
  }
  if (doc) walk(doc)
  return [...seen]
}

/** true for block-level node types known to the plain-text and export converters. */
export function isKnownBlock(type: string | undefined): boolean {
  return !!type && BLOCK_TYPES.has(type)
}
