<script setup lang="ts">
import type { PrintDocumentData } from '~/components/export/PrintDocument.vue'
import type { PrintManuscriptData } from '~/components/export/PrintManuscript.vue'

/**
 * The print page: the browser turns it into the PDF. With what=manuscript (the default) the manuscript
 * (appendix D.1) in one of its two layouts, "Cartella editoriale" (A4, Courier New 12 pt, 60 characters by
 * 30 lines, page numbers) or "Libro" (A5, the manuscript serif at 11 pt, justified); with what=document the
 * project document (P1). The options come in the query string from the export page; with autoprint=1 the
 * print dialog opens as soon as the pages and their fonts are ready. Opening the dialog records the export.
 * Page numbers come from @page margin boxes, which only Chromium lays out: elsewhere a note says so and
 * points to Chrome, Edge or the DOCX (ExportPageNumbers).
 */
definePageMeta({ layout: false })

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { scenes: scenesLabel, words: wordsLabel } = useFormat()
const projectId = computed(() => String(route.params.projectId))
const what = computed<'manuscript' | 'document'>(() => (route.query.what === 'document' ? 'document' : 'manuscript'))

const OPTION_KEYS = ['titlePage', 'partTitles', 'chapterTitles', 'sceneTitles', 'sceneCodes', 'numbering', 'separator', 'scenes', 'layout']
const query = computed(() => {
  const params = new URLSearchParams()
  for (const key of OPTION_KEYS) {
    const value = route.query[key]
    if (typeof value === 'string') params.set(key, value)
  }
  return params.toString()
})

const manuscript = ref<PrintManuscriptData | null>(null)
const projectDocument = ref<PrintDocumentData | null>(null)
const failed = ref(false)
const loading = ref(true)

async function load() {
  loading.value = true
  failed.value = false
  try {
    if (what.value === 'document') projectDocument.value = await $fetch<PrintDocumentData>(`/api/projects/${projectId.value}/export/document-print`)
    else manuscript.value = await $fetch<PrintManuscriptData>(`/api/projects/${projectId.value}/export/print?${query.value}`)
  }
  catch (error) {
    failed.value = true
    if (errorStatus(error) === 401) await navigateTo({ path: '/login', query: { redirect: route.fullPath } })
  }
  finally {
    loading.value = false
  }
}

const layout = computed(() => manuscript.value?.options.layout ?? (route.query.layout === 'book' ? 'book' : 'manuscript'))
const ready = computed(() => (what.value === 'document' ? !!projectDocument.value : !!manuscript.value?.sceneCount))
const title = computed(() => projectDocument.value?.title ?? manuscript.value?.title ?? '')
const language = computed(() => projectDocument.value?.language ?? manuscript.value?.language)
const exportPath = computed(() => `/p/${projectId.value}/export`)
const subtitle = computed(() => {
  if (what.value === 'document') return projectDocument.value?.name ?? ''
  const parts = [t(`export.print.layout.${layout.value}`)]
  if (manuscript.value?.sceneCount) parts.push(scenesLabel(manuscript.value.sceneCount), wordsLabel(manuscript.value.words))
  return parts.join(' · ')
})

let recorded = false
async function print() {
  if (!ready.value) return
  // The export is recorded when the dialog opens: the browser does not say whether a PDF was saved or
  // the dialog was cancelled (afterprint fires either way), and an author who opened it meant to export.
  if (!recorded) {
    recorded = true
    void $fetch(`/api/projects/${projectId.value}/export/log`, { method: 'POST', body: { what: what.value, format: 'pdf' } }).catch(() => { recorded = false })
  }
  await document.fonts?.ready
  window.print()
}

onMounted(async () => {
  await load()
  if (route.query.autoprint === '1' && ready.value) {
    await nextTick()
    // The fonts and the images of the page must be there before the pages are laid out for print.
    setTimeout(async () => {
      const loaded = (image: HTMLImageElement) => new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      })
      await Promise.race([
        Promise.all([...document.images].filter(image => !image.complete).map(loaded)),
        new Promise(resolve => setTimeout(resolve, 5000)),
      ])
      await print()
      // Reloading the page later shows the preview, without opening the dialog again.
      const { autoprint: _autoprint, ...rest } = route.query
      void router.replace({ query: rest })
    }, 300)
  }
})

// The page rules follow what is printed; they leave with the page. The title page is not numbered and does
// not count (counter-increment: page 0), so the text starts on page 1, as in the DOCX.
const pageRules = computed(() => {
  if (what.value === 'document') return `@page { size: A4; margin: 2cm 2.2cm 2.2cm 2.2cm; @bottom-center { content: counter(page); font-family: 'Schibsted Grotesk', Arial, sans-serif; font-size: 8.5pt; } } @page :first { counter-increment: page 0; @bottom-center { content: none; } }`
  const first = manuscript.value?.options.titlePage ? '@page :first { counter-increment: page 0; @bottom-center { content: none; } @bottom-right { content: none; } }' : ''
  return layout.value === 'book'
    ? `@page { size: A5; margin: 18mm 16mm 21mm 16mm; @bottom-center { content: counter(page); font-family: Literata, Georgia, serif; font-size: 9pt; } } ${first}`
    : `@page { size: A4; margin: 2.15cm 2.88cm 2.15cm 2.88cm; @bottom-right { content: counter(page); font-family: 'Courier New', Courier, monospace; font-size: 12pt; } } ${first}`
})

