<script setup lang="ts">
import type { ExportCover } from '~/components/export/CoverField.vue'
import type { ExportRecord } from '~/components/export/History.vue'
import { effectiveSeparator, OPTION_ROW, type ManuscriptExportOptions } from '~/components/export/ManuscriptOptions.vue'
import type { VoiceExportOptions } from '~/components/export/VoiceOptions.vue'

/**
 * Export (spec 4.6 and 5.10): get the work out in the shape someone needs. The manuscript (or the script)
 * as DOCX, PDF, EPUB or TXT; the project document; with game modules the team formats (JSON, Twee 3,
 * Ink, the voice-over CSV); the backup, always. One format is chosen at a time: its row opens with its
 * options and the page's one solid button. The last exports are listed below.
 */
type Format = 'docx' | 'pdf' | 'epub' | 'txt' | 'document' | 'documentPdf' | 'json' | 'twee' | 'ink' | 'csv' | 'backup'
type ManuscriptFormat = 'docx' | 'pdf' | 'epub' | 'txt'

interface Saved {
  selected: Format
  manuscript: ManuscriptExportOptions
  includeImages: boolean
  tweeFormat: 'harlowe' | 'sugarcube'
  voice: VoiceExportOptions
}

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { words, scenes, number, time } = useFormat()
const { problems } = useFlow()

const project = computed(() => store.project!)
const base = computed(() => `/api/projects/${store.projectId}/export`)
const guidance = computed(() => project.value.settings.guidance ?? true)

// ---------------------------------------------------------------- choices, remembered on this device

function defaults(): Saved {
  const settings = project.value.settings
  const custom = settings.sceneSeparator?.trim()
  return {
    selected: 'docx',
    manuscript: {
      titlePage: true,
      partTitles: true,
      chapterTitles: true,
      sceneTitles: store.isGame,
      sceneCodes: store.isGame,
      numbering: settings.chapterNumbering ?? 'arabic',
      separator: custom && custom !== '***' && custom !== '#' ? 'custom' : custom === '#' ? 'hash' : 'stars',
      scenes: 'text',
      layout: 'manuscript',
    },
    includeImages: true,
    tweeFormat: 'harlowe',
    voice: { delimiter: 'comma', partId: null, chapterId: null, speaker: null, onlyRevised: false },
  }
}

const storageKey = `dramatis:export:${store.projectId}`
const saved = reactive<Saved>(defaults())
onMounted(() => {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return
    const value = JSON.parse(raw) as Partial<Saved>
    Object.assign(saved, {
      ...value,
      manuscript: { ...saved.manuscript, ...value.manuscript },
      voice: { ...saved.voice, ...value.voice },
    })
  }
  catch {}
})
watch(saved, (value) => {
  try { localStorage.setItem(storageKey, JSON.stringify(value)) }
  catch {}
}, { deep: true })

// ---------------------------------------------------------------- what can be exported

const withText = computed(() => store.orderedScenes.filter(s => s.wordCount > 0))
const hasText = computed(() => withText.value.length > 0)
const teamFormats = computed(() => store.isGame || store.modules.branching || store.modules.script)

interface FormatItem { value: Format, label: string, hint: string, disabled?: boolean }

const groups = computed<{ key: string, title: string, formats: FormatItem[] }[]>(() => {
  const manuscript: FormatItem[] = (['docx', 'pdf', 'epub', 'txt'] as const).map(value => ({
    value,
    label: t(`export.formats.${value}.label`),
    hint: t(`export.formats.${value}.hint`),
    disabled: !hasText.value,
  }))
  const team: FormatItem[] = [
    { value: 'json', label: t('export.formats.json.label'), hint: t('export.formats.json.hint') },
    ...(store.modules.branching
      ? (['twee', 'ink'] as const).map(value => ({ value, label: t(`export.formats.${value}.label`), hint: t(`export.formats.${value}.hint`) }))
      : []),
    ...(store.modules.script ? [{ value: 'csv' as const, label: t('export.formats.csv.label'), hint: t('export.formats.csv.hint') }] : []),
  ]
  return [
    { key: 'manuscript', title: term('manuscript'), formats: manuscript },
    {
      key: 'document',
      title: t('export.groups.document'),
      formats: [
        { value: 'document', label: t('export.formats.document.label', { name: term('projectDocument') }), hint: t(`export.formats.document.hint.${store.kind}`) },
        { value: 'documentPdf', label: t('export.formats.documentPdf.label', { name: term('projectDocument') }), hint: t('export.formats.documentPdf.hint') },
      ],
    },
    ...(teamFormats.value ? [{ key: 'team', title: t('export.groups.team'), formats: team }] : []),
    { key: 'backup', title: t('export.groups.backup'), formats: [{ value: 'backup' as const, label: t('export.formats.backup.label'), hint: t('export.formats.backup.hint') }] },
  ]
})
const available = computed(() => new Set(groups.value.flatMap(g => g.formats.filter(f => !f.disabled).map(f => f.value))))

