import type { RichDoc, RichNode } from '#shared/types/domain'
import { exportEscapeXml } from './files'
import { exportDirection, exportMentionText, exportSpeaker, exportTrimDoc } from './model'

/*
 * Rich text (TipTap JSON) to XHTML, for the EPUB chapters and the print page. Everything is escaped
 * and every attribute comes from a fixed list, so the result is safe to insert as HTML.
 */

export interface HtmlRichContext {
  names: Map<string, string>
  /** Text of a break inside a scene ("***", "#", or "" for a blank line). */
  separator: string
}

const ALIGN = new Set(['left', 'center', 'right', 'justify'])

/** The separator between two sections or two scenes: a centred line, or a blank one. */
export function htmlSeparator(separator: string): string {
  return separator ? `<p class="sep">${exportEscapeXml(separator)}</p>` : '<p class="sep sep-blank">&#160;</p>'
}

function inline(nodes: readonly RichNode[] | undefined, ctx: HtmlRichContext): string {
  let html = ''
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      html += '<br/>'
      continue
    }
    if (node.type !== 'text' && node.type !== 'mention') {
      html += inline(node.content, ctx)
      continue
    }
    let text = exportEscapeXml(node.type === 'mention' ? exportMentionText(node, ctx.names) : node.text ?? '')
    if (!text) continue
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = `<strong>${text}</strong>`
      else if (mark.type === 'italic') text = `<em>${text}</em>`
      else if (mark.type === 'underline') text = `<u>${text}</u>`
      else if (mark.type === 'strike') text = `<s>${text}</s>`
      else if (mark.type === 'code') text = `<code>${text}</code>`
    }
    html += text
  }
  return html
}

/**
 * XHTML of a document. The first paragraph, and the first after a break or a heading, carries the
 * class "first" (no indent).
 */
export function richToHtml(doc: RichDoc | null | undefined, ctx: HtmlRichContext): string {
  let html = ''
  let flush = true

  const paragraph = (node: RichNode, tag = 'p', extraClass = '') => {
    const align = typeof node.attrs?.textAlign === 'string' && ALIGN.has(node.attrs.textAlign) && node.attrs.textAlign !== 'left' ? node.attrs.textAlign : ''
    const body = inline(node.content, ctx)
    if (!body) {
      // An empty paragraph is a blank line the author typed; what follows starts flush, as after a break.
      html += '<p class="blank">&#160;</p>'
      flush = true
      return
    }
    const classes = [flush ? 'first' : '', align ? `align-${align}` : '', extraClass].filter(Boolean).join(' ')
    html += `<${tag}${classes ? ` class="${classes}"` : ''}>${body}</${tag}>`
    flush = false
  }

  const walk = (node: RichNode) => {
    switch (node.type) {
      case 'doc':
        ;(node.content ?? []).forEach(walk)
        return
      case 'paragraph':
        paragraph(node)
        return
      case 'heading':
        flush = true
        paragraph(node, 'p', 'subhead')
        flush = true
        return
      case 'blockquote':
        html += '<blockquote>'
        flush = true
        ;(node.content ?? []).forEach(walk)
        html += '</blockquote>'
        flush = true
        return
      case 'bulletList':
      case 'orderedList': {
        const tag = node.type === 'bulletList' ? 'ul' : 'ol'
        const items = (node.content ?? []).filter(item => item.type === 'listItem')
        if (!items.length) return
        html += `<${tag}>`
        for (const item of items) {
          html += '<li>'
          for (const child of item.content ?? []) {
            if (child.type === 'paragraph') html += inline(child.content, ctx) || '&#160;'
            else walk(child)
          }
          html += '</li>'
        }
        html += `</${tag}>`
        flush = true
        return
      }
      case 'horizontalRule':
      case 'sceneBreak':
        html += htmlSeparator(ctx.separator)
        flush = true
        return
      case 'dialogueLine': {
        const speaker = exportSpeaker(node.attrs, ctx.names)
        const direction = exportDirection(node.attrs)
        const head = [
          speaker ? `<span class="speaker">${exportEscapeXml(speaker)}</span>` : '',
          direction ? `${speaker ? ' ' : ''}<span class="direction">(${exportEscapeXml(direction)})</span>` : '',
        ].join('')
        html += `<p class="line">${head}${head ? ': ' : ''}${inline(node.content, ctx)}</p>`
        flush = true
        return
      }
      case 'codeBlock':
        html += `<pre>${exportEscapeXml((node.content ?? []).map(n => n.text ?? '').join(''))}</pre>`
        flush = true
        return
      case 'image':
        return
      default:
        if (node.content) paragraph(node)
    }
  }

  const trimmed = exportTrimDoc(doc)
  if (trimmed) walk(trimmed)
  return html
}
