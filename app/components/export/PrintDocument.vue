<script setup lang="ts">
/**
 * The project document set for paper (spec section 6, P1: the story bible or the narrative design
 * document as PDF), for the print page. The same blocks as the DOCX; the two voices of the app: the
 * author's words in the manuscript face, the document's own labels in the interface face.
 */
export type PrintDocumentBlock =
  /** `author`: the author's own words (a name, a title), in the manuscript face. */
  | { kind: 'heading', level: 1 | 2 | 3, text: string, author: boolean }
  | { kind: 'meta', text: string, italic?: boolean }
  | { kind: 'field', label: string, value: string }
  | { kind: 'html', html: string }
  | { kind: 'label', text: string }
  | { kind: 'list', items: string[] }
  | { kind: 'question', text: string }
  | { kind: 'text', paragraphs: string[], italic?: boolean }
  | { kind: 'image', mediaId: string, caption: string, alt: string, portrait: boolean }
  | { kind: 'table', headers: string[], rows: string[][], widths: number[] }
  | { kind: 'entry', lead: string, title: string, keepNext: boolean }

export interface PrintDocumentData {
  projectId: string
  title: string
  name: string
  subtitle: string
  author: string
  stats: string
  language: string
  blocks: PrintDocumentBlock[]
}

withDefaults(defineProps<{ data: PrintDocumentData, images?: boolean }>(), { images: true })
</script>