/** The chosen format, or the first one that can be exported when the remembered one cannot. */
const selected = computed<Format>({
  get: () => (available.value.has(saved.selected) ? saved.selected : hasText.value ? 'docx' : 'document'),
  set: (value) => {
    saved.selected = value
    error.value = null
    done.value = null
  },
})
const isManuscript = computed(() => ['docx', 'pdf', 'epub', 'txt'].includes(selected.value))

/** The manuscript options as sent: the separator the options show for this format, not a stale remembered one. */
const manuscriptRequest = computed<ManuscriptExportOptions>(() => ({
  ...saved.manuscript,
  separator: effectiveSeparator(saved.manuscript.separator, project.value.settings.sceneSeparator, selected.value),
}))

// ---------------------------------------------------------------- what the file will hold

const included = computed(() => {
  const rule = saved.manuscript.scenes
  return withText.value.filter(s => rule === 'final' ? s.status === 'final' : rule === 'revised' ? s.status === 'revised' || s.status === 'final' : true)
})
const includedWords = computed(() => included.value.reduce((n, s) => n + s.wordCount, 0))
const voiceLines = ref<number | null>(null)
/** The EPUB cover, chosen on this device for the next export; not kept. */
const cover = ref<ExportCover | null>(null)

const summary = computed(() => {
  if (isManuscript.value) return `${scenes(included.value.length)} · ${words(includedWords.value)}`
  if (selected.value === 'csv') return voiceLines.value === null ? '' : t('export.summary.lines', { n: number(voiceLines.value) }, voiceLines.value)
  if (selected.value === 'backup') {
    const images = store.rows.images.length
    return [scenes(store.rows.scenes.length), t('export.summary.characters', { n: number(store.rows.characters.length) }, store.rows.characters.length), images ? t('export.summary.images', { n: number(images) }, images) : '', store.trashCount ? t('export.summary.trash', { n: number(store.trashCount) }, store.trashCount) : ''].filter(Boolean).join(' · ')
  }
  if (selected.value === 'document' || selected.value === 'documentPdf') {
    const parts = [
      store.rows.characters.length ? t('export.summary.characters', { n: number(store.rows.characters.length) }, store.rows.characters.length) : '',
      store.rows.locations.length ? t('export.summary.locations', { n: number(store.rows.locations.length) }, store.rows.locations.length) : '',
      store.rows.scenes.length ? scenes(store.rows.scenes.length) : '',
    ].filter(Boolean)
    return parts.join(' · ')
  }
  return store.rows.scenes.length ? `${scenes(store.rows.scenes.length)} · ${words(store.totalWords)}` : ''
})

/** Why the selection holds nothing: shown above the button, which points to it and does nothing when pressed. */
const emptyReason = computed(() => {
  if (isManuscript.value && !included.value.length) return t('export.summary.empty')
  if (selected.value === 'csv' && voiceLines.value === 0) return t('export.summary.emptyLines')
  if ((selected.value === 'twee' || selected.value === 'ink') && !store.rows.scenes.length) return t('export.summary.noScenes')
  return ''
})

const startScene = computed(() => {
  const start = store.get('scenes', project.value.startSceneId)
  return start ?? null
})

// ---------------------------------------------------------------- export

const busy = ref(false)
const progress = ref('')
const error = ref<string | null>(null)
const done = ref<{ name: string, at: string } | null>(null)

