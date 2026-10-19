import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { strFromU8 } from 'fflate'
import type { RichDoc, RichNode } from '#shared/types/domain'
import { countWords, richToPlainText } from '#shared/utils/richtext'
import { exportTranslator } from './i18n'

/*
 * Manuscript import (spec section 6, P1): a DOCX or a Markdown (or plain text) manuscript becomes a new
 * project, its headings becoming parts, chapters and scenes. With three heading levels they are parts,
 * chapters and scenes; with two, parts and chapters when separators ("***", "* * *", "#") cut the scenes,
 * otherwise chapters and scenes; with one, chapters, whose scenes are split at the separators; with none,
 * a single chapter. The text keeps bold, italic, underline,
 * strikethrough, quotes, lists and alignment. Imports do not count as words written.
 */

type Block =
  | { kind: 'heading', level: number, text: string }
  | { kind: 'title', text: string }
  | { kind: 'break' }
  | { kind: 'block', node: RichNode }

export interface ImportedScene { title: string, content: RichNode[] }
export interface ImportedChapter { title: string, scenes: ImportedScene[] }
export interface ImportedPart { title: string, chapters: ImportedChapter[] }
export interface ImportedManuscript {
  title: string
  /** The numbering found in front of every chapter title ("1. ", "II. "), taken off the titles. */
  numbering: 'arabic' | 'roman' | null
  /** True when the first heading level became parts. */
  usesParts: boolean
  parts: ImportedPart[]
}

const SEPARATOR = /^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|(?:~\s*){3,}|#|§)\s*$/

const textNode = (text: string, marks: string[] = []): RichNode =>
  marks.length ? { type: 'text', text, marks: marks.map(type => ({ type })) } : { type: 'text', text }

/** Text runs merged when their marks are the same, without empty ones. */
function tidy(nodes: RichNode[]): RichNode[] {
  const out: RichNode[] = []
  for (const node of nodes) {
    if (node.type === 'text' && !node.text) continue
    const last = out.at(-1)
    if (last?.type === 'text' && node.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(node.marks ?? [])) {
      last.text = `${last.text}${node.text}`
      continue
    }
    out.push({ ...node })
  }
  return out
}

const plain = (nodes: RichNode[]) => nodes.map(n => n.text ?? '').join('')

// ---------------------------------------------------------------- Markdown and plain text

