<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { RichDoc } from '#shared/types/domain'
import type { UpdateInput } from '#shared/types/entities'
import { docWordCount, isEmptyDoc } from '#shared/utils/richtext'
import { pageWidthLength } from '~/utils/page-width'

/**
 * A note (spec 4.3): a title and a text with mentions, written in the author's face. A new note opens
 * with the title ready (the phone keyboard up); Enter goes on to the text. A new note left empty is
 * not kept. Conflict copies saved by the server are ordinary notes. The width of the page (book, wide,
 * full) is the author's, saved to the account like the editor's and the reading view's.
 */
const route = useRoute()
const router = useRouter()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { relative, words } = useFormat()

const id = String(route.params.noteId)
const note = computed(() => store.get('notes', id))
const list = computed(() => `/p/${store.projectId}/notes`)
const editedAt = computed(() => (typeof note.value?.meta?.editedAt === 'string' ? note.value.meta.editedAt : note.value?.createdAt ?? ''))
const count = computed(() => docWordCount(note.value?.content))

const { prefs: typography, load: loadTypography, set: setTypography } = useEditorTypography()
onMounted(() => { void loadTypography() })
const pageWidth = computed(() => ({ book: 'prose', wide: 'default', full: 'full' } as const)[typography.value.noteWidth ?? 'book'])

const fresh = route.query.new === '1'
const titleField = ref<{ $el: HTMLElement } | null>(null)
const body = ref<HTMLElement | null>(null)

onMounted(async () => {
  if (!fresh) return
  void router.replace({ query: { ...route.query, new: undefined } })
  await nextTick()
  titleField.value?.$el?.focus()
})

/** Text edits record when they happened: the list shows it (a reorder also touches updatedAt). */
function edit(patch: UpdateInput<'notes'>, delay?: number) {
  if (!note.value) return
  store.patchSoon('notes', id, { ...patch, meta: { ...note.value.meta, editedAt: new Date().toISOString() } }, delay)
}

function toBody(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  const editable = body.value?.querySelector('.ProseMirror') as (HTMLElement & { editor?: Editor }) | null
  editable?.editor?.commands.focus('end')
}

/** Queued typing is sent first, so the answer to the pin never undoes it. */
async function togglePin() {
  if (!note.value) return
  const pinned = !note.value.pinned
  await store.flush()
  await store.update('notes', id, { pinned }).catch(() => {})
}

async function trash() {
  if (await store.remove('notes', id).catch(() => null)) await navigateTo(list.value)
}

const menu = computed(() => [[{ label: t('common.actions.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: trash }]])

// A note opened as new and left without a word is not kept, not even in the trash.
onBeforeUnmount(() => {
  const current = note.value
  if (!fresh || !current || current.title.trim() || !isEmptyDoc(current.content)) return
  void (async () => {
    await store.flush()
    await store.remove('notes', id, { undo: false })
    await $fetch(`/api/projects/${store.projectId}/trash/purge`, { method: 'POST', body: { collection: 'notes', id } })
    store.trashCount = Math.max(0, store.trashCount - 1)
  })().catch(() => {})
})
</script>

<template>
  <DPage v-if="note" :title="note.title.trim() || t('common.untitled.note')" :back="list" :back-label="term('notes')" :width="pageWidth">
    <template #actions>
      <UPopover :content="{ align: 'end', sideOffset: 6 }">
        <UTooltip :text="t('common.pageWidth.label')">
          <UButton icon="i-lucide-move-horizontal" color="neutral" variant="ghost" :aria-label="t('common.pageWidth.label')" class="max-sm:hidden max-lg:size-11 max-lg:justify-center" />
        </UTooltip>
        <template #content>
          <div class="w-72 p-4">
            <DPageWidth :model-value="typography.noteWidth" @update:model-value="(v) => setTypography({ noteWidth: v })" />
          </div>
        </template>
      </UPopover>
      <UTooltip :text="note.pinned ? t('notes.unpin') : t('notes.pin')">
        <UButton
          :icon="note.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'"
          color="neutral"
          variant="ghost"
          :aria-label="note.pinned ? t('notes.unpin') : t('notes.pin')"
          class="max-lg:size-11 max-lg:justify-center"
          @click="togglePin"
        />
      </UTooltip>
      <UDropdownMenu :items="menu" :content="{ align: 'end' }">
        <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="t('notes.pageActions')" class="max-lg:size-11 max-lg:justify-center" />
      </UDropdownMenu>
    </template>

    <header class="pb-6">
      <!-- The page's heading for assistive technology; the title itself is edited in place. -->
      <h1 class="sr-only">{{ note.title.trim() || t('common.untitled.note') }}</h1>
      <DInlineText
        ref="titleField"
        :lang="store.project?.language"
        :model-value="note.title"
        variant="title"
        multiline
        :maxlength="300"
        :placeholder="t('notes.titlePlaceholder')"
        :aria-label="t('notes.titleLabel')"
        class="voice-author font-semibold! lg:text-4xl! lg:leading-tight!"
        @update:model-value="(title: string) => edit({ title })"
        @keydown="toBody"
      />
      <p class="mt-2 text-sm text-muted">
        <span v-if="note.pinned" class="whitespace-nowrap"><UIcon name="i-lucide-pin" class="me-1 size-3.5 align-[-0.125em]" />{{ t('notes.pinned') }}<span aria-hidden="true"> ·</span></span>
        {{ ' ' }}<span class="whitespace-nowrap">{{ t('notes.edited', { when: relative(editedAt) }) }}<span aria-hidden="true"> ·</span></span>
        {{ ' ' }}<span class="tabular whitespace-nowrap">{{ words(count) }}</span>
      </p>
    </header>

    <div ref="body" :style="{ '--long-text-width': pageWidthLength(typography.noteWidth) }">
      <ArchitectureLongText
        :model-value="note.content"
        :placeholder="t('notes.bodyPlaceholder')"
        :aria-label="t('notes.bodyLabel')"
        @update:model-value="(content: RichDoc) => edit({ content }, 1000)"
      />
    </div>
  </DPage>

  <DPage v-else :title="term('notes')" :back="list" :back-label="term('notes')" width="prose">
    <DEmptyState
      icon="i-lucide-notebook-pen"
      :title="t('notes.notFound')"
      :actions="[
        { label: term('notes'), to: list, color: 'neutral', variant: 'outline', class: 'max-lg:min-h-11' },
        { label: term('trash'), to: `/p/${store.projectId}/trash`, color: 'neutral', variant: 'link', class: 'max-lg:min-h-11' },
      ]"
    />
  </DPage>
</template>
