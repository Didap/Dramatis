import { strToU8, zipSync, type Zippable } from 'fflate'
import { exportEscapeXml } from './files'
import { htmlSeparator, richToHtml } from './html'
import type { ExportTranslator } from './i18n'
import type { Manuscript } from './manuscript'

/*
 * The manuscript as EPUB 3 (appendix D.2): metadata from the project, a table of contents from parts and
 * chapters, one XHTML file per chapter (and one per part title), separators, italic and bold kept.
 * The mimetype comes first and uncompressed, as epubcheck requires.
 */

const CSS = `@charset "UTF-8";
body { font-family: serif; line-height: 1.5; margin: 0 4%; }
h1, h2 { font-weight: normal; text-align: center; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.6em; margin: 30% 0 1em; }
h2 { font-size: 1.35em; margin: 2.5em 0 1.5em; }
h3 { font-size: 1em; font-style: italic; font-weight: normal; text-align: center; margin: 2em 0 1em; page-break-after: avoid; break-after: avoid; }
p { margin: 0; text-indent: 1.5em; text-align: justify; hyphens: auto; -epub-hyphens: auto; }
p.first, p.blank, p.sep, p.line, p.subhead { text-indent: 0; }
p.sep { text-align: center; margin: 1em 0; }
p.subhead { font-weight: bold; margin-top: 1em; }
p.line { text-align: left; margin: 0.3em 0; padding-left: 2em; text-indent: -2em; }
p.align-center { text-align: center; text-indent: 0; }
p.align-right { text-align: right; text-indent: 0; }
p.align-justify { text-align: justify; }
.speaker { font-variant: small-caps; font-weight: bold; letter-spacing: 0.03em; }
.direction { font-style: italic; }
blockquote { margin: 1em 2em; }
pre { font-family: monospace; white-space: pre-wrap; }
.title-page { text-align: center; margin-top: 25%; }
.title-page h1 { margin: 0 0 0.5em; font-size: 2em; }
.title-page .subtitle { font-style: italic; text-indent: 0; text-align: center; margin-bottom: 3em; }
.title-page .author { text-indent: 0; text-align: center; font-size: 1.15em; margin-bottom: 3em; }
.title-page .words { text-indent: 0; text-align: center; font-size: 0.9em; }
nav ol { list-style: none; padding-left: 1em; }
.cover { margin: 0; padding: 0; text-align: center; }
.cover img { max-width: 100%; max-height: 100vh; }
`

function page(lang: string, title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
<meta charset="UTF-8"/>
<title>${exportEscapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>
`
}

interface Item {
  id: string
  href: string
  body: string
  title: string
  properties?: string
}

/** A cover for the EPUB (P1): JPEG or PNG bytes. */
export interface EpubCover {
  data: Uint8Array
  type: 'jpg' | 'png'
}

/** The EPUB file of a manuscript. `id` is a stable identifier of the work (the project id). */
export function manuscriptEpub(ms: Manuscript, id: string, t: ExportTranslator, cover?: EpubCover): Uint8Array {
  const lang = exportEscapeXml(ms.language)
  const items: Item[] = []
  const toc: string[] = []
  const coverFile = cover ? `cover.${cover.type}` : ''

  if (cover) {
    items.push({
      id: 'cover',
      href: 'cover.xhtml',
      title: ms.title,
      body: `<section class="cover" epub:type="cover"><img src="${coverFile}" alt="${exportEscapeXml(ms.title)}"/></section>`,
    })
  }

  if (ms.options.titlePage) {
    const body = [
      `<section class="title-page" epub:type="titlepage">`,
      `<h1>${exportEscapeXml(ms.title)}</h1>`,
      ms.subtitle ? `<p class="subtitle">${exportEscapeXml(ms.subtitle)}</p>` : '',
      ms.author ? `<p class="author">${exportEscapeXml(ms.author)}</p>` : '',
      `<p class="words">${exportEscapeXml(ms.wordsLabel)}</p>`,
      `</section>`,
    ].filter(Boolean).join('\n')
    items.push({ id: 'title-page', href: 'title.xhtml', body, title: ms.title })
  }

  let chapterIndex = 0
  ms.parts.forEach((part, partIndex) => {
    const chapterEntries: string[] = []
    let partHref = ''
    if (part.heading) {
      partHref = `part-${String(partIndex + 1).padStart(2, '0')}.xhtml`
      items.push({
        id: `part-${partIndex + 1}`,
        href: partHref,
        title: part.heading,
        body: `<section epub:type="part"><h1>${exportEscapeXml(part.heading)}</h1></section>`,
      })
    }
    for (const chapter of part.chapters) {
      chapterIndex++
      const href = `chapter-${String(chapterIndex).padStart(3, '0')}.xhtml`
      const html: string[] = [`<section epub:type="chapter">`]
      if (chapter.heading) html.push(`<h2>${exportEscapeXml(chapter.heading)}</h2>`)
      for (const scene of chapter.scenes) {
        if (scene.separatorBefore) html.push(htmlSeparator(ms.separator))
        if (scene.heading) html.push(`<h3>${exportEscapeXml(scene.heading)}</h3>`)
        html.push(richToHtml(scene.content, { names: ms.names, separator: ms.separator }))
      }
      html.push('</section>')
      items.push({ id: `chapter-${chapterIndex}`, href, title: chapter.label, body: html.join('\n') })
      chapterEntries.push(`<li><a href="${href}">${exportEscapeXml(chapter.label)}</a></li>`)
    }
    if (part.heading) toc.push(`<li><a href="${partHref}">${exportEscapeXml(part.heading)}</a>${chapterEntries.length ? `<ol>${chapterEntries.join('')}</ol>` : ''}</li>`)
    else toc.push(...chapterEntries)
  })

  const contents = t('export.out.contents')
  const nav = `<nav epub:type="toc" id="toc"><h1>${exportEscapeXml(contents)}</h1><ol>${toc.join('\n')}</ol></nav>`
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:${exportEscapeXml(id)}</dc:identifier>
<dc:title>${exportEscapeXml(ms.title)}</dc:title>
${ms.author ? `<dc:creator>${exportEscapeXml(ms.author)}</dc:creator>\n` : ''}<dc:language>${lang}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
${cover ? '<meta name="cover" content="cover-image"/>\n' : ''}</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
${cover ? `<item id="cover-image" href="${coverFile}" media-type="image/${cover.type === 'jpg' ? 'jpeg' : 'png'}" properties="cover-image"/>\n` : ''}${items.map(item => `<item id="${item.id}" href="${item.href}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine>
${items.map(item => `<itemref idref="${item.id}"/>`).join('\n')}
</spine>
</package>
`

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`

  const files: Zippable = {
    'mimetype': [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(container),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/nav.xhtml': strToU8(page(lang, contents, nav)),
    'OEBPS/style.css': strToU8(CSS),
  }
  for (const item of items) files[`OEBPS/${item.href}`] = strToU8(page(lang, item.title, item.body))
  if (cover) files[`OEBPS/${coverFile}`] = [cover.data, { level: 0 }]
  return zipSync(files, { level: 6 })
}