/** Inline Markdown: **bold**, *italic*, _italic_, ~~strike~~, `code`, [links](...) as text, \ escapes. */
function markdownInline(text: string): RichNode[] {
  const out: RichNode[] = []
  const marks: string[] = []
  let buffer = ''
  const flush = () => {
    if (buffer) out.push(textNode(buffer, [...marks]))
    buffer = ''
  }
  const toggle = (mark: string) => {
    flush()
    const at = marks.indexOf(mark)
    if (at >= 0) marks.splice(at, 1)
    else marks.push(mark)
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    const next = text[i + 1]
    if (ch === '\\' && next && /[\\`*_{}[\]()#+\-.!~>|]/.test(next)) {
      buffer += next
      i++
      continue
    }
    if ((ch === '*' && next === '*') || (ch === '_' && next === '_' && !/\w/.test(text[i - 1] ?? ''))) {
      toggle('bold')
      i++
      continue
    }
    if (ch === '~' && next === '~') {
      toggle('strike')
      i++
      continue
    }
    // A single * or _ around a word is italic; inside a word (snake_case) it stays a character.
    if (ch === '*' || (ch === '_' && (!/\w/.test(text[i - 1] ?? '') || !/\w/.test(next ?? '')))) {
      const closing = marks.includes('italic')
      const opens = !closing && next !== undefined && !/\s/.test(next) && text.indexOf(ch, i + 1) > i
      if (closing || opens) {
        toggle('italic')
        continue
      }
    }
    if (ch === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i) {
        flush()
        out.push(textNode(text.slice(i + 1, end), [...marks, 'code']))
        i = end
        continue
      }
    }
    if (ch === '[') {
      const link = /^\[([^\]]*)\]\(([^)]*)\)/.exec(text.slice(i))
      if (link) {
        buffer += link[1]
        i += link[0].length - 1
        continue
      }
    }
    buffer += ch
  }
  flush()
  return tidy(out)
}

/** Blocks of a Markdown document; with `lines`, every line is a paragraph (plain text files). */
export function markdownBlocks(source: string, options: { lines?: boolean } = {}): Block[] {
  const text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '')
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean, items: RichNode[] } | null = null
  let quote: string[] = []

  const endParagraph = () => {
    if (!paragraph.length) return
    // Two spaces or a backslash at the end of a line break it; other line ends are spaces.
    const nodes: RichNode[] = []
    paragraph.forEach((line, i) => {
      const hard = /( {2,}|\\)$/.test(line)
      nodes.push(...markdownInline(line.replace(/( {2,}|\\)$/, '').trim()))
      if (i < paragraph.length - 1) nodes.push(hard ? { type: 'hardBreak' } : textNode(' '))
    })
    const content = tidy(nodes)
    if (content.length) blocks.push({ kind: 'block', node: { type: 'paragraph', content } })
    paragraph = []
  }
  const endList = () => {
    if (!list) return
    blocks.push({ kind: 'block', node: { type: list.ordered ? 'orderedList' : 'bulletList', content: list.items } })
    list = null
  }
  const endQuote = () => {
    if (!quote.length) return
    const inner = markdownBlocks(quote.join('\n')).flatMap(b => (b.kind === 'block' ? [b.node] : []))
    if (inner.length) blocks.push({ kind: 'block', node: { type: 'blockquote', content: inner } })
    quote = []
  }
  const endAll = () => {
    endParagraph()
    endList()
    endQuote()
  }

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, (m: string) => (m.length >= 2 && !options.lines ? '  ' : ''))
    if (!line.trim()) {
      endAll()
      continue
    }
    if (/^\s{0,3}>/.test(line)) {
      endParagraph()
      endList()
      quote.push(line.replace(/^\s{0,3}>\s?/, ''))
      continue
    }
    endQuote()
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      endAll()
      blocks.push({ kind: 'heading', level: heading[1]!.length, text: plain(markdownInline(heading[2]!)) })
      continue
    }
    if (SEPARATOR.test(line)) {
      endAll()
      blocks.push({ kind: 'break' })
      continue
    }
    const item = /^\s{0,3}(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/.exec(line)
    if (item && !options.lines) {
      endParagraph()
      const ordered = !!item[2]
      if (list && list.ordered !== ordered) endList()
      list ??= { ordered, items: [] }
      list.items.push({ type: 'listItem', content: [{ type: 'paragraph', content: markdownInline(item[3]!.trim()) }] })
      continue
    }
    endList()
    if (options.lines) {
      const content = markdownInline(line.trim())
      if (content.length) blocks.push({ kind: 'block', node: { type: 'paragraph', content } })
      continue
    }
    paragraph.push(line)
  }
  endAll()
  return blocks
}

// ---------------------------------------------------------------- DOCX

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' }
const unescapeXml = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code: string) =>
    code[0] === '#' ? String.fromCodePoint(code[1] === 'x' || code[1] === 'X' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10)) : XML_ENTITIES[code.toLowerCase()]!)

const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1]

/** Paragraph styles of a document: their heading level (1 to 9) or "title". */
function docxStyles(xml: string): Map<string, number | 'title'> {
  const styles = new Map<string, number | 'title'>()
  for (const match of xml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const head = match[1]!
    if (attr(head, 'w:type') !== 'paragraph') continue
    const id = attr(head, 'w:styleId')
    if (!id) continue
    const body = match[2]!
    const name = (/<w:name w:val="([^"]*)"/.exec(body)?.[1] ?? '').toLowerCase()
    const outline = /<w:outlineLvl w:val="(\d)"/.exec(body)?.[1]
    if (name === 'title' || id.toLowerCase() === 'title') styles.set(id, 'title')
    else if (/^heading \d$/.test(name)) styles.set(id, Number(name.slice(8)))
    else if (outline !== undefined && Number(outline) < 9) styles.set(id, Number(outline) + 1)
  }
  return styles
}

/** Blocks of a Word document: headings by style or outline level, paragraphs with their formatting. */
export function docxBlocks(entries: Record<string, Uint8Array>): Block[] {
  const document = entries['word/document.xml']
  if (!document) return []
  const xml = strFromU8(document)
  const styles = docxStyles(entries['word/styles.xml'] ? strFromU8(entries['word/styles.xml']) : '')
  const blocks: Block[] = []
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml

  for (const match of body.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const inner = match[1] ?? ''
    const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(inner)?.[1] ?? ''
    const styleId = /<w:pStyle w:val="([^"]*)"/.exec(pPr)?.[1]
    const ownOutline = /<w:outlineLvl w:val="(\d)"/.exec(pPr)?.[1]
    const level = (styleId ? styles.get(styleId) : undefined) ?? (ownOutline !== undefined && Number(ownOutline) < 9 ? Number(ownOutline) + 1 : undefined)
    const jc = /<w:jc w:val="([^"]*)"/.exec(pPr)?.[1]
    const numbered = /<w:numPr>/.test(pPr)

    // Runs in order: deleted text (tracked changes) and field instructions are left out.
    const nodes: RichNode[] = []
    const visible = inner.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '').replace(/<w:del\b[\s\S]*?<\/w:del>/g, '').replace(/<w:instrText\b[\s\S]*?<\/w:instrText>/g, '')
    for (const run of visible.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const content = run[1]!
      const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(content)?.[1] ?? ''
      const on = (tag: string) => new RegExp(`<w:${tag}(?: w:val="(?!0|false|none)[^"]*")?\\s*/>`).test(rPr)
      const marks = [on('b') ? 'bold' : '', on('i') ? 'italic' : '', on('u') ? 'underline' : '', on('strike') ? 'strike' : ''].filter(Boolean)
      for (const piece of content.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\b([^>]*)\/>|<w:cr\s*\/>|<w:noBreakHyphen\s*\/>/g)) {
        if (piece[0].startsWith('<w:t')) {
          if (piece[0].startsWith('<w:tab')) nodes.push(textNode('\t', marks))
          else nodes.push(textNode(unescapeXml(piece[1] ?? ''), marks))
        }
        else if (piece[0].startsWith('<w:br')) {
          if (!/w:type="(page|column)"/.test(piece[2] ?? '')) nodes.push({ type: 'hardBreak' })
        }
        else if (piece[0].startsWith('<w:cr')) nodes.push({ type: 'hardBreak' })
        else nodes.push(textNode('-', marks))
      }
    }
    const content = tidy(nodes)
    const text = plain(content).trim()
    if (!text) continue
    if (level === 'title') {
      blocks.push({ kind: 'title', text })
      continue
    }
    if (typeof level === 'number') {
      blocks.push({ kind: 'heading', level, text })
      continue
    }
    if (SEPARATOR.test(text)) {
      blocks.push({ kind: 'break' })
      continue
    }
    const align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : undefined
    const paragraph: RichNode = { type: 'paragraph', ...(align ? { attrs: { textAlign: align } } : {}), content }
    const last = blocks.at(-1)
    if (numbered) {
      // Word's list paragraphs become a bulleted list (their numbering lives in numbering.xml).
      const item: RichNode = { type: 'listItem', content: [paragraph] }
      if (last?.kind === 'block' && last.node.type === 'bulletList') last.node.content!.push(item)
      else blocks.push({ kind: 'block', node: { type: 'bulletList', content: [item] } })
      continue
    }
    blocks.push({ kind: 'block', node: paragraph })
  }
  return blocks
}

