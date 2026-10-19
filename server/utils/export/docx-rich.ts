import { AlignmentType, LevelFormat, Paragraph, TextRun, type INumberingOptions, type IParagraphOptions, type IRunOptions, type ParagraphChild } from 'docx'
import type { RichDoc, RichNode } from '#shared/types/domain'
import { exportCleanText } from './files'
import { exportDirection, exportMentionText, exportSpeaker, exportTrimDoc } from './model'

/*
 * Rich text (TipTap JSON) to Word paragraphs. Bold, italic, underline, strikethrough, quotes,
 * lists and alignment are kept; mentions become plain text; dialogue lines are printed as a script:
 * the speaker in small capitals, the direction in parentheses, then the line, wrapped lines hanging.
 */

export interface DocxRichContext {
  names: Map<string, string>
  /** First-line indent of body paragraphs, in twips (0 for none). */
  indent: number
  /** Text printed for a break inside a scene ("***", "#", or "" for a blank line). */
  separator: string
  /** Paragraph style of body text, when the document defines one. */
  style?: string
  /** Font of monospaced text (code marks). */
  monoFont?: string
  /**
   * The numbered lists of the whole document. Word numbers every list instance of a reference on its own,
   * so each list takes the next instance: one counter per file, shared by every call of docxParagraphs.
   */
  lists: DocxListCounter
}

export interface DocxListCounter { count: number }

/** A list counter for a new document. */
export function docxListCounter(): DocxListCounter {
  return { count: 0 }
}

type Marks = { bold?: boolean, italics?: boolean, underline?: object, strike?: boolean, font?: string }

/** The numbering of ordered lists, for every document that prints rich text. */
export const DOCX_NUMBERING: INumberingOptions = {
  config: [{
    reference: 'dramatis-ordered',
    levels: Array.from({ length: 9 }, (_, level) => ({
      level,
      format: LevelFormat.DECIMAL,
      text: `%${level + 1}.`,
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
    })),
  }],
}

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}

function marksOf(node: RichNode, ctx: DocxRichContext): Marks {
  const marks: Marks = {}
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') marks.bold = true
    else if (mark.type === 'italic') marks.italics = true
    else if (mark.type === 'underline') marks.underline = {}
    else if (mark.type === 'strike') marks.strike = true
    else if (mark.type === 'code') marks.font = ctx.monoFont ?? 'Courier New'
  }
  return marks
}

/** The runs of an inline content: text with its marks, mentions as text, hard breaks as line breaks. */
export function docxRuns(nodes: readonly RichNode[] | undefined, ctx: DocxRichContext, extra: IRunOptions = {}): TextRun[] {
  const runs: TextRun[] = []
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      runs.push(new TextRun({ ...extra, break: 1 }))
      continue
    }
    const text = node.type === 'text' ? node.text ?? '' : node.type === 'mention' ? exportMentionText(node, ctx.names) : ''
    if (!text) {
      if (node.content) runs.push(...docxRuns(node.content, ctx, extra))
      continue
    }
    runs.push(new TextRun({ ...extra, ...marksOf(node, ctx), text: exportCleanText(text) }))
  }
  return runs
}

/** A centred separator paragraph ("***"), or an empty line. */
export function docxSeparator(separator: string, style?: string): Paragraph {
  return new Paragraph({
    style,
    alignment: AlignmentType.CENTER,
    indent: { firstLine: 0 },
    children: separator ? [new TextRun(separator)] : [],
  })
}

/** A dialogue line as a script line: SPEAKER (direction): line, with a hanging indent. */
export function docxDialogueLine(node: RichNode, ctx: DocxRichContext, hang = 720): Paragraph {
  const speaker = exportSpeaker(node.attrs, ctx.names)
  const direction = exportDirection(node.attrs)
  const children: ParagraphChild[] = []
  if (speaker) children.push(new TextRun({ text: exportCleanText(speaker), smallCaps: true, bold: true }))
  if (direction) children.push(new TextRun({ text: exportCleanText(`${speaker ? ' ' : ''}(${direction})`), italics: true }))
  if (speaker || direction) children.push(new TextRun(': '))
  children.push(...docxRuns(node.content, ctx))
  return new Paragraph({
    style: ctx.style,
    alignment: AlignmentType.LEFT,
    indent: { left: hang, hanging: hang },
    keepLines: true,
    children,
  })
}