const printUrl = computed(() => {
  const o = manuscriptRequest.value
  const query = new URLSearchParams({
    titlePage: String(o.titlePage),
    partTitles: String(o.partTitles),
    chapterTitles: String(o.chapterTitles),
    sceneTitles: String(o.sceneTitles),
    sceneCodes: String(o.sceneCodes),
    numbering: o.numbering,
    separator: o.separator,
    scenes: o.scenes,
    layout: o.layout,
    autoprint: '1',
  })
  return `/print/${store.projectId}?${query}`
})
const documentPrintUrl = computed(() => `/print/${store.projectId}?what=document&images=${saved.includeImages ? '1' : '0'}&autoprint=1`)
const printing = computed(() => selected.value === 'pdf' || selected.value === 'documentPdf')

const actionLabel = computed(() => {
  if (busy.value) return progress.value || t('export.actions.busy')
  if (selected.value === 'document') return t('export.actions.document')
  if (selected.value === 'backup') return t('export.actions.backup')
  return t('export.actions.export', { format: t(`export.formats.${selected.value}.short`) })
})

/** The reason code of a refused export (data.reason), also when the answer came back as a Blob. */
async function failureReason(failure: unknown): Promise<string | null> {
  let data: unknown = (failure as { data?: unknown })?.data
  if (data instanceof Blob) {
    try { data = JSON.parse(await data.text()) }
    catch { data = null }
  }
  const reason = (data as { data?: { reason?: unknown } } | null)?.data?.reason
  return typeof reason === 'string' ? reason : null
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function download(path: string, body?: Record<string, unknown>) {
  const response = await $fetch.raw<Blob>(`${base.value}/${path}`, { method: body ? 'POST' : 'GET', body, responseType: 'blob' })
  const header = response.headers.get('x-dramatis-filename')
  const name = header ? decodeURIComponent(header) : path
  saveBlob(response._data as Blob, name)
  return name
}

const WORD_IMAGES = [[0x89, 0x50, 0x4E, 0x47], [0xFF, 0xD8, 0xFF], [0x47, 0x49, 0x46]]

/** JPEG copies of the primary images Word cannot show (WebP), converted here because the browser can read them. */
async function wordImages() {
  const ids = [...new Set(
    [
      ...store.rows.characters.map(c => store.primaryImage('character', c.id)),
      ...store.rows.groups.map(g => store.primaryImage('group', g.id)),
      ...store.rows.locations.map(l => store.primaryImage('location', l.id)),
      ...store.rows.objects.map(o => store.primaryImage('object', o.id)),
      ...(store.modules.codex ? store.rows.codexEntries.map(e => store.primaryImage('codex', e.id)) : []),
    ].filter((id): id is string => !!id),
  )]
  const result: Record<string, { data: string, width: number, height: number }> = {}
  let count = 0
  const convert = async (id: string) => {
    try {
      const blob = await $fetch<Blob>(`/api/media/${id}`, { responseType: 'blob' })
      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
      if (WORD_IMAGES.some(sig => sig.every((byte, i) => head[i] === byte))) return
      const bitmap = await createImageBitmap(blob)
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')!
      // JPEG has no transparency: the paper goes behind the picture, as on the printed page.
      context.fillStyle = 'white'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86))
      if (!jpeg) return
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(jpeg)
      })
      result[id] = { data, width: canvas.width, height: canvas.height }
    }
    catch {
      // An image that cannot be read stays out of the document; the rest goes on.
    }
    finally {
      count++
      progress.value = t('export.actions.images', { n: number(count), total: number(ids.length) })
    }
  }
  const queue = [...ids]
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) await convert(queue.shift()!)
  }))
  progress.value = ''
  return result
}

async function run() {
  if (busy.value || emptyReason.value) return
  busy.value = true
  error.value = null
  done.value = null
  try {
    await Promise.all([store.flush(), store.flushProject()])
    let name = ''
    const format = selected.value
    if (format === 'docx' || format === 'txt') name = await download('manuscript', { format, ...manuscriptRequest.value })
    else if (format === 'epub') name = await download('manuscript', { format, ...manuscriptRequest.value, cover: cover.value?.data })
    else if (format === 'document') name = await download('document', { includeImages: saved.includeImages, images: saved.includeImages ? await wordImages() : undefined })
    else if (format === 'twee') name = await download('twee', { format: saved.tweeFormat })
    else if (format === 'json' || format === 'ink') name = await download(format, {})
    else if (format === 'csv') name = await download('vo-csv', { ...saved.voice })
    else if (format === 'backup') name = await download('backup')
    done.value = { name, at: new Date().toISOString() }
    await loadHistory()
  }
  catch (failure) {
    const reason = await failureReason(failure)
    error.value = reason === 'empty'
      ? (selected.value === 'csv' ? t('export.summary.emptyLines') : t('export.summary.empty'))
      : errorMessage(failure)
  }
  finally {
    busy.value = false
    progress.value = ''
  }
}

