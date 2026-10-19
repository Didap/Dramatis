<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { RichDoc } from '#shared/types/domain'
import type { Scene } from '#shared/types/entities'
import { focusRowKey, provideOutlineContext, sortableOptions, useDragging, useManuscriptStructure, useRenaming, type RowActionGroup } from '~/components/manuscript/Structure.vue'

/**
 * A chapter (spec 4.5): why it exists (its purpose), its scenes with their synopses, its notes, who
 * and where is in it; and the reading view (`?view=read`), the scenes' text in sequence, read only.
 */
const route = useRoute()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { words, scenes: sceneCount } = useFormat()
const structure = useManuscriptStructure()
const dragging = useDragging()
const renaming = useRenaming()
const moveOpen = ref(false)

const chapterId = computed(() => String(route.params.chapterId))
const chapter = computed(() => store.get('chapters', chapterId.value))
const reading = computed(() => route.query.view === 'read')
const guidance = computed(() => store.project?.settings.guidance ?? true)

// The scenes of this chapter can be ticked and acted on together, as in the outline; a step up or
// down keeps them in the chapter ("Sposta in" sends one elsewhere).
const selected = ref<string[]>([])
provideOutlineContext({ selected, visible: (scene: Scene) => scene.chapterId === chapterId.value, singleChapter: true })

const title = computed(() => structure.chapterTitle(chapter.value))
const number = computed(() => store.chapterNumber(chapterId.value))
const scenes = computed(() => store.chapterScenes(chapterId.value))
const sceneIds = computed(() => scenes.value.map(s => s.id))
const total = computed(() => scenes.value.reduce((n, s) => n + s.wordCount, 0))
const partId = computed(() => (chapter.value && structure.usesParts.value ? structure.partOf(chapter.value) : null))
const part = computed(() => store.get('parts', partId.value))
const partNumber = computed(() => (part.value ? structure.partNumber(part.value.id) : 0))
const position = computed(() => [
  part.value ? structure.partPosition(partNumber.value) : null,
  structure.chapterPosition(number.value) || null,
].filter(Boolean).join(' · '))
/** The part by its title, when the title says more than the position line ("Atto I" already does). */
const partName = computed(() => (part.value && !structure.partTitleIsPosition(part.value, partNumber.value) ? structure.partTitle(part.value) : ''))

const outline = computed(() => `/p/${store.projectId}/manuscript`)
const order = computed(() => store.orderedChapters)
const previous = computed(() => order.value[order.value.findIndex(c => c.id === chapterId.value) - 1])
const next = computed(() => order.value[order.value.findIndex(c => c.id === chapterId.value) + 1])
const chapterLabel = (c: { id: string, title: string }) => t('manuscript.page.chapterLabel', { n: store.chapterNumber(c.id), title: structure.chapterTitle(c) })

// The selection belongs to this chapter and this view.
watch(sceneIds, (ids) => {
  const kept = selected.value.filter(id => ids.includes(id))
  if (kept.length !== selected.value.length) selected.value = kept
})
watch([chapterId, reading], () => { selected.value = [] })

// ---------------------------------------------------------------- editing

function setTitle(value: string) {
  if (chapter.value) store.patchSoon('chapters', chapter.value.id, { title: value })
}

function setReason(doc: RichDoc) {
  if (chapter.value) store.patchSoon('chapters', chapter.value.id, { reason: doc }, 1000)
}

function setNotes(doc: RichDoc) {
  if (chapter.value) store.patchSoon('chapters', chapter.value.id, { notes: doc }, 1000)
}

async function addScene(titleText: string) {
  await structure.createScene({ chapterId: chapterId.value, title: titleText })
}

function onStart(event: { item: HTMLElement }) {
  const id = event.item.dataset.id
  if (id) dragging.value = { kind: 'scene', id }
}

function onDrop(ids: string[]) {
  const moving = dragging.value
  if (moving?.kind !== 'scene' || !ids.includes(moving.id)) return
  void store.reorder('scenes', ids, { chapterId: chapterId.value }).catch(() => {})
  structure.announce(t('manuscript.live.moved', { title: structure.sceneTitle(store.get('scenes', moving.id)), n: ids.indexOf(moving.id) + 1, total: ids.length, container: title.value }))
}