/**
 * Paragraphs of a document. The first paragraph, and the first after a break or a heading, has no
 * first-line indent, as in a printed book.
 */
export function docxParagraphs(doc: RichDoc | null | undefined, ctx: DocxRichContext): Paragraph[] {
  const out: Paragraph[] = []
  let flush = true
  let list: { kind: 'bullet' | 'ordered', instance: number } | null = null

  const paragraph = (node: RichNode, options: Partial<IParagraphOptions> = {}, runs?: TextRun[]) => {
    const children = runs ?? docxRuns(node.content, ctx)
    if (!children.length) {
      // An empty paragraph is a blank line the author typed; what follows starts flush, as after a break.
      out.push(new Paragraph({ style: ctx.style, indent: { firstLine: 0 }, children: [] }))
      flush = true
      return
    }
    const align = typeof node.attrs?.textAlign === 'string' ? ALIGN[node.attrs.textAlign] : undefined
    const centred = align === AlignmentType.CENTER || align === AlignmentType.RIGHT
    out.push(new Paragraph({
      style: ctx.style,
      ...(align ? { alignment: align } : {}),
      indent: { firstLine: flush || centred ? 0 : ctx.indent },
      ...options,
      children,
    }))
    flush = false
  }

  const walk = (node: RichNode, depth: number) => {
    switch (node.type) {
      case 'doc':
        ;(node.content ?? []).forEach(n => walk(n, depth))
        return
      case 'paragraph':
        if (list) {
          out.push(new Paragraph({
            style: ctx.style,
            ...(list.kind === 'bullet' ? { bullet: { level: Math.min(depth, 8) } } : { numbering: { reference: 'dramatis-ordered', level: Math.min(depth, 8), instance: list.instance } }),
            children: docxRuns(node.content, ctx),
          }))
          return
        }
        paragraph(node)
        return
      case 'heading':
        flush = true
        paragraph(node, { keepNext: true, spacing: { before: 240 } }, docxRuns(node.content, ctx, { bold: true }))
        flush = true
        return
      case 'blockquote':
        flush = true
        for (const child of node.content ?? []) {
          if (child.type === 'paragraph') paragraph(child, { indent: { left: 720, right: 720, firstLine: 0 } })
          else walk(child, depth)
        }
        flush = true
        return
      case 'bulletList':
      case 'orderedList': {
        const outer = list
        list = { kind: node.type === 'bulletList' ? 'bullet' : 'ordered', instance: outer?.instance ?? ++ctx.lists.count }
        for (const item of node.content ?? []) walk(item, outer ? depth + 1 : depth)
        list = outer
        flush = true
        return
      }
      case 'listItem':
        ;(node.content ?? []).forEach(n => walk(n, depth))
        return
      case 'horizontalRule':
      case 'sceneBreak':
        out.push(docxSeparator(ctx.separator, ctx.style))
        flush = true
        return
      case 'dialogueLine':
        out.push(docxDialogueLine(node, ctx))
        flush = true
        return
      case 'codeBlock':
        for (const line of (node.content ?? []).map(n => n.text ?? '').join('').split('\n')) {
          out.push(new Paragraph({ style: ctx.style, indent: { firstLine: 0 }, children: [new TextRun({ text: exportCleanText(line), font: ctx.monoFont ?? 'Courier New' })] }))
        }
        flush = true
        return
      case 'image':
        return
      default:
        if (node.content) paragraph(node)
    }
  }

  const trimmed = exportTrimDoc(doc)
  if (trimmed) walk(trimmed, 0)
  return out
}