// ---------------------------------------------------------------- structure

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
function romanValue(text: string): number {
  let total = 0
  for (let i = 0; i < text.length; i++) {
    const value = ROMAN_VALUES[text[i]!]!
    const next = ROMAN_VALUES[text[i + 1] ?? ''] ?? 0
    total += value < next ? -value : value
  }
  return total
}

/**
 * When every chapter title starts with its own number in sequence ("1. Il porto", "2. La torre", or
 * "I.", "II."), the numbers go: Dramatis numbers chapters itself, and an export would print them twice.
 */
function stripChapterNumbers(chapters: ImportedChapter[]): 'arabic' | 'roman' | null {
  const titled = chapters.filter(c => c.title)
  if (titled.length < 2 || titled.length !== chapters.length) return null
  const matches = titled.map(c => /^(\d{1,3}|[IVXLCDM]{1,8})[.)]\s+(\S.*)$/.exec(c.title))
  if (matches.some(m => !m)) return null
  const roman = matches.every(m => /^[IVXLCDM]+$/.test(m![1]!))
  const numbers = matches.map(m => (roman ? romanValue(m![1]!) : Number(m![1])))
  if (numbers.some((n, i) => n !== i + 1)) return null
  titled.forEach((c, i) => { c.title = matches[i]![2]! })
  return roman ? 'roman' : 'arabic'
}

