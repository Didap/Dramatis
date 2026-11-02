import type { PageWidth } from '#shared/types/domain'

const LENGTHS: Record<PageWidth, string> = { book: '40rem', wide: '50rem', full: '100%' }

/** The max-width of a page of text; values saved before the three widths (narrow, medium) read as book. */
export function pageWidthLength(width: string | undefined) {
  return LENGTHS[width as PageWidth] ?? LENGTHS.book
}