/** To the trash with its scenes, then back to the outline, on the chapter that took its place. */
async function trash() {
  const back = outline.value
  const neighbour = next.value ?? previous.value
  await structure.trash('chapter', chapterId.value)
  await navigateTo(back)
  if (neighbour) focusRowKey(`chapter:${neighbour.id}`)
}

async function newScene() {
  const scene = await structure.createScene({ chapterId: chapterId.value }).catch(() => null)
  if (scene) renaming.value = scene.id
}

async function newChapter(where: 'before' | 'after') {
  const created = await structure.createChapter(where === 'before' ? { before: chapterId.value } : { after: chapterId.value }).catch(() => null)
  if (created) await navigateTo(store.refPath({ type: 'chapter', id: created.id }))
}

const menu = computed<RowActionGroup[]>(() => [
  {
    key: 'create',
    actions: [
      { key: 'scene', label: t('manuscript.chapter.newSceneIn'), icon: 'i-lucide-file-plus', onSelect: () => { void newScene() } },
      ...(structure.isFirst('chapter', chapterId.value) ? [{ key: 'before', label: t('manuscript.chapter.newBefore'), icon: 'i-lucide-arrow-up-to-line', onSelect: () => { void newChapter('before') } }] : []),
      { key: 'after', label: t('manuscript.chapter.newAfter'), icon: 'i-lucide-plus', onSelect: () => { void newChapter('after') } },
    ],
  },
  {
    key: 'trash',
    actions: [{ key: 'trash', label: t('manuscript.chapter.trash'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void trash() } }],
  },
])

// ---------------------------------------------------------------- who and where (computed from the scenes)

const presence = computed(() => {
  const characters = new Map<string, number>()
  const locations = new Map<string, number>()
  const strands = new Map<string, number>()
  const count = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1)
  for (const scene of scenes.value) {
    const people = new Set([...scene.characterIds, ...(scene.povCharacterId ? [scene.povCharacterId] : [])])
    for (const id of people) if (store.get('characters', id)) count(characters, id)
    for (const id of new Set(scene.locationIds)) if (store.get('locations', id)) count(locations, id)
    for (const id of new Set(scene.strandIds)) if (store.get('strands', id)) count(strands, id)
  }
  const sorted = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1])
  return {
    characters: sorted(characters).map(([id, n]) => ({ item: store.get('characters', id)!, n })),
    locations: sorted(locations).map(([id, n]) => ({ item: store.get('locations', id)!, n })),
    strands: sorted(strands).map(([id, n]) => ({ item: store.get('strands', id)!, n })),
  }
})

const pageTitle = computed(() => (chapter.value ? title.value : term('chapter')))
onBeforeUnmount(() => { renaming.value = null })
</script>