/** Parts, chapters and scenes from the headings of the blocks (see the comment at the top). */
export function buildImportedManuscript(input: Block[], fallbackTitle: string): ImportedManuscript {
  const titleAt = input.findIndex(b => b.kind === 'title')
  const title = titleAt >= 0 ? (input[titleAt] as Extract<Block, { kind: 'title' }>).text : fallbackTitle
  // A title page (subtitle, author, a word count) between the title and the first heading is left out;
  // a real opening is longer than that.
  let blocks = input
  if (titleAt >= 0) {
    const firstHeading = input.findIndex((b, i) => i > titleAt && (b.kind === 'heading' || b.kind === 'break'))
    const front = input.slice(titleAt + 1, firstHeading < 0 ? input.length : firstHeading)
    const words = front.reduce((n, b) => n + (b.kind === 'block' ? countWords(richToPlainText({ type: 'doc', content: [b.node] })) : 0), 0)
    if (firstHeading > 0 && words < 60) blocks = [...input.slice(0, titleAt + 1), ...input.slice(firstHeading)]
  }
  const levels = [...new Set(blocks.flatMap(b => (b.kind === 'heading' ? [b.level] : [])))].sort((a, b) => a - b)
  const role = new Map<number, 'part' | 'chapter' | 'scene'>()
  if (levels.length >= 3) {
    role.set(levels[0]!, 'part')
    role.set(levels[1]!, 'chapter')
    role.set(levels[2]!, 'scene')
  }
  else if (levels.length === 2) {
    // Two levels are parts and chapters when the scenes are cut by separators, as in most manuscripts
    // (and in Dramatis' own DOCX); otherwise chapters and scenes.
    const separated = blocks.some(b => b.kind === 'break')
    role.set(levels[0]!, separated ? 'part' : 'chapter')
    role.set(levels[1]!, separated ? 'chapter' : 'scene')
  }
  else if (levels.length === 1) {
    role.set(levels[0]!, 'chapter')
  }
  const scenesFromHeadings = [...role.values()].includes('scene')

  const parts: ImportedPart[] = []
  const part = () => parts.at(-1) ?? (parts.push({ title: '', chapters: [] }), parts.at(-1)!)
  const chapter = () => {
    const p = part()
    return p.chapters.at(-1) ?? (p.chapters.push({ title: '', scenes: [] }), p.chapters.at(-1)!)
  }
  const scene = () => {
    const c = chapter()
    return c.scenes.at(-1) ?? (c.scenes.push({ title: '', content: [] }), c.scenes.at(-1)!)
  }

  for (const block of blocks) {
    if (block.kind === 'title') continue
    if (block.kind === 'heading') {
      const what = role.get(block.level)
      if (what === 'part') parts.push({ title: block.text, chapters: [] })
      else if (what === 'chapter') part().chapters.push({ title: block.text, scenes: [] })
      else if (what === 'scene') chapter().scenes.push({ title: block.text, content: [] })
      // Deeper headings stay in the text, as headings inside the scene.
      else scene().content.push({ type: 'heading', attrs: { level: 3 }, content: [textNode(block.text)] })
      continue
    }
    if (block.kind === 'break') {
      // Without scene headings, a separator starts the next scene; with them, it is a break inside the scene.
      if (!scenesFromHeadings && scene().content.length) chapter().scenes.push({ title: '', content: [] })
      else if (scenesFromHeadings && scene().content.length) scene().content.push({ type: 'sceneBreak' })
      continue
    }
    scene().content.push(block.node)
  }

  // Empty scenes made by a trailing separator go; a chapter keeps at least one scene.
  for (const p of parts) {
    for (const c of p.chapters) {
      c.scenes = c.scenes.filter((s, i) => s.content.length || s.title || i === 0)
      if (!c.scenes.length) c.scenes.push({ title: '', content: [] })
    }
  }
  const kept = parts.filter(p => p.chapters.length || p.title)
  const numbering = stripChapterNumbers(kept.flatMap(p => p.chapters))
  // Scene codes printed by an export ("S014 Il bivio") are given again by the new project.
  const scenes = kept.flatMap(p => p.chapters.flatMap(c => c.scenes)).filter(sc => sc.title)
  if (scenes.length && scenes.every(sc => /^S\d{3,}\s+\S/.test(sc.title))) for (const sc of scenes) sc.title = sc.title.replace(/^S\d{3,}\s+/, '')
  return { title: title.trim() || fallbackTitle, usesParts: [...role.values()].includes('part'), numbering, parts: kept.length ? kept : [{ title: '', chapters: [{ title: '', scenes: [{ title: '', content: [] }] }] }] }
}