/**
 * Back to the export page. The preview opened from it is a tab of its own: closing it shows the export page
 * again, as it was, instead of loading a second workspace here.
 */
function back() {
  try {
    const opener = window.opener as Window | null
    if (opener && !opener.closed && opener.location.origin === window.location.origin && opener.location.pathname === exportPath.value) {
      opener.focus()
      window.close()
      // A tab the browser will not let a script close goes back to the export page instead.
      setTimeout(() => { if (!window.closed) void navigateTo(exportPath.value) }, 150)
      return
    }
  }
  catch {}
  void navigateTo(exportPath.value)
}

useHead(() => ({
  title: title.value ? `${title.value} · ${t('export.print.title')}` : t('export.print.title'),
  htmlAttrs: { lang: language.value || undefined },
  style: [{ key: 'dramatis-print-page', textContent: pageRules.value }],
}))
</script>

<template>
  <div class="print-view min-h-dvh bg-muted">
    <header class="print-toolbar sticky top-0 z-10 border-b border-default bg-default">
      <div class="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2 sm:px-4">
        <UTooltip :text="t('export.print.back')">
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('export.print.back')"
            class="min-h-11 min-w-11 justify-center sm:min-h-8 sm:min-w-8"
            @click="back"
          />
        </UTooltip>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">{{ t('export.print.title') }}</p>
          <p class="truncate text-xs text-muted">{{ subtitle }}</p>
        </div>
        <UButton
          color="primary"
          variant="solid"
          icon="i-lucide-printer"
          :label="t('export.print.print')"
          :disabled="!ready"
          class="min-h-11 min-w-11 justify-center sm:min-h-8 sm:min-w-0"
          :ui="{ label: 'hidden sm:inline' }"
          :aria-label="t('export.print.print')"
          @click="print"
        />
      </div>
    </header>

    <main id="main" class="px-4 py-6 sm:px-6 sm:py-10">
      <div v-if="ready" class="print-hint mx-auto mb-6 max-w-prose space-y-2 text-center">
        <p class="text-sm text-pretty text-muted">{{ t('export.print.hint') }}</p>
        <ExportPageNumbers :layout="what === 'manuscript' ? layout : 'manuscript'" class="justify-center text-start" />
      </div>

      <div v-if="loading" class="mx-auto max-w-[15.24cm] space-y-3" aria-busy="true">
        <USkeleton class="mx-auto h-6 w-1/2" />
        <USkeleton v-for="i in 8" :key="i" class="h-4 w-full" />
        <span class="sr-only">{{ t('export.print.loading') }}</span>
      </div>

      <DEmptyState
        v-else-if="failed"
        icon="i-lucide-file-x"
        :title="t('export.print.failed')"
        :actions="[{ label: t('common.actions.retry'), color: 'neutral', variant: 'outline', icon: 'i-lucide-rotate-cw', class: 'min-h-11 sm:min-h-0', onClick: load }, { label: t('export.print.back'), color: 'neutral', variant: 'ghost', class: 'min-h-11 sm:min-h-0', onClick: back }]"
      />

      <ExportPrintDocument v-else-if="projectDocument" :data="projectDocument" :images="route.query.images !== '0'" />

      <DEmptyState
        v-else-if="manuscript && !manuscript.sceneCount"
        icon="i-lucide-file-text"
        :title="t('export.summary.empty')"
        :actions="[{ label: t('export.print.back'), color: 'neutral', variant: 'outline', class: 'min-h-11 sm:min-h-0', onClick: back }]"
      />

      <ExportPrintManuscript v-else-if="manuscript" :data="manuscript" />
    </main>
  </div>
</template>

<style>
/* The sheet of the preview, on screen; on paper only the text is left. */
.print-doc { color: var(--ui-text-highlighted); }
@media screen {
  .print-doc { background: var(--ui-bg); padding: 1.5rem 1.25rem; border-radius: calc(var(--ui-radius) * 2); box-shadow: var(--shadow-floating); }
  .print-doc .print-title-page { border-bottom: 1px dashed var(--ui-border); margin-bottom: 1.5rem; }
}
@media screen and (min-width: 40rem) {
  .print-doc { padding: 2.5rem 2.75rem; }
}
@media print {
  html, body, .print-view { background: white !important; }
  .print-toolbar, .print-hint { display: none !important; }
  .print-view main { padding: 0 !important; }
  .print-doc { max-width: none; color: black; }
  .print-doc .print-title-page { break-after: page; padding-top: 30%; }
}
</style>
