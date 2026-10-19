import type { H3Event } from 'h3'

/** ASCII slug of a title: accents dropped, apostrophes joined ("L'inverno di Capo Nero" -> "linverno-di-capo-nero"). */
export function exportSlug(text: string, fallback = 'dramatis', max = 60): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/['’‘`´]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
  return slug || fallback
}

/** "linverno-di-capo-nero-2026-10-18.docx", with optional words after the title ("-backup"). */
export function exportFileName(title: string, day: string, extension: string, suffix?: string): string {
  return `${exportSlug(title)}${suffix ? `-${exportSlug(suffix)}` : ''}-${day}.${extension}`
}

export const EXPORT_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  txt: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
  twee: 'text/plain; charset=utf-8',
  ink: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  zip: 'application/zip',
} as const

/**
 * Sends a file as a download. The name travels in Content-Disposition (ASCII and UTF-8 forms)
 * and in x-dramatis-filename, which the export page reads.
 */
export function sendExportFile(event: H3Event, name: string, mime: string, data: Uint8Array | Buffer | string) {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  setResponseHeaders(event, {
    'content-type': mime,
    'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'x-dramatis-filename': encodeURIComponent(name),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  return typeof data === 'string' ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

/** Characters XML 1.0 does not allow (C0 controls except tab and line breaks, lone surrogates, U+FFFE/F). */
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Text safe for XML-based files (DOCX, EPUB): invalid characters removed. */
export function exportCleanText(text: string): string {
  return text.replace(XML_INVALID, '')
}

/** Escapes text for XML and XHTML, after removing the characters XML does not allow. */
export function exportEscapeXml(text: string): string {
  return exportCleanText(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
