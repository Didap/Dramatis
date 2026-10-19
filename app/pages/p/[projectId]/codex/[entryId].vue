<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { RichDoc } from '#shared/types/domain'
import type { UpdateInput } from '#shared/types/entities'
import { docWordCount, isEmptyDoc } from '#shared/utils/richtext'

/**
 * An entry of the codex (spec 4.4): its title, its category (changing it moves the entry to the end of
 * the other one), the text with mentions in the author's face and its images. A new entry opens with
 * the title selected; one left exactly as it was created is not kept.
 */
const route = useRoute()
const router = useRouter()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { relative, words } = useFormat()

const id = String(route.params.entryId)
const entry = computed(() => store.get('codexEntries', id))
const list = computed(() => `/p/${store.projectId}/codex`)
// Back to the codex as the author left it: all categories, or the one shown alone.
const shownCategory = useState<string | null>(`dramatis:codex-category:${store.projectId}`, () => null)
const back = computed(() => (shownCategory.value ? `${list.value}?category=${shownCategory.value}` : list.value))
const backLabel = computed(() => store.get('codexCategories', shownCategory.value)?.name ?? term('codex'))
const editedAt = computed(() => (typeof entry.value?.meta?.editedAt === 'string' ? entry.value.meta.editedAt : entry.value?.createdAt ?? ''))
const count = computed(() => docWordCount(entry.value?.body))
const categoryItems = computed(() => store.rows.codexCategories.map(c => ({ value: c.id, label: c.name })))

const fresh = route.query.new === '1'
const untitled = t('common.untitled.entry')
const titleField = ref<{ $el: HTMLInputElement } | null>(null)
const body = ref<HTMLElement | null>(null)

onMounted(async () => {
  if (!fresh) return
  void router.replace({ query: { ...route.query, new: undefined } })
  await nextTick()
  titleField.value?.$el?.focus()
  titleField.value?.$el?.select()
})

/** Text edits record when they happened: the list shows it (a reorder also touches updatedAt). */
function edit(patch: UpdateInput<'codexEntries'>, delay?: number) {
  if (!entry.value) return
  store.patchSoon('codexEntries', id, { ...patch, meta: { ...entry.value.meta, editedAt: new Date().toISOString() } }, delay)
}

function rename(title: string) {
  if (title.trim()) edit({ title })
}

function toBody(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  const editable = body.value?.querySelector('.ProseMirror') as (HTMLElement & { editor?: Editor }) | null
  editable?.editor?.commands.focus('end')
}

/** Another category: the entry goes to its end. Queued typing is sent first. */
async function moveTo(categoryId: string) {
  if (!entry.value || categoryId === entry.value.categoryId) return
  const last = store.rows.codexEntries.filter(e => e.categoryId === categoryId).reduce((n, e) => Math.max(n, e.position), -1)
  await store.flush()
  await store.update('codexEntries', id, { categoryId, position: last + 1 }).catch(() => {})
}

async function trash() {
  if (await store.remove('codexEntries', id).catch(() => null)) await navigateTo(back.value)
}

const menu = computed(() => [[{ label: t('common.actions.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: trash }]])

// An entry opened as new and left exactly as it was created is not kept, not even in the trash.
onBeforeUnmount(() => {
  const current = entry.value
  if (!fresh || !current || current.title.trim() !== untitled || !isEmptyDoc(current.body) || store.imagesOf('codex', id).length) return
  void (async () => {
    await store.flush()
    await store.remove('codexEntries', id, { undo: false })
    await $fetch(`/api/projects/${store.projectId}/trash/purge`, { method: 'POST', body: { collection: 'codexEntries', id } })
    store.trashCount = Math.max(0, store.trashCount - 1)
  })().catch(() => {})
})
</script>

<template>
  <DPage v-if="!store.modules.codex" :title="term('codex')" :back="list" :back-label="term('codex')" width="prose">
    <DEmptyState
      icon="i-lucide-library-big"
      :title="t('codex.moduleOff')"
      :actions="[{ label: t('codex.openSettings'), to: `/p/${store.projectId}/settings`, color: 'neutral', variant: 'outline', class: 'max-lg:min-h-11' }]"
    />
  </DPage>

  <DPage v-else-if="entry" :title="entry.title" :back="back" :back-label="backLabel" width="prose">
    <template #actions>
      <UDropdownMenu :items="menu" :content="{ align: 'end' }">
        <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="t('codex.entryPageActions')" class="max-lg:size-11 max-lg:justify-center" />
      </UDropdownMenu>
    </template>

    <header class="pb-6">
      <!-- The page's heading for assistive technology; the title itself is edited in place. -->
      <h1 class="sr-only">{{ entry.title }}</h1>
      <DInlineText
        ref="titleField"
        :lang="store.project?.language"
        :model-value="entry.title"
        required
        variant="title"
        :maxlength="200"
        :aria-label="t('codex.entryTitle')"
        class="voice-author font-semibold! lg:text-4xl! lg:leading-tight!"
        @update:model-value="rename"
        @keydown="toBody"
      />
      <div class="mt-3 flex flex-col items-start gap-x-3 gap-y-1 text-sm text-muted sm:flex-row sm:items-center">
        <USelect
          :model-value="entry.categoryId"
          :items="categoryItems"
          color="neutral"
          variant="ghost"
          icon="i-lucide-folder"
          class="-ms-2.5 max-w-full max-lg:min-h-11"
          :aria-label="t('codex.category')"
          @update:model-value="(value) => moveTo(String(value))"
        />
        <p>
          <span class="whitespace-nowrap">{{ t('codex.edited', { when: relative(editedAt) }) }}<span aria-hidden="true"> ·</span></span>
          {{ ' ' }}<span class="tabular whitespace-nowrap">{{ words(count) }}</span>
        </p>
      </div>
    </header>

    <div ref="body">
      <ArchitectureLongText
        :model-value="entry.body"
        :placeholder="t(`codex.bodyPlaceholder.${store.kind}`)"
        :aria-label="t('codex.entryBody')"
        @update:model-value="(doc: RichDoc) => edit({ body: doc }, 1000)"
      />
    </div>

    <section class="mt-12" aria-labelledby="codex-images">
      <h2 id="codex-images" class="mb-3 text-lg font-semibold text-highlighted">{{ t('codex.images') }}</h2>
      <DImageGallery owner-type="codex" :owner-id="entry.id" :name="entry.title" />
    </section>
  </DPage>

  <DPage v-else :title="term('codex')" :back="list" :back-label="term('codex')" width="prose">
    <DEmptyState
      icon="i-lucide-library-big"
      :title="t('codex.notFound')"
      :actions="[
        { label: term('codex'), to: list, color: 'neutral', variant: 'outline', class: 'max-lg:min-h-11' },
        { label: term('trash'), to: `/p/${store.projectId}/trash`, color: 'neutral', variant: 'link', class: 'max-lg:min-h-11' },
      ]"
    />
  </DPage>
</template>