/**
 * The PDF is the print page: it opens in a new tab and records the export itself. The tab opens at once, inside
 * the click (no popup blocker stops it), and is sent to the page once the pending saves have landed, so the
 * PDF holds the last words typed. Blocked all the same, the page opens in this tab.
 */
async function openPrint() {
  if (emptyReason.value) return
  const url = selected.value === 'pdf' ? printUrl.value : documentPrintUrl.value
  const tab = window.open('about:blank', '_blank')
  done.value = null
  error.value = null
  try {
    await Promise.all([store.flush(), store.flushProject()])
  }
  catch {}
  if (tab && !tab.closed) tab.location.href = url
  else await navigateTo(url)
  setTimeout(() => { void loadHistory() }, 4000)
}

/** From a note on page numbers: the DOCX of the same thing has real ones. */
function chooseDocx() {
  selected.value = selected.value === 'documentPdf' ? 'document' : 'docx'
}

// ---------------------------------------------------------------- the last exports

const history = ref<ExportRecord[] | null>(null)
const historyLoading = ref(false)
async function loadHistory() {
  historyLoading.value = true
  try {
    history.value = (await $fetch<{ records: ExportRecord[] }>(base.value)).records
  }
  catch {
    history.value ??= []
  }
  finally {
    historyLoading.value = false
  }
}
onMounted(loadHistory)

const manuscriptOptions = computed({
  get: () => saved.manuscript,
  set: (value: ManuscriptExportOptions) => { saved.manuscript = value },
})
const voiceOptions = computed({
  get: () => saved.voice,
  set: (value: VoiceExportOptions) => { saved.voice = value },
})
const optionRow = `${OPTION_ROW} items-start`
const reasonId = useId()
</script>

