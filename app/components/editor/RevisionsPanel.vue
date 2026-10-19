<script lang="ts">
/** A text to read in place of the editor: a revision not in use, or a state of the history. */
export interface PreviewRequest {
  kind: 'revision' | 'snapshot'
  id: string
  title: string
  meta: string
  /** Open on the comparison with the text in the editor. */
  compare?: boolean
}
</script>

<script setup lang="ts">
import type { SceneRevisionInfo } from '#shared/types/entities'
import type { SnapshotInfo } from '~/composables/useSceneContent'

/**
 * Revisions of the scene (spec 5.7): the one in use is marked, the others stay editable and come back
 * with "Usa questa revisione". Each has its Cronologia, the states kept automatically, which restore as a
 * new revision and never overwrite.
 */
defineProps<{ sceneId: string }>()
const emit = defineEmits<{ preview: [request: PreviewRequest] }>()

const scene = useOpenScene()
const { t } = useI18n()
const { term } = useTerms()
const { number, words, relative, date } = useFormat()
const toast = useToast()

const revisions = ref<SceneRevisionInfo[]>([])
const snapshots = ref<SnapshotInfo[]>([])
const loaded = ref(false)
const busy = ref<string | null>(null)
const history = ref<string | null>(null)
const renaming = ref<string | null>(null)
const renameValue = ref('')
const renameField = useTemplateRef<{ $el: HTMLInputElement }[]>('renameField')

/** "Rinomina": the name becomes a field, focused once the menu has finished closing. */
function startRename(id: string) {
  const revision = revisions.value.find(r => r.id === id)
  renameValue.value = revision ? revision.label || nameOf(revision) : ''
  renaming.value = id
  setTimeout(() => {
    const field = renameField.value?.[0]?.$el
    field?.focus()
    field?.select()
  }, 220)
}

/** Only the newest load lands: an older answer arriving late never replaces a fresher list. */
let loads = 0
let reload: ReturnType<typeof setTimeout> | undefined

async function load() {
  clearTimeout(reload)
  const ticket = ++loads
  try {
    const [list, states] = await Promise.all([scene.listRevisions(), scene.listSnapshots()])
    if (ticket !== loads) return
    revisions.value = list
    snapshots.value = states
  }
  catch (error) {
    if (ticket === loads) notifyError(error)
  }
  finally {
    if (ticket === loads) loaded.value = true
  }
}

onMounted(load)
// Another revision in use: at once. While the panel is open, saves can store new states in the history
// and change dates and words: the list follows a moment after the writing pauses.
watch([() => scene.revisionId.value, () => scene.version.value], ([revision], [before]) => {
  if (revision !== before) return void load()
  clearTimeout(reload)
  reload = setTimeout(load, 2000)
})
// A conflict keeps the revision in use but adds "Conflitto del ..." to the list.
watch(() => scene.conflict.value, (info) => {
  if (info) void load()
})
onBeforeUnmount(() => clearTimeout(reload))

function toggleHistory(id: string) {
  history.value = history.value === id ? null : id
  if (history.value) void load()
}