<template>
  <article class="print-doc print-pd mx-auto" :lang="data.language">
    <section class="print-title-page">
      <h1 class="pd-title voice-author">{{ data.title }}</h1>
      <p class="pd-name">{{ data.name }}</p>
      <p v-if="data.subtitle" class="pd-subtitle voice-author">{{ data.subtitle }}</p>
      <p v-if="data.author" class="pd-author voice-author">{{ data.author }}</p>
      <p class="pd-stats">{{ data.stats }}</p>
    </section>
    <template v-for="(block, i) in data.blocks" :key="i">
      <h2 v-if="block.kind === 'heading' && block.level === 1" class="pd-h1">{{ block.text }}</h2>
      <h3 v-else-if="block.kind === 'heading' && block.level === 2" class="pd-h2" :class="{ 'voice-author': block.author }">{{ block.text }}</h3>
      <h4 v-else-if="block.kind === 'heading'" class="pd-h3" :class="{ 'voice-author': block.author }">{{ block.text }}</h4>
      <p v-else-if="block.kind === 'meta'" class="pd-meta" :class="{ italic: block.italic }">{{ block.text }}</p>
      <p v-else-if="block.kind === 'field'" class="pd-field"><span class="pd-field-label">{{ block.label }}:</span> <span class="voice-author">{{ block.value }}</span></p>
      <!-- Rich text as XHTML made and escaped by the server (server/utils/export/html.ts). -->
      <div v-else-if="block.kind === 'html'" class="pd-rich voice-author" v-html="block.html" />
      <p v-else-if="block.kind === 'label'" class="pd-label">{{ block.text }}</p>
      <ul v-else-if="block.kind === 'list'" class="pd-list voice-author">
        <li v-for="(item, j) in block.items" :key="j">{{ item }}</li>
      </ul>
      <p v-else-if="block.kind === 'question'" class="pd-question">{{ block.text }}</p>
      <template v-else-if="block.kind === 'text'">
        <p v-for="(paragraph, j) in block.paragraphs" :key="j" class="pd-text voice-author" :class="{ italic: block.italic }">{{ paragraph }}</p>
      </template>
      <figure v-else-if="block.kind === 'image' && images" class="pd-image" :class="{ 'pd-image--portrait': block.portrait }">
        <img :src="`/api/media/${block.mediaId}`" :alt="block.alt">
        <figcaption v-if="block.caption" class="pd-meta italic">{{ block.caption }}</figcaption>
      </figure>
      <table v-else-if="block.kind === 'table'" class="pd-table">
        <colgroup>
          <col v-for="(width, j) in block.widths" :key="j" :style="{ width: `${(width / block.widths.reduce((a, b) => a + b, 0)) * 100}%` }">
        </colgroup>
        <thead>
          <tr><th v-for="(head, j) in block.headers" :key="j" scope="col">{{ head }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, j) in block.rows" :key="j">
            <td v-for="(cell, k) in row" :key="k">{{ cell }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="block.kind === 'entry'" class="pd-entry" :class="{ 'pd-entry--keep': block.keepNext }">
        <span v-if="block.lead" class="pd-entry-lead">{{ block.lead }}</span>
        <span class="voice-author font-semibold">{{ block.title }}</span>
      </p>
    </template>
  </article>
</template>

<style>
.print-pd {
  max-width: 16.6cm;
  font-family: var(--font-sans);
  font-size: 10pt;
  line-height: 1.5;
  overflow-wrap: break-word;
}
.print-pd .voice-author { font-family: Literata, Georgia, serif; }
.print-pd .print-title-page { text-align: center; padding: 4cm 0 3cm; }
.print-pd .pd-title { font-size: 26pt; font-weight: 600; line-height: 1.15; }
.print-pd .pd-name { font-size: 13pt; color: var(--ui-text-muted); margin-top: 10pt; }
.print-pd .pd-subtitle { font-style: italic; margin-top: 8pt; }
.print-pd .pd-author { font-size: 12pt; margin-top: 36pt; }
.print-pd .pd-stats { font-size: 9pt; color: var(--ui-text-muted); margin-top: 36pt; }
.print-pd .pd-h1 { font-size: 16pt; font-weight: 600; margin: 28pt 0 10pt; break-after: avoid; }
.print-pd .pd-h2 { font-size: 13.5pt; font-weight: 600; margin: 20pt 0 6pt; break-after: avoid; }
.print-pd .pd-h3 { font-size: 10.5pt; font-weight: 600; margin: 14pt 0 4pt; break-after: avoid; }
.print-pd .pd-meta { font-size: 8.5pt; color: var(--ui-text-muted); margin: 2pt 0 6pt; }
.print-pd .pd-field { margin: 4pt 0; }
.print-pd .pd-field-label { font-weight: 600; font-size: 9pt; }
.print-pd .pd-rich,
.print-pd .pd-text,
.print-pd .pd-list { font-size: 10.5pt; }
.print-pd .pd-rich p,
.print-pd .pd-text { margin: 0 0 6pt; white-space: pre-line; }
.print-pd .pd-rich p.blank { display: none; }
.print-pd .pd-rich p.sep { text-align: center; }
.print-pd .pd-rich p.line { padding-inline-start: 2em; text-indent: -2em; }
.print-pd .pd-rich .speaker { font-variant: small-caps; font-weight: 600; }
.print-pd .pd-rich .direction { font-style: italic; }
.print-pd .pd-rich blockquote { margin: 0 1.5em 6pt; }
.print-pd .pd-rich ul,
.print-pd .pd-list { list-style: disc; padding-inline-start: 1.4em; margin: 0 0 6pt; }
.print-pd .pd-rich ol { list-style: decimal; padding-inline-start: 1.4em; margin: 0 0 6pt; }
.print-pd .pd-label { font-weight: 600; font-size: 9.5pt; margin: 10pt 0 3pt; break-after: avoid; }
.print-pd .pd-question { font-weight: 600; font-size: 9.5pt; color: var(--ui-text-toned); margin: 8pt 0 2pt; break-after: avoid; }
.print-pd .pd-image { margin: 6pt 0 8pt; break-inside: avoid; }
.print-pd .pd-image img { max-width: 7cm; max-height: 6cm; border-radius: 2px; }
.print-pd .pd-image--portrait img { max-width: 4cm; max-height: 5.4cm; }
.print-pd .pd-table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 8.5pt; }
.print-pd .pd-table th,
.print-pd .pd-table td { border: 1px solid var(--ui-border); padding: 3pt 5pt; text-align: start; vertical-align: top; white-space: pre-line; }
.print-pd .pd-table th { font-weight: 600; }
.print-pd .pd-table tr { break-inside: avoid; }
.print-pd .pd-entry { margin: 10pt 0 1pt; }
.print-pd .pd-entry--keep { break-after: avoid; }
/* A heading keeps its first lines: the line under it does not end a page. */
.print-pd .pd-h1 + .pd-meta,
.print-pd .pd-h2 + .pd-meta,
.print-pd .pd-h3 + .pd-meta,
.print-pd .pd-entry--keep + .pd-meta { break-after: avoid; }
.print-pd li { break-inside: avoid; }
.print-pd .pd-entry-lead { font-weight: 600; font-size: 9pt; margin-inline-end: 0.6em; }

@media print {
  .print-pd { max-width: none; }
  .print-pd .print-title-page { break-after: page; }
  /* Paper is light whatever the theme of the screen: the greys of the light theme. */
  .print-pd .pd-name,
  .print-pd .pd-stats,
  .print-pd .pd-meta { color: #4d5456; }
  .print-pd .pd-question { color: #3e4547; }
  .print-pd .pd-table th,
  .print-pd .pd-table td { border-color: #b4bcbe; }
}
</style>