<template>
  <DPage :title="term('export')" width="prose">
    <DPageHeader :title="term('export')" :description="guidance ? t(`export.page.intro.${store.kind}`) : undefined" />

    <form class="export-formats space-y-8" @submit.prevent="run">
      <fieldset v-for="group in groups" :key="group.key" class="export-group">
        <legend class="mb-1 px-2 text-sm font-medium text-muted">{{ group.title }}</legend>

        <div v-if="group.key === 'manuscript' && !hasText" class="mb-2 flex flex-col gap-2 px-2 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm text-pretty text-toned">{{ t('export.page.empty') }}</p>
          <UButton
            :to="`/p/${store.projectId}/manuscript`"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-pencil-line"
            :label="t('export.page.write', { manuscript: term('manuscript').toLocaleLowerCase() })"
            class="min-h-11 self-start sm:min-h-0 sm:self-auto"
          />
        </div>

        <ExportFormatRow
          v-for="format in group.formats"
          :key="format.value"
          v-model="selected"
          name="export-format"
          :value="format.value"
          :label="format.label"
          :hint="format.hint"
          :disabled="format.disabled"
        >
          <div class="space-y-5">
            <ExportManuscriptOptions v-if="isManuscript" v-model="manuscriptOptions" :format="selected as ManuscriptFormat" />
            <ExportCoverField v-if="selected === 'epub'" v-model="cover" />

            <UCheckbox
              v-else-if="selected === 'document' || selected === 'documentPdf'"
              v-model="saved.includeImages"
              variant="card"
              :label="t('export.options.images')"
              :aria-describedby="`${reasonId}-images`"
              :ui="{ root: optionRow }"
            >
              <template #description><span :id="`${reasonId}-images`">{{ t('export.options.imagesHint') }}</span></template>
            </UCheckbox>

            <ExportVoiceOptions v-else-if="selected === 'csv'" v-model="voiceOptions" v-model:lines="voiceLines" />

            <URadioGroup
              v-else-if="selected === 'twee'"
              v-model="saved.tweeFormat"
              variant="card"
              :legend="t('export.options.storyFormat')"
              :items="[{ value: 'harlowe', label: t('export.options.storyFormats.harlowe') }, { value: 'sugarcube', label: t('export.options.storyFormats.sugarcube') }]"
              :ui="{ fieldset: 'gap-y-0', legend: 'text-sm', item: optionRow }"
            />

            <ExportPageNumbers
              v-if="printing"
              :layout="selected === 'pdf' ? saved.manuscript.layout : 'manuscript'"
              action
              @docx="chooseDocx"
            />

            <template v-if="selected === 'json' || selected === 'twee' || selected === 'ink'">
              <p v-if="selected !== 'json'" class="text-sm text-toned">
                <template v-if="store.modules.branching && startScene">
                  {{ t('export.flow.start') }}
                  <span class="font-mono text-xs text-muted">{{ startScene.code }}</span> <span class="voice-author font-semibold text-highlighted">{{ startScene.title }}</span>
                </template>
                <template v-else>{{ t('export.flow.noStart', { manuscript: term('manuscript').toLocaleLowerCase() }) }}</template>
              </p>
              <p v-if="problems" class="flex flex-wrap items-center gap-x-1.5 text-sm text-toned">
                <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 text-warning" />
                <span>{{ t('export.flow.problems', { n: number(problems) }, problems) }}</span>
                <ULink :to="`/p/${store.projectId}/flow?view=checks`" class="inline-flex min-h-11 items-center text-primary underline sm:min-h-0">{{ t('export.flow.checks') }}</ULink>
              </p>
              <p v-if="selected === 'json'" class="text-sm">
                <ULink :href="`${base}/schema`" external class="inline-flex min-h-11 items-center text-primary underline sm:min-h-0">{{ t('export.actions.schema') }}</ULink>
              </p>
            </template>

            <div v-if="selected === 'backup'" class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-sm text-pretty text-toned">{{ t('export.page.backupNote') }}</p>
              <ExportImportButton size="sm" :label="t('export.import.labelBackup')" class="min-h-11 shrink-0 self-start sm:min-h-0 sm:self-auto" />
            </div>

            <div class="space-y-3 border-t border-default pt-4">
              <p v-if="summary" class="flex items-baseline gap-3 text-sm">
                <span class="shrink-0 text-muted">{{ t('export.summary.label') }}</span>
                <DLeader />
                <span class="shrink-0 text-right text-toned">{{ summary }}</span>
              </p>
              <p v-if="emptyReason" :id="reasonId" class="flex items-center gap-1.5 text-sm text-toned" role="status">
                <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0 text-muted" />{{ emptyReason }}
              </p>

              <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
                <!--
                  An empty selection does not disable the button: it stays in the tab order, says it is not
                  available (aria-disabled) and points to the reason, and a press does nothing.
                -->
                <UButton
                  :type="printing ? 'button' : 'submit'"
                  color="primary"
                  variant="solid"
                  size="lg"
                  :icon="printing ? 'i-lucide-printer' : selected === 'backup' ? 'i-lucide-archive' : 'i-lucide-file-down'"
                  :label="actionLabel"
                  :loading="busy"
                  :aria-disabled="emptyReason ? 'true' : undefined"
                  :aria-describedby="emptyReason ? reasonId : undefined"
                  class="min-h-11 w-full justify-center sm:min-h-10 sm:w-auto"
                  :class="emptyReason ? 'cursor-not-allowed opacity-75' : ''"
                  @click="printing ? openPrint() : undefined"
                />
                <p v-if="printing" class="text-sm text-pretty text-muted">{{ t('export.page.pdfHint') }}</p>
              </div>

              <p v-if="done" class="flex items-center gap-1.5 text-sm text-toned" role="status">
                <UIcon name="i-lucide-check" class="size-4 shrink-0 text-success" />
                <span>{{ t('export.page.done', { time: time(done.at) }) }} <span class="break-all text-muted">{{ done.name }}</span></span>
              </p>

              <UAlert
                v-if="error"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                :title="t('export.errors.title')"
                :description="error"
                :actions="[
                  { label: t('common.actions.retry'), color: 'error', variant: 'outline', class: 'min-h-11 sm:min-h-0', onClick: run },
                  ...(selected !== 'backup' ? [{ label: t('export.errors.backup'), color: 'neutral' as const, variant: 'ghost' as const, class: 'min-h-11 sm:min-h-0', href: `${base}/backup`, external: true }] : []),
                ]"
                role="alert"
              />
            </div>
          </div>
        </ExportFormatRow>
      </fieldset>
    </form>

    <ExportHistory class="mt-12" :records="history" :loading="historyLoading" />
  </DPage>
</template>