const active = computed(() => scene.revisionId.value)
const nameOf = (r: SceneRevisionInfo) => r.label || t('editor.revisions.numbered', { n: r.number })
const wordsOf = (r: SceneRevisionInfo) => (r.id === active.value ? scene.savedWords.value : r.wordCount)
const statesOf = (id: string) => snapshots.value.filter(s => s.revisionId === id)
const when = (iso: string) => date(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

async function run(key: string, work: () => Promise<unknown>) {
  busy.value = key
  try {
    await work()
  }
  catch (error) {
    notifyError(error)
  }
  finally {
    busy.value = null
  }
}

function create() {
  return run('create', async () => {
    const revision = await scene.createRevision()
    await load()
    toast.add({ title: t('editor.revisions.created', { name: nameOf(revision) }), icon: 'i-lucide-copy-plus' })
  })
}

function use(revision: SceneRevisionInfo) {
  return run(revision.id, async () => {
    await scene.activateRevision(revision.id)
    toast.add({ title: t('editor.revisions.inUseNow', { name: nameOf(revision) }), icon: 'i-lucide-check' })
  })
}

function trash(revision: SceneRevisionInfo) {
  return run(revision.id, async () => {
    await scene.trashRevision(revision.id)
    await load()
    toast.add({
      title: t('editor.revisions.trashed', { name: nameOf(revision) }),
      icon: 'i-lucide-trash-2',
      actions: [{ label: t('common.actions.undo'), onClick: () => { void scene.untrashRevision(revision.id).then(load).catch(notifyError) } }],
    })
  })
}

async function rename(revision: SceneRevisionInfo, label: string) {
  renaming.value = null
  if (label === revision.label || (!revision.label && label === nameOf(revision))) return
  await run(revision.id, async () => {
    const updated = await scene.renameRevision(revision.id, label)
    revisions.value = revisions.value.map(r => (r.id === updated.id ? { ...r, label: updated.label } : r))
  })
}

function restore(state: SnapshotInfo) {
  return run(state.id, async () => {
    const revision = await scene.restoreSnapshot(state.id)
    await load()
    toast.add({ title: t('editor.revisions.restored', { name: nameOf(revision) }), icon: 'i-lucide-history' })
  })
}

function preview(kind: 'revision' | 'snapshot', id: string, title: string, wordCount: number, at: string, compare = false) {
  emit('preview', { kind, id, title, meta: `${when(at)} · ${words(wordCount)}`, compare })
}

const REASONS: Record<string, string> = { before_bulk: 'beforeBulk', conflict: 'conflict', restore: 'restore' }

function menu(revision: SceneRevisionInfo) {
  const isActive = revision.id === active.value
  return [
    [
      ...(!isActive ? [{ label: t('editor.revisions.use'), icon: 'i-lucide-check', onSelect: () => use(revision) }] : []),
      ...(!isActive ? [{ label: t('editor.revisions.read'), icon: 'i-lucide-book-open-text', onSelect: () => preview('revision', revision.id, nameOf(revision), revision.wordCount, revision.updatedAt) }] : []),
      ...(!isActive ? [{ label: t('editor.compare.start'), icon: 'i-lucide-git-compare', onSelect: () => preview('revision', revision.id, nameOf(revision), revision.wordCount, revision.updatedAt, true) }] : []),
      { label: t('common.actions.rename'), icon: 'i-lucide-pencil', onSelect: () => startRename(revision.id) },
    ],
    ...(!isActive && revisions.value.length > 1 ? [[{ label: t('editor.revisions.trash'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => trash(revision) }]] : []),
  ]
}
</script>

<template>
  <div class="space-y-5 pb-6">
    <div class="space-y-3">
      <p class="text-sm text-muted">{{ t('editor.revisions.intro') }}</p>
      <UButton
        variant="outline"
        size="sm"
        class="pointer-coarse:min-h-11"
        icon="i-lucide-copy-plus"
        :label="t('editor.revisions.create')"
        :loading="busy === 'create'"
        @click="create"
      />
    </div>

    <div v-if="!loaded" class="space-y-2" aria-busy="true">
      <USkeleton v-for="i in 2" :key="i" class="h-12 w-full" />
    </div>

    <ol v-else class="space-y-1" :aria-label="term('revision', 2)">
      <li v-for="revision in revisions" :key="revision.id" class="rounded-[calc(var(--ui-radius)*2)]" :class="revision.id === active ? 'bg-elevated/70' : ''">
        <div class="group flex items-start gap-2 px-2 py-2">
          <UIcon
            :name="revision.id === active ? 'i-lucide-pencil-line' : 'i-lucide-file-stack'"
            class="mt-1 size-4 shrink-0"
            :class="revision.id === active ? 'text-primary' : 'text-dimmed'"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <DInlineText
                v-if="renaming === revision.id"
                ref="renameField"
                v-model="renameValue"
                :maxlength="120"
                :aria-label="t('common.actions.rename')"
                class="voice-author font-semibold"
                @commit="(label) => rename(revision, label)"
              />
              <span v-else class="voice-author min-w-0 font-semibold text-highlighted [overflow-wrap:anywhere]">{{ nameOf(revision) }}</span>
              <DLeader />
              <span class="tabular shrink-0 text-xs text-muted">{{ words(wordsOf(revision)) }}</span>
            </div>
            <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span v-if="revision.id === active" class="inline-flex items-center gap-1 font-medium text-toned">
                <UIcon name="i-lucide-check" class="size-3.5" aria-hidden="true" />{{ t('editor.revisions.inUse') }}
              </span>
              <UTooltip :text="when(revision.updatedAt)">
                <span>{{ t('editor.revisions.edited', { when: relative(revision.updatedAt) }) }}</span>
              </UTooltip>
            </p>
            <UButton
              variant="link"
              size="xs"
              class="mt-1 px-0 pointer-coarse:min-h-11"
              :icon="history === revision.id ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              :aria-expanded="history === revision.id"
              :label="t('editor.revisions.history', { n: number(statesOf(revision.id).length) }, statesOf(revision.id).length)"
              @click="toggleHistory(revision.id)"
            />
          </div>
          <!-- No focus back to the button: Rinomina puts it in the name field. -->
          <UDropdownMenu :items="menu(revision)" :content="{ align: 'end', onCloseAutoFocus: (e: Event) => e.preventDefault() }">
            <UButton icon="i-lucide-ellipsis" size="sm" class="pointer-coarse:size-11 pointer-coarse:justify-center" :loading="busy === revision.id" :aria-label="t('editor.revisions.actions', { name: nameOf(revision) })" />
          </UDropdownMenu>
        </div>

        <div v-if="history === revision.id" class="pb-2 ps-8 pe-2">
          <p v-if="!statesOf(revision.id).length" class="text-xs text-muted">{{ t('editor.revisions.historyEmpty') }}</p>
          <ol v-else class="space-y-0.5" :aria-label="term('history')">
            <li v-for="state in statesOf(revision.id)" :key="state.id" class="group flex items-center gap-2 py-1 text-xs">
              <span class="text-default">{{ when(state.createdAt) }}</span>
              <span v-if="REASONS[state.reason]" class="text-muted">{{ t(`editor.revisions.reason.${REASONS[state.reason]}`) }}</span>
              <DLeader />
              <span class="tabular shrink-0 text-muted">{{ number(state.wordCount) }}</span>
              <UButton
                icon="i-lucide-eye"
                size="xs"
                class="pointer-coarse:size-11 pointer-coarse:justify-center"
                :aria-label="t('editor.revisions.preview', { when: when(state.createdAt) })"
                @click="preview('snapshot', state.id, nameOf(revision), state.wordCount, state.createdAt)"
              />
              <UButton
                icon="i-lucide-history"
                size="xs"
                class="pointer-coarse:size-11 pointer-coarse:justify-center"
                :loading="busy === state.id"
                :aria-label="t('editor.revisions.restore', { when: when(state.createdAt) })"
                @click="restore(state)"
              />
            </li>
          </ol>
        </div>
      </li>
    </ol>
  </div>
</template>
