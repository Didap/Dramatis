<script setup lang="ts">
/**
 * The manuscript set for paper (appendix D.1), for the print page: title page, parts and chapters each on
 * a new page, scenes with their separators. Layout "manuscript" is the cartella editoriale (Courier New
 * 12 pt on a 24 pt line, 60 characters to the line), "book" the manuscript serif at 11 pt, justified.
 */
export interface PrintScene { id: string, heading: string | null, separatorBefore: boolean, html: string }
export interface PrintChapter { id: string, heading: string | null, scenes: PrintScene[] }
export interface PrintPart { id: string | null, heading: string | null, chapters: PrintChapter[] }
export interface PrintManuscriptData {
  projectId: string
  title: string
  subtitle: string
  author: string
  wordsLabel: string
  words: number
  sceneCount: number
  language: string
  kind: 'novel' | 'game'
  options: { titlePage: boolean, layout: 'manuscript' | 'book' }
  separator: string
  parts: PrintPart[]
}

defineProps<{ data: PrintManuscriptData }>()
</script>

<template>
  <article class="print-doc print-ms mx-auto" :class="`print-ms--${data.options.layout}`" :lang="data.language">
    <section v-if="data.options.titlePage" class="print-title-page">
      <h1 class="ms-title">{{ data.title }}</h1>
      <p v-if="data.subtitle" class="ms-subtitle">{{ data.subtitle }}</p>
      <p v-if="data.author" class="ms-author">{{ data.author }}</p>
      <p class="ms-words">{{ data.wordsLabel }}</p>
    </section>
    <section v-for="(part, p) in data.parts" :key="part.id ?? `loose-${p}`" class="ms-part">
      <h2 v-if="part.heading" class="ms-part-title">{{ part.heading }}</h2>
      <section
        v-for="(chapter, c) in part.chapters"
        :key="chapter.id"
        class="ms-chapter"
        :class="{ 'ms-chapter--after-part': c === 0 && !!part.heading }"
      >
        <h3 v-if="chapter.heading" class="ms-chapter-title">{{ chapter.heading }}</h3>
        <template v-for="scene in chapter.scenes" :key="scene.id">
          <p v-if="scene.separatorBefore" class="sep" :class="{ 'sep-blank': !data.separator }">{{ data.separator || ' ' }}</p>
          <h4 v-if="scene.heading" class="ms-scene-title">{{ scene.heading }}</h4>
          <!-- Scene text as XHTML made and escaped by the server (server/utils/export/html.ts). -->
          <div class="ms-scene" v-html="scene.html" />
        </template>
      </section>
    </section>
  </article>
</template>

<style>
.print-ms--manuscript {
  max-width: 15.24cm;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12pt;
  line-height: 24pt;
}
.print-ms--book {
  max-width: 11.6cm;
  font-family: Literata, Georgia, serif;
  font-size: 11pt;
  line-height: 1.42;
  text-align: justify;
  hyphens: auto;
}
.print-ms p { margin: 0; text-indent: 3em; }
.print-ms--book p { text-indent: 1.2em; }
.print-ms p.first,
.print-ms p.blank,
.print-ms p.sep,
.print-ms p.line,
.print-ms p.subhead,
.print-ms p.align-center,
.print-ms p.align-right { text-indent: 0; }
.print-ms p.align-center { text-align: center; }
.print-ms p.align-right { text-align: right; }
.print-ms p.align-justify { text-align: justify; }
.print-ms p.subhead { font-weight: 700; }
.print-ms p.sep { text-align: center; }
.print-ms--book p.sep { margin: 0.7em 0; }
.print-ms p.line { padding-inline-start: 2em; text-indent: -2em; text-align: start; }
.print-ms--book p.line { margin: 0.2em 0; }
.print-ms .speaker { font-variant: small-caps; font-weight: 600; letter-spacing: 0.02em; }
.print-ms .direction { font-style: italic; }
.print-ms blockquote { margin: 0 2em; }
.print-ms ul,
.print-ms ol { margin: 0; padding-inline-start: 2em; }
.print-ms ul { list-style: disc; }
.print-ms ol { list-style: decimal; }
.print-ms pre { font-family: 'Courier New', Courier, monospace; white-space: pre-wrap; }

.print-ms h1,
.print-ms h2,
.print-ms h3,
.print-ms h4 { font-family: inherit; font-size: inherit; line-height: inherit; text-align: center; break-after: avoid; }
.print-ms--manuscript .ms-title,
.print-ms--manuscript .ms-part-title,
.print-ms--manuscript .ms-chapter-title,
.print-ms--manuscript .ms-scene-title { font-weight: 700; }
.print-ms--manuscript .ms-chapter-title,
.print-ms--manuscript .ms-part-title { margin-bottom: 24pt; }
.print-ms--manuscript .ms-scene-title { margin-top: 24pt; }
.print-ms--book .ms-title { font-size: 22pt; font-weight: 600; line-height: 1.2; }
.print-ms--book .ms-part-title { font-size: 17pt; font-weight: 600; padding-top: 4cm; }
.print-ms--book .ms-chapter-title { font-size: 14pt; font-weight: 600; padding-top: 2.5cm; margin-bottom: 1.2cm; }
.print-ms--book .ms-scene-title { font-style: italic; font-weight: 400; margin: 1.2em 0 0.6em; }

.print-ms .print-title-page { text-align: center; padding: 3cm 0 2cm; }
.print-ms .ms-subtitle { font-style: italic; text-indent: 0; margin-top: 12pt; }
.print-ms .ms-author { text-indent: 0; margin-top: 48pt; }
.print-ms .ms-words { text-indent: 0; margin-top: 48pt; }

@media screen {
  /* In the dark the text loses a little weight, as the manuscript does in the editor. */
  .print-ms--book { font-weight: var(--manuscript-weight); }
  .print-ms .ms-part-title,
  .print-ms .ms-chapter { margin-top: 3rem; }
  .print-ms .ms-chapter--after-part { margin-top: 1.5rem; }
  .print-ms .print-title-page + .ms-part > .ms-chapter:first-child,
  .print-ms > .ms-part:first-child > .ms-chapter:first-child { margin-top: 0; }
}

@media print {
  .print-ms .ms-part-title { break-before: page; break-after: page; }
  .print-ms--manuscript .ms-part-title { padding-top: 192pt; }
  .print-ms .ms-chapter { break-before: page; }
  .print-ms .ms-chapter--after-part { break-before: auto; }
  .print-ms p { orphans: 2; widows: 2; }
  .print-ms p.line { break-inside: avoid; }
}
</style>
