<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { RichDoc } from '#shared/types/domain'
import type { UpdateInput } from '#shared/types/entities'
import { docWordCount, isEmptyDoc } from '#shared/utils/richtext'

/**
 * A note (spec 4.3): a title and a text with mentions, written in the author's face. A new note opens
 * with the title ready (the phone keyboard up); Enter goes on to the text. A new note left empty is
 * not kept. Conflict copies saved by the server are ordinary notes.
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
  <DPage v-if="note" :title="note.title.trim() || t('common.untitled.note')" :back="list" :back-label="term('notes')" width="prose">
    <template #actions>
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

    <div ref="body">
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
