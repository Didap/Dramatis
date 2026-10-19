import type { RichDoc, RichNode } from '#shared/types/domain'
import type { Manuscript } from './manuscript'
import { exportDirection, exportInlineText, exportSpeaker, exportTrimDoc } from './model'

/*
 * The manuscript as plain text (appendix D.3): UTF-8 with a byte order mark and CRLF line ends, so
 * Notepad and TextEdit both open it right; titles on their own lines followed by a blank line,
 * paragraphs separated by a blank line, separators on their own line ("***" when the option is a blank
 * line, which plain text could not tell from a paragraph break), formatting dropped.
 */

function blocks(doc: RichDoc | null, ms: Manuscript, separator: string): string[] {
  const out: string[] = []
  const walk = (node: RichNode, prefix = '') => {
    switch (node.type) {
      case 'doc':
      case 'blockquote':
        ;(node.content ?? []).forEach(n => walk(n, prefix))
        return
      case 'bulletList':
      case 'orderedList':
        ;(node.content ?? []).forEach((item, i) => {
          for (const child of item.content ?? []) walk(child, node.type === 'bulletList' ? '- ' : `${i + 1}. `)
        })
        return
      case 'horizontalRule':
      case 'sceneBreak':
        out.push(separator)
        return
      case 'image':
        return
      case 'dialogueLine': {
        const speaker = exportSpeaker(node.attrs, ms.names)
        const direction = exportDirection(node.attrs)
        const head = `${speaker.toLocaleUpperCase()}${direction ? `${speaker ? ' ' : ''}(${direction})` : ''}`
        out.push(`${head}${head ? ': ' : ''}${exportInlineText(node, ms.names).trim()}`)
        return
      }
      default:
        out.push(prefix + exportInlineText(node, ms.names, '\n').replace(/[ \t]+$/gm, ''))
    }
  }
  const trimmed = exportTrimDoc(doc)
  if (trimmed) walk(trimmed)
  return out
}

export function manuscriptTxt(ms: Manuscript): string {
  const separator = ms.separator || '***'
  const out: string[] = []
  if (ms.options.titlePage) {
    out.push(ms.title, ...(ms.subtitle ? [ms.subtitle] : []), '', ...(ms.author ? [ms.author, ''] : []), ms.wordsLabel, '', '')
  }
  for (const part of ms.parts) {
    if (part.heading) out.push('', part.heading, '')
    for (const chapter of part.chapters) {
      if (chapter.heading) out.push('', chapter.heading, '')
      for (const scene of chapter.scenes) {
        if (scene.separatorBefore) out.push(separator, '')
        if (scene.heading) out.push(scene.heading, '')
        for (const block of blocks(scene.content, ms, separator)) out.push(block, '')
      }
    }
  }
  const text = out.join('\n').replace(/\n{4,}/g, '\n\n\n').trim()
  return `﻿${text.replace(/\r?\n/g, '\r\n')}\r\n`
}