<template>
  <DPage :title="pageTitle" :back="outline" :back-label="term('manuscript')">
    <template v-if="chapter" #actions>
      <ManuscriptMoveMenu v-model:open="moveOpen" kind="chapter" :id="chapter.id" :title="title" trigger="button" />
      <ManuscriptRowMenu :groups="menu" :label="t('manuscript.page.menu')" size="md" :quiet="false" />
    </template>

    <DEmptyState
      v-if="!chapter"
      icon="i-lucide-book-dashed"
      :title="t('manuscript.page.notFound')"
      :actions="[
        { label: t('manuscript.page.back'), to: outline, color: 'neutral', variant: 'outline' },
        { label: term('trash'), to: `/p/${store.projectId}/trash`, color: 'neutral', variant: 'ghost' },
      ]"
    />

    <template v-else>
      <header class="mb-8" :class="reading ? 'mx-auto max-w-3xl text-center sm:pt-6' : ''">
        <p v-if="position" class="position-line mb-2">{{ position }}</p>
        <h1 v-if="reading" class="voice-author text-[1.75rem] leading-tight font-semibold text-balance text-highlighted sm:text-[2.25rem]">{{ title }}</h1>
        <h1 v-else>
          <DInlineText
            :model-value="chapter.title"
            variant="title"
            :placeholder="t('common.untitled.chapter')"
            :aria-label="t('common.fields.title')"
            :maxlength="300"
            class="voice-author"
            @update:model-value="setTitle"
          />
        </h1>
        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted" :class="reading ? 'justify-center' : ''">
          <i18n-t v-if="partName" keypath="manuscript.page.inPart" tag="span" scope="global">
            <template #title><span class="voice-author text-toned">{{ t('manuscript.quoted', { text: partName }) }}</span></template>
          </i18n-t>
          <ManuscriptFigures :text="`${sceneCount(scenes.length)} · ${words(total)}`" />
          <ManuscriptStatusLine :scenes="scenes" />
        </div>
        <nav class="mt-5 inline-flex rounded-[calc(var(--ui-radius)*2)] bg-elevated p-0.5 text-sm" :aria-label="t('manuscript.page.views')">
          <NuxtLink
            :to="{ query: { ...route.query, view: undefined } }"
            class="rounded-[calc(var(--ui-radius)*1.5)] px-3 py-1.5 font-medium max-lg:py-3"
            :class="!reading ? 'bg-default text-highlighted shadow-xs' : 'text-muted hover:text-default'"
            :aria-current="!reading ? 'page' : undefined"
            replace
          >
            {{ t('manuscript.page.structure') }}
          </NuxtLink>
          <NuxtLink
            :to="{ query: { ...route.query, view: 'read' } }"
            class="rounded-[calc(var(--ui-radius)*1.5)] px-3 py-1.5 font-medium max-lg:py-3"
            :class="reading ? 'bg-default text-highlighted shadow-xs' : 'text-muted hover:text-default'"
            :aria-current="reading ? 'page' : undefined"
            replace
          >
            {{ t('manuscript.page.reading') }}
          </NuxtLink>
        </nav>
      </header>

      <ManuscriptReadingView v-if="reading" :chapter-id="chapter.id" />

      <div v-else class="space-y-10">
        <section aria-labelledby="chapter-purpose" class="max-w-prose">
          <h2 id="chapter-purpose" class="chapter-section-heading">{{ term('chapterPurpose') }}</h2>
          <p v-if="guidance" class="mb-3 text-sm text-pretty text-muted">{{ t('manuscript.page.purposeHint') }}</p>
          <DRichText
            :model-value="chapter.reason"
            prose
            :aria-label="term('chapterPurpose')"
            :placeholder="t('manuscript.page.purposePlaceholder')"
            class="manuscript-field"
            @update:model-value="setReason"
          />
        </section>

        <section aria-labelledby="chapter-scenes">
          <h2 id="chapter-scenes" class="chapter-section-heading">{{ term('scene', 2) }}</h2>
          <div class="relative">
            <VueDraggable
              tag="ul"
              :model-value="sceneIds"
              :group="{ name: 'chapter-scenes', pull: false, put: false }"
              v-bind="sortableOptions('scene')"
              class="min-h-11"
              @start="onStart"
              @update:model-value="onDrop"
              @end="dragging = null"
            >
              <ManuscriptSceneRow v-for="scene in scenes" :key="scene.id" :scene="scene" synopsis="edit" />
            </VueDraggable>
            <p v-if="!scenes.length" class="pointer-events-none absolute inset-0 flex items-center px-2 text-sm text-muted">
              {{ t('manuscript.page.scenesEmpty') }}
            </p>
          </div>
          <ManuscriptAddRow class="mt-1" :label="t('manuscript.scene.new')" :placeholder="t('manuscript.scene.titlePlaceholder')" :create="addScene" />
        </section>

        <section aria-labelledby="chapter-presence">
          <h2 id="chapter-presence" class="chapter-section-heading">{{ t('manuscript.page.presence') }}</h2>
          <p v-if="!presence.characters.length && !presence.locations.length && !presence.strands.length" class="max-w-prose text-sm text-muted">
            {{ t('manuscript.page.presenceEmpty', { at: '@' }) }}
          </p>
          <div v-else class="grid gap-x-10 gap-y-4 sm:grid-cols-2">
            <ul v-if="presence.characters.length" class="-mx-2" :aria-label="term('characters')">
              <li v-for="{ item, n } in presence.characters" :key="item.id">
                <DRow :to="store.refPath({ type: 'character', id: item.id })" :name="item.name">
                  <template #leading>
                    <DEntityAvatar :name="item.name" :image-id="store.primaryImage('character', item.id)" :color="item.color" size="sm" />
                  </template>
                  <template #numbers><ManuscriptFigures :text="sceneCount(n)" /></template>
                </DRow>
              </li>
            </ul>
            <ul v-if="presence.locations.length" class="-mx-2" :aria-label="term('locations')">
              <li v-for="{ item, n } in presence.locations" :key="item.id">
                <DRow :to="store.refPath({ type: 'location', id: item.id })" :name="item.name">
                  <template #leading>
                    <DEntityAvatar :name="item.name" :image-id="store.primaryImage('location', item.id)" shape="square" :icon="REF_ICONS.location" size="sm" />
                  </template>
                  <template #numbers><ManuscriptFigures :text="sceneCount(n)" /></template>
                </DRow>
              </li>
            </ul>
            <!-- The strands (quests, in a game) the chapter carries forward. -->
            <ul v-if="presence.strands.length" class="-mx-2" :aria-label="term('strands')">
              <li v-for="{ item, n } in presence.strands" :key="item.id">
                <DRow :to="store.refPath({ type: 'strand', id: item.id })" :name="item.name">
                  <template #leading>
                    <span class="grid size-8 place-items-center"><DColorDot :color="item.color || null" size="md" /></span>
                  </template>
                  <template #numbers><ManuscriptFigures :text="sceneCount(n)" /></template>
                </DRow>
              </li>
            </ul>
          </div>
        </section>

        <section aria-labelledby="chapter-notes" class="max-w-prose">
          <h2 id="chapter-notes" class="chapter-section-heading">{{ t('common.fields.notes') }}</h2>
          <DRichText
            :model-value="chapter.notes"
            prose
            :aria-label="t('common.fields.notes')"
            :placeholder="t('manuscript.page.notesPlaceholder')"
            class="manuscript-field"
            @update:model-value="setNotes"
          />
        </section>

        <ManuscriptSelectionBar />
      </div>

      <nav v-if="!reading && (previous || next)" class="mt-14 grid gap-3 border-t border-default pt-6 sm:grid-cols-2" :aria-label="term('chapter', 2)">
        <NuxtLink v-if="previous" :to="store.refPath({ type: 'chapter', id: previous.id })" class="group flex min-w-0 flex-col rounded-[calc(var(--ui-radius)*2)] px-2 py-2 hover:bg-elevated">
          <span class="inline-flex items-center gap-1 text-xs text-muted"><UIcon name="i-lucide-arrow-left" class="size-3.5" aria-hidden="true" />{{ t('manuscript.page.previous') }}</span>
          <span class="voice-author truncate font-medium text-highlighted">{{ chapterLabel(previous) }}</span>
        </NuxtLink>
        <span v-else aria-hidden="true" />
        <NuxtLink v-if="next" :to="store.refPath({ type: 'chapter', id: next.id })" class="group flex min-w-0 flex-col items-end rounded-[calc(var(--ui-radius)*2)] px-2 py-2 text-end hover:bg-elevated">
          <span class="inline-flex items-center gap-1 text-xs text-muted">{{ t('manuscript.page.next') }}<UIcon name="i-lucide-arrow-right" class="size-3.5" aria-hidden="true" /></span>
          <span class="voice-author max-w-full truncate font-medium text-highlighted">{{ chapterLabel(next) }}</span>
        </NuxtLink>
      </nav>
    </template>

    <ManuscriptStructure />
  </DPage>
</template>

<style scoped>
/* The four sections of the page share one heading (DESIGN.md "heading": sections in pages). */
.chapter-section-heading {
  margin-bottom: 0.5rem;
  font-size: 1.125rem;
  line-height: 1.35;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}
/* Long fields look like the page (DESIGN.md "Inputs"): a dotted baseline at rest, the frame on focus. */
.manuscript-field {
  border-bottom: 1px dotted var(--ui-border-accented);
  border-radius: calc(var(--ui-radius) * 1.5);
  padding: 0.25rem 0.5rem 0.5rem;
  margin-inline: -0.5rem;
  transition: box-shadow 150ms var(--ease-out-expo), border-color 150ms var(--ease-out-expo);
}
.manuscript-field:focus-within {
  border-bottom-color: transparent;
  box-shadow: 0 0 0 2px var(--ui-primary);
}
.manuscript-field :deep(.tiptap) {
  min-height: 3.2em;
}
/* Mentions are plain text with a dotted underline (DESIGN.md), not the editor's accent. */
.manuscript-field :deep(.tiptap .mention) {
  color: inherit;
  font-weight: inherit;
}
</style>
