<script setup lang="ts">
import type { Project, ProjectSummary } from '#shared/types/entities'

/**
 * The projects (spec 4.1): a list, not a grid, most recent first, with words, the last edit and
 * the current stage of the path; deleted projects behind "Eliminati" with restore and delete
 * forever. New project (also from ?new=1), an example, a file to import.
 */
const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useProjectStore()
const confirm = useConfirm()
const toast = useToast()
const nuxtApp = useNuxtApp()
const { number, words } = useFormat()
const desktop = useIsDesktop()

useHead({ title: () => t('projects.metaTitle') })

const projects = ref<ProjectSummary[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const loadError = ref<unknown>(null)
const renaming = ref<string | null>(null)
/** Projects something is being made from: a copy, or the backup being downloaded. */
const busy = reactive<Record<string, 'duplicating' | 'downloading'>>({})

const showDeleted = computed(() => route.query.deleted === '1')
const active = computed(() => projects.value.filter(p => !p.deletedAt))
const deleted = computed(() => projects.value.filter(p => p.deletedAt).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!)))
const list = computed(() => (showDeleted.value ? deleted.value : active.value))
const totalWords = computed(() => active.value.reduce((sum, p) => sum + p.words, 0))
const summary = computed(() => t('projects.summary', {
  projects: t('projects.count', { n: number(active.value.length) }, active.value.length),
  words: words(totalWords.value),
}))

let loadedAt = 0

/** The list; quietly (no skeleton, the list stays on failure) when it only refreshes. */
async function load(options: { quiet?: boolean } = {}) {
  if (!options.quiet) status.value = 'loading'
  try {
    projects.value = await $fetch<ProjectSummary[]>('/api/projects')
    status.value = 'ready'
    loadedAt = Date.now()
    void loadPaths()
  }
  catch (error) {
    if (options.quiet && status.value === 'ready') return
    loadError.value = error
    status.value = 'error'
    if (errorStatus(error) === 401) notifyError(error, { toast, nuxtApp })
  }
}
onMounted(() => load())

// Back on the tab after a while, the list comes again: another device may have changed it (spec 6).
useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState !== 'visible' || status.value !== 'ready' || renaming.value) return
  if (Date.now() - loadedAt > 30_000) void load({ quiet: true })
})

// ---------------------------------------------------------------- the path stage of each project

/** The path endpoint's answer, as much of it as the list needs. */
interface PathInfo {
  stages: { key: string, done: boolean }[]
  current: string | null
}
/**
 * The path of each project, kept for the session: the endpoint computes every stage, so a project
 * is asked again only once it has changed, or after a while (exports move the last stage).
 */
const paths = useState<Record<string, { stamp: string, at: number, path: PathInfo }>>('projects:paths', () => ({}))
const PATH_TTL = 10 * 60_000
const asking = new Set<string>()

async function loadPaths() {
  const stale = (project: ProjectSummary) => {
    const known = paths.value[project.id]
    return !known || known.stamp !== project.updatedAt || Date.now() - known.at > PATH_TTL
  }
  const queue = active.value.filter(p => p.settings?.guidance !== false && !asking.has(p.id) && stale(p))
  queue.forEach(p => asking.add(p.id))
  // A few at a time.
  const next = async () => {
    for (let project = queue.shift(); project; project = queue.shift()) {
      const path = await $fetch<PathInfo>(`/api/projects/${project.id}/path`).catch(() => null)
      if (path) paths.value[project.id] = { stamp: project.updatedAt, at: Date.now(), path }
      asking.delete(project.id)
    }
  }
  await Promise.all([next(), next(), next()])
}

/** "Prima stesura, passo 6 di 8", "Percorso completato" or "Percorso nascosto". */
function stage(project: ProjectSummary): string | undefined {
  if (project.settings?.guidance === false) return t('projects.row.pathHidden')
  const path = paths.value[project.id]?.path
  if (!path?.stages?.length) return undefined
  if (!path.current) return t('projects.row.pathDone')
  const index = path.stages.findIndex(s => s.key === path.current)
  const key = `overview.path.stages.${project.kind}.${path.current}.label`
  if (index < 0 || !te(key)) return undefined
  return t('projects.row.pathStage', { stage: t(key), n: index + 1, total: path.stages.length })
}