/** Creates the project of an imported manuscript (a novel, guidance off as for every import). */
export async function createProjectFromManuscript(user: { id: string, name: string, locale: string }, manuscript: ImportedManuscript) {
  const locale = user.locale === 'en' ? 'en' : 'it'
  return useDb().transaction(async (tx) => {
    const [project] = await tx.insert(tables.projects).values({
      ownerId: user.id,
      kind: 'novel',
      title: manuscript.title.slice(0, 200),
      authorName: user.name.slice(0, 200),
      language: locale,
      openedAt: new Date(),
      settings: {
        guidance: false,
        dialogueStyle: defaultDialogueStyle(locale),
        smartTypography: true,
        parts: manuscript.usesParts,
        ...(manuscript.numbering ? { chapterNumbering: manuscript.numbering } : {}),
      },
    }).returning()
    const pid = project!.id
    // An untitled part takes the word of the outline and its number ("Parte 2").
    const fallbackPart = exportTranslator(locale)('common.vocab.novel.part', {}, 1)

    let partIndex = 0
    const chapterPositions = new Map<string | null, number>()
    for (const part of manuscript.parts) {
      let partId: string | null = null
      if (manuscript.usesParts) {
        const [row] = await tx.insert(tables.parts).values({ projectId: pid, title: (part.title || `${fallbackPart} ${partIndex + 1}`).slice(0, 300), position: partIndex }).returning({ id: tables.parts.id })
        partId = row!.id
        partIndex++
      }
      for (const chapter of part.chapters) {
        const position = chapterPositions.get(partId) ?? 0
        chapterPositions.set(partId, position + 1)
        const [chapterRow] = await tx.insert(tables.chapters).values({ projectId: pid, partId, title: chapter.title.slice(0, 300), position }).returning({ id: tables.chapters.id })
        for (const [index, scene] of chapter.scenes.entries()) {
          // Scene codes are handed out in reading order, as if the author had written them one by one.
          const content: RichDoc | null = scene.content.length ? { type: 'doc', content: scene.content } : null
          const measured = measureDoc(content)
          const sceneId = randomUUID()
          const revisionId = randomUUID()
          await tx.insert(tables.scenes).values({
            id: sceneId,
            projectId: pid,
            chapterId: chapterRow!.id,
            code: await nextSceneCode(pid, tx),
            title: scene.title.slice(0, 300),
            status: content ? 'draft' : 'planned',
            position: index,
            wordCount: measured.wordCount,
            charCount: measured.charCount,
            charCountNoSpaces: measured.charCountNoSpaces,
            currentRevisionId: revisionId,
            editedAt: content ? new Date() : null,
          })
          await tx.insert(tables.sceneRevisions).values({ id: revisionId, projectId: pid, sceneId, number: 1, content, ...measured })
        }
      }
    }
    const [row] = await tx.select().from(tables.projects).where(eq(tables.projects.id, pid))
    return row!
  })
}
