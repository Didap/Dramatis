import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  VerticalAlignSection,
  type ISectionOptions,
} from 'docx'
import { DOCX_NUMBERING, docxListCounter, docxParagraphs, docxSeparator, type DocxRichContext } from './docx-rich'
import { exportCleanText } from './files'
import type { Manuscript } from './manuscript'

/*
 * The manuscript as DOCX (appendix D.1), with real styles (Title, Heading 1 parts, Heading 2 chapters,
 * Heading 3 scenes, Normal) so an editor can restyle the whole file, and the two layouts:
 * - "Cartella editoriale": A4, Courier New 12 pt, 60 characters per line and 30 lines per page
 *   (the Italian standard page of 1,800 characters), page numbers;
 * - "Libro": A5, the manuscript serif at 11 pt, justified, first-line indent, no indent after
 *   headings and separators.
 */

interface Layout {
  font: string
  /** Half-points. */
  size: number
  line: number
  lineRule: (typeof LineRuleType)[keyof typeof LineRuleType]
  indent: number
  align: (typeof AlignmentType)[keyof typeof AlignmentType]
  page: { width: number, height: number }
  margin: { top: number, bottom: number, left: number, right: number, header: number, footer: number }
  pageNumber: (typeof AlignmentType)[keyof typeof AlignmentType]
  title: number
  part: number
  chapter: number
  scene: number
}

const LAYOUTS: Record<'manuscript' | 'book', Layout> = {
  // 60 Courier characters of 7.2 pt fill 432 pt; 30 exact lines of 24 pt fill 720 pt of the A4 page.
  manuscript: {
    font: 'Courier New',
    size: 24,
    line: 480,
    lineRule: LineRuleType.EXACT,
    indent: 720,
    align: AlignmentType.LEFT,
    page: { width: 11906, height: 16838 },
    margin: { top: 1219, bottom: 1219, left: 1633, right: 1633, header: 567, footer: 567 },
    pageNumber: AlignmentType.RIGHT,
    title: 24,
    part: 24,
    chapter: 24,
    scene: 24,
  },
  book: {
    font: 'Literata',
    size: 22,
    line: 300,
    lineRule: LineRuleType.AUTO,
    indent: 284,
    align: AlignmentType.JUSTIFIED,
    page: { width: 8391, height: 11906 },
    margin: { top: 1134, bottom: 1191, left: 1021, right: 1021, header: 567, footer: 567 },
    pageNumber: AlignmentType.CENTER,
    title: 44,
    part: 34,
    chapter: 30,
    scene: 22,
  },
}

export async function manuscriptDocx(ms: Manuscript): Promise<Buffer> {
  const layout = LAYOUTS[ms.options.layout]
  const grid = ms.options.layout === 'manuscript'
  // In the cartella every space is a whole number of lines, so the 30-line grid holds.
  const line = (n: number) => (grid ? n * 480 : Math.round(n * 240))

  const ctx: DocxRichContext = { names: ms.names, indent: layout.indent, separator: ms.separator, lists: docxListCounter() }
  const body: Paragraph[] = []
  let first = true

  for (const part of ms.parts) {
    if (part.heading) {
      body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !first, children: [new TextRun(exportCleanText(part.heading))] }))
      first = false
    }
    part.chapters.forEach((chapter, index) => {
      // A chapter starts a new page, except the first one right after its part's title.
      const breakBefore = !first && !(index === 0 && part.heading)
      if (chapter.heading) {
        body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore: breakBefore, children: [new TextRun(exportCleanText(chapter.heading))] }))
      }
      else if (breakBefore) {
        body.push(new Paragraph({ pageBreakBefore: true, children: [] }))
      }
      first = false
      for (const scene of chapter.scenes) {
        if (scene.separatorBefore) body.push(docxSeparator(ms.separator))
        if (scene.heading) body.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(exportCleanText(scene.heading))] }))
        body.push(...docxParagraphs(scene.content, ctx))
      }
    })
  }

  const pageProps = { size: layout.page, margin: layout.margin }
  const sections: ISectionOptions[] = []
  if (ms.options.titlePage) {
    const lines = [
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(exportCleanText(ms.title))] }),
      ...(ms.subtitle ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: line(1) }, children: [new TextRun({ text: exportCleanText(ms.subtitle), italics: true })] })] : []),
      ...(ms.author ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: line(2) }, children: [new TextRun(exportCleanText(ms.author))] })] : []),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: line(2) }, children: [new TextRun(ms.wordsLabel)] }),
    ]
    sections.push({ properties: { page: pageProps, verticalAlign: VerticalAlignSection.CENTER }, children: lines })
  }
  sections.push({
    properties: { page: { ...pageProps, pageNumbers: { start: 1 } } },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: layout.pageNumber, indent: { firstLine: 0 }, children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }),
    },
    children: body.length ? body : [new Paragraph({ children: [] })],
  })

  const heading = (size: number, options: { before: number, after: number, align?: (typeof AlignmentType)[keyof typeof AlignmentType], italics?: boolean, bold?: boolean, outline?: number }) => ({
    run: { font: layout.font, size, bold: options.bold ?? true, italics: options.italics ?? false, color: '000000' },
    paragraph: {
      alignment: options.align ?? AlignmentType.CENTER,
      spacing: { before: options.before, after: options.after, line: layout.line, lineRule: layout.lineRule },
      indent: { firstLine: 0 },
      keepNext: true,
      keepLines: true,
      // The outline level puts the heading in the navigation pane of Word and LibreOffice.
      ...(options.outline !== undefined ? { outlineLevel: options.outline } : {}),
    },
  })

  const doc = new Document({
    title: ms.title,
    creator: ms.author || undefined,
    description: ms.subtitle || undefined,
    numbering: DOCX_NUMBERING,
    styles: {
      default: {
        document: {
          run: { font: layout.font, size: layout.size, language: { value: docxLanguage(ms.language) } },
          paragraph: { alignment: layout.align, spacing: { before: 0, after: 0, line: layout.line, lineRule: layout.lineRule } },
        },
        title: heading(layout.title, { before: 0, after: line(1) }),
        heading1: heading(layout.part, { before: grid ? 0 : line(10), after: line(grid ? 1 : 2), outline: 0 }),
        heading2: heading(layout.chapter, { before: grid ? 0 : line(6), after: line(grid ? 1 : 2), outline: 1 }),
        heading3: heading(layout.scene, { before: line(1), after: grid ? 0 : line(0.5), italics: !grid, bold: grid, outline: 2 }),
      },
      // Normal repeats the document defaults: some readers (Quick Look, Pages) ignore the defaults.
      paragraphStyles: [{
        id: 'Normal',
        name: 'Normal',
        quickFormat: true,
        run: { font: layout.font, size: layout.size },
        paragraph: { alignment: layout.align, spacing: { before: 0, after: 0, line: layout.line, lineRule: layout.lineRule } },
      }],
    },
    sections,
  })
  return Packer.toBuffer(doc)
}

const REGIONS: Record<string, string> = { it: 'it-IT', en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', pt: 'pt-PT', nl: 'nl-NL' }

/** Word's proofing wants a language with its region ("it-IT"). */
export function docxLanguage(language: string): string {
  return language.includes('-') ? language : REGIONS[language.toLowerCase()] ?? language
}