// ---------------------------------------------------------------- new project (?new=1)

// The dialog lives in the query, so Back and the phone's back gesture close it. Opened from here,
// closing it steps back in the history rather than leaving a second /projects behind.
const createOpen = computed({
  get: () => route.query.new === '1',
  set: (value: boolean) => {
    if (value === (route.query.new === '1')) return
    const { new: _new, ...rest } = route.query
    if (value) void router.push({ query: { ...rest, new: '1' } })
    else if (router.options.history.state.back === router.resolve({ query: rest }).fullPath) router.back()
    else void router.replace({ query: rest })
  },
})

// ---------------------------------------------------------------- changes

const listEl = useTemplateRef<HTMLElement>('listEl')
const heading = useTemplateRef<HTMLElement>('heading')

/** When a row leaves the list, the focus moves to the row that takes its place, or to the title. */
async function focusAfter(index: number) {
  await nextTick()
  const rows = listEl.value?.querySelectorAll<HTMLElement>(':scope > li')
  const row = rows?.length ? rows[Math.min(index, rows.length - 1)] : undefined
  ;(row?.querySelector<HTMLElement>('a, button') ?? heading.value)?.focus()
}

/** A project gone from here may still be open in the workspace's store: it loads again next time. */
function forgetOpen(project: ProjectSummary) {
  if (store.project?.id === project.id) store.reset()
}

/** The "spostato tra gli eliminati" toast of each project: its "Annulla" stops making sense once the project is back or gone. */
const undoToasts = new Map<string, string | number>()
function dropUndo(project: ProjectSummary) {
  const id = undoToasts.get(project.id)
  if (id === undefined) return
  toast.remove(id)
  undoToasts.delete(project.id)
}

async function rename(project: ProjectSummary, title: string) {
  renaming.value = null
  const before = project.title
  // The project still open in the workspace is renamed through the store, so both agree.
  const open = store.project?.id === project.id
  project.title = title
  try {
    if (open) await store.updateProject({ title })
    else await $fetch(`/api/projects/${project.id}`, { method: 'PATCH', body: { title } })
    project.updatedAt = new Date().toISOString()
  }
  catch (error) {
    project.title = before
    // The store reports its own failures.
    if (!open) notifyError(error, { toast, nuxtApp })
  }
}

async function restore(project: ProjectSummary, options: { quiet?: boolean } = {}) {
  const before = project.deletedAt
  const index = list.value.indexOf(project)
  project.deletedAt = null
  dropUndo(project)
  if (!options.quiet && showDeleted.value) void focusAfter(index)
  try {
    await $fetch(`/api/projects/${project.id}/restore`, { method: 'POST' })
    if (!options.quiet) toast.add({ title: t('projects.toast.restored', { title: project.title }), icon: 'i-lucide-undo-2' })
    void loadPaths()
  }
  catch (error) {
    project.deletedAt = before
    notifyError(error, { toast, nuxtApp })
  }
}

async function remove(project: ProjectSummary) {
  const before = project.deletedAt
  const index = list.value.indexOf(project)
  project.deletedAt = new Date().toISOString()
  void focusAfter(index)
  try {
    await $fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
    forgetOpen(project)
    const { id } = toast.add({
      title: t('projects.toast.deleted', { title: project.title }),
      icon: 'i-lucide-trash-2',
      actions: [{ label: t('common.actions.undo'), onClick: () => { void restore(project, { quiet: true }) } }],
    })
    undoToasts.set(project.id, id)
  }
  catch (error) {
    project.deletedAt = before
    notifyError(error, { toast, nuxtApp })
  }
}

async function purge(project: ProjectSummary) {
  const confirmed = await confirm({
    title: t('projects.confirm.purgeTitle', { title: project.title }),
    description: t('projects.confirm.purgeBody'),
    confirmLabel: t('projects.confirm.purgeLabel'),
    phrase: project.title,
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/projects/${project.id}`, { method: 'DELETE', query: { forever: 1 } })
    const index = list.value.indexOf(project)
    projects.value = projects.value.filter(p => p.id !== project.id)
    void focusAfter(index)
    dropUndo(project)
    forgetOpen(project)
    toast.add({ title: t('projects.toast.purged', { title: project.title }), icon: 'i-lucide-check' })
  }
  catch (error) {
    notifyError(error, { toast, nuxtApp })
  }
}

/** The project backup (.dramatis.zip with the JSON and the images), from the export area's endpoint. */
async function fetchBackup(project: ProjectSummary, purpose?: 'copy') {
  const response = await $fetch.raw<Blob>(`/api/projects/${project.id}/export/backup`, { responseType: 'blob', query: purpose ? { purpose } : undefined })
  const name = response.headers.get('x-dramatis-filename')
  return { blob: response._data as Blob, name: name ? decodeURIComponent(name) : 'backup.dramatis.zip' }
}

/** Saves the backup as a file. A refused request says why, rather than saving the error as a file. */
async function backup(project: ProjectSummary) {
  if (busy[project.id]) return
  busy[project.id] = 'downloading'
  try {
    const { blob, name } = await fetchBackup(project)
    const url = URL.createObjectURL(blob)
    const link = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  catch (error) {
    notifyError(error, { toast, nuxtApp })
  }
  finally {
    delete busy[project.id]
  }
}

/**
 * A copy of the project: its own backup imported again (lossless, new ids), then named
 * "Titolo (copia)". It joins the list at the top.
 */
async function duplicate(project: ProjectSummary) {
  if (busy[project.id]) return
  busy[project.id] = 'duplicating'
  try {
    const { blob } = await fetchBackup(project, 'copy')
    const body = new FormData()
    body.append('file', blob, 'copy.dramatis.zip')
    const copy = await $fetch<Project>('/api/projects/import', { method: 'POST', body })
    // The copy exists by now: if its new title does not take, it is still a copy, not a failure to retry.
    const title = t('projects.row.copyTitle', { title: project.title }).slice(0, 200)
    const named = await $fetch(`/api/projects/${copy.id}`, { method: 'PATCH', body: { title } }).then(() => true, () => false)
    toast.add({ title: t('projects.toast.duplicated', { title: named ? title : copy.title }), icon: 'i-lucide-copy' })
  }
  catch (error) {
    notifyError(error, { toast, nuxtApp })
  }
  finally {
    delete busy[project.id]
    // The list as the server has it: a copy made before a failure shows up too.
    await load({ quiet: true })
  }
}

const loadErrorMessage = computed(() => (loadError.value ? errorMessage(loadError.value) : ''))
const tabs = computed(() => [
  { key: 'active', to: { query: {} }, count: active.value.length, current: !showDeleted.value },
  { key: 'deleted', to: { query: { deleted: '1' } }, count: deleted.value.length, current: showDeleted.value },
])
const phoneButton = 'min-h-11 lg:min-h-8'

// On a phone "Nuovo progetto" is a fixed bar at the bottom; the toasts rise above it, so their
// "Annulla" stays in reach.
const phoneBar = computed(() => status.value === 'ready' && active.value.length > 0 && !showDeleted.value)
useHead({ bodyAttrs: { class: () => (phoneBar.value && !desktop.value ? 'projects-phone-bar' : '') } })
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-default">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-default focus:p-2">{{ t('common.a11y.skipToContent') }}</a>

    <header class="border-b border-default/60">
      <div class="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        <LandingWordmark to="/projects" :label="t('projects.home')" size="sm" />
        <div class="flex-1" />
        <!-- The account menu is the workspace's; on a phone its button grows to a 44px target. -->
        <div class="max-w-56 max-lg:[&>button]:size-11 max-lg:[&>button]:justify-center">
          <AppUserMenu :collapsed="!desktop" />
        </div>
      </div>
    </header>

    <main id="main" class="mx-auto w-full max-w-5xl flex-1 px-4 pt-8 pb-32 sm:px-6 lg:px-8 lg:pt-12 lg:pb-16">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="min-w-0">
          <h1 ref="heading" tabindex="-1" class="text-2xl font-semibold tracking-tight text-highlighted outline-none">{{ t('projects.title') }}</h1>
          <p v-if="status === 'ready' && active.length" class="mt-1 text-muted">{{ summary }}</p>
        </div>
        <div v-if="status === 'ready' && active.length" class="flex flex-wrap items-center gap-2">
          <UTooltip :text="t('projects.actions.importHint')">
            <ExportImportButton :class="phoneButton" />
          </UTooltip>
          <ProjectsDemoMenu :button="{ class: phoneButton }" />
          <UButton
            :label="t('common.nav.newProject')"
            icon="i-lucide-plus"
            color="primary"
            variant="solid"
            class="hidden lg:inline-flex"
            @click="createOpen = true"
          />
        </div>
      </div>

      <nav v-if="status === 'ready' && (deleted.length || showDeleted)" class="mt-6 flex items-center gap-1 border-b border-default" :aria-label="t('projects.filter.label')">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.key"
          :to="tab.to"
          :aria-current="tab.current ? 'page' : undefined"
          class="-mb-px flex min-h-11 items-center gap-2 border-b-2 px-2 text-sm transition-colors duration-150 lg:min-h-9"
          :class="tab.current ? 'border-(--ui-primary) font-medium text-highlighted' : 'border-transparent text-muted hover:text-highlighted'"
        >
          {{ t(`projects.filter.${tab.key}`) }}
          <span class="text-xs text-muted tabular">{{ number(tab.count) }}</span>
        </NuxtLink>
      </nav>

      <section class="mt-5">
        <div v-if="status === 'loading'" class="space-y-2" aria-busy="true">
          <div v-for="i in 3" :key="i" class="flex items-center gap-3 py-2">
            <USkeleton class="size-8 shrink-0" />
            <div class="flex-1 space-y-1.5">
              <USkeleton class="h-4 w-56 max-w-full" />
              <USkeleton class="h-3 w-40 max-w-full" />
            </div>
          </div>
          <span class="sr-only">{{ t('common.status.loading') }}</span>
        </div>

        <DEmptyState
          v-else-if="status === 'error'"
          icon="i-lucide-cloud-off"
          :title="loadErrorMessage"
          :actions="[{ label: t('common.actions.retry'), color: 'neutral', variant: 'outline', onClick: () => load() }]"
        />

        <ProjectsEmpty v-else-if="!showDeleted && !active.length" @create="createOpen = true" />

        <template v-else>
          <p v-if="showDeleted && deleted.length" class="mb-3 text-sm text-muted">{{ t('projects.deleted.note') }}</p>
          <ul v-if="list.length" ref="listEl" class="-mx-2 space-y-0.5">
            <ProjectsRow
              v-for="project in list"
              :key="project.id"
              :project="project"
              :words="words(project.words)"
              :meta="project.deletedAt ? undefined : stage(project)"
              :renaming="renaming === project.id"
              :busy="busy[project.id]"
              @rename="renaming = project.id"
              @commit-rename="title => rename(project, title)"
              @cancel-rename="renaming = null"
              @remove="remove(project)"
              @restore="restore(project)"
              @purge="purge(project)"
              @duplicate="duplicate(project)"
              @backup="backup(project)"
            />
          </ul>
          <div v-else class="py-6">
            <p class="text-muted">{{ t('projects.deleted.empty') }}</p>
            <ULink to="/projects" class="mt-2 inline-block text-sm font-medium text-primary underline">{{ t('projects.deleted.back') }}</ULink>
          </div>
        </template>
      </section>
    </main>

    <div
      v-if="phoneBar"
      class="fixed inset-x-0 bottom-0 z-30 border-t border-default bg-default px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"
    >
      <UButton
        :label="t('common.nav.newProject')"
        icon="i-lucide-plus"
        color="primary"
        variant="solid"
        size="lg"
        block
        class="min-h-11"
        @click="createOpen = true"
      />
    </div>

    <ProjectsCreateDialog v-model:open="createOpen" />
  </div>
</template>

<style>
/* The toasts (Nuxt UI's viewport) above the fixed "Nuovo progetto" bar, keeping their usual 1rem gap. */
body.projects-phone-bar ol[data-slot='viewport'] {
  bottom: calc(5.375rem + env(safe-area-inset-bottom));
}
</style>
