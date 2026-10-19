<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { Part } from '#shared/types/entities'
import { sortableOptions, useDragging, useManuscriptStructure, useOutlineContext, useRenaming, type RowActionGroup } from './Structure.vue'

/**
 * A part (an act in games) of the outline: the position line and the title, its chapters and words
 * joined by the leader, then its chapters, which can be dragged within it and to other parts.
 */
const props = defineProps<{ part: Part }>()

const { t } = useI18n()
const store = useProjectStore()
const { words, chapters: chapterCount } = useFormat()
const structure = useManuscriptStructure()
const context = useOutlineContext()
const renaming = useRenaming()
const dragging = useDragging()
const moveOpen = ref(false)
const addRow = ref<{ start: () => void } | null>(null)
const renameInput = ref<{ $el?: HTMLInputElement } | null>(null)
const draft = ref('')

const id = computed(() => props.part.id)
const title = computed(() => structure.partTitle(props.part))
const untitled = computed(() => !props.part.title.trim())
const number = computed(() => structure.partNumber(id.value))
const position = computed(() => structure.partPosition(number.value))
// "Atto I" titled "Atto I": the position line would only repeat the title.
const titleIsPosition = computed(() => structure.partTitleIsPosition(props.part, number.value))
const label = computed(() => structure.partLabel(props.part, number.value))
const chapters = computed(() => structure.chaptersOf(id.value))
const visibleChapters = computed(() => (context.filtering.value ? chapters.value.filter(c => store.chapterScenes(c.id).some(context.visible)) : chapters.value))
const chapterIds = computed(() => visibleChapters.value.map(c => c.id))
const total = computed(() => structure.partWords(id.value))
const collapsed = computed(() => context.collapsed.value.includes(id.value))
const isRenaming = computed(() => renaming.value === id.value)
const listId = computed(() => `manuscript-part-${id.value}`)

function toggle() {
  context.collapsed.value = collapsed.value
    ? context.collapsed.value.filter(c => c !== id.value)
    : [...context.collapsed.value, id.value]
}

function startRename() {
  renaming.value = id.value
}

watch(isRenaming, (on) => {
  if (!on) return
  draft.value = props.part.title
  void nextTick(() => {
    renameInput.value?.$el?.focus()
    renameInput.value?.$el?.select()
  })
}, { immediate: true })

async function finishRename(value: string) {
  if (renaming.value !== id.value) return
  renaming.value = null
  structure.focusRow('part', id.value)
  await structure.rename('part', id.value, value)
}

function onKeydown(event: KeyboardEvent) {
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    void structure.step('part', id.value, event.key === 'ArrowUp' ? -1 : 1)
  }
  else if (event.key === 'F2') {
    event.preventDefault()
    startRename()
  }
}

async function addChapter(titleText: string) {
  await structure.createChapter({ partId: id.value, title: titleText })
}

function newChapter() {
  if (collapsed.value) toggle()
  void nextTick(() => addRow.value?.start())
}

async function createNext(where: 'before' | 'after') {
  const part = await structure.createPart(where === 'before' ? { before: id.value } : { after: id.value }).catch(() => null)
  if (part) renaming.value = part.id
}

function onStart(event: { item: HTMLElement }) {
  const chapterId = event.item.dataset.id
  if (chapterId) dragging.value = { kind: 'chapter', id: chapterId }
}

function onDrop(ids: string[]) {
  const moving = dragging.value
  if (moving?.kind !== 'chapter' || !ids.includes(moving.id)) return
  void store.reorder('chapters', ids, { partId: id.value }).catch(() => {})
  structure.announce(t('manuscript.live.moved', { title: structure.chapterTitle(store.get('chapters', moving.id)), n: ids.indexOf(moving.id) + 1, total: ids.length, container: title.value }))
}

function onEnd() {
  dragging.value = null
}

const menu = computed<RowActionGroup[]>(() => [
  {
    key: 'edit',
    actions: [{ key: 'rename', label: t('manuscript.actions.rename'), icon: 'i-lucide-text-cursor-input', kbds: ['F2'], onSelect: startRename }],
  },
  {
    key: 'create',
    actions: [
      { key: 'chapter', label: t(`manuscript.part.newChapterIn.${store.kind}`), icon: 'i-lucide-file-plus', onSelect: newChapter },
      ...(structure.isFirst('part', id.value) ? [{ key: 'before', label: t(`manuscript.part.newBefore.${store.kind}`), icon: 'i-lucide-arrow-up-to-line', onSelect: () => { void createNext('before') } }] : []),
      { key: 'after', label: t(`manuscript.part.newAfter.${store.kind}`), icon: 'i-lucide-plus', onSelect: () => { void createNext('after') } },
    ],
  },
  {
    key: 'move',
    actions: [
      { key: 'up', label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', kbds: ['alt', 'arrowup'], disabled: !structure.canStep('part', id.value, -1), onSelect: () => { void structure.step('part', id.value, -1) } },
      { key: 'down', label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', kbds: ['alt', 'arrowdown'], disabled: !structure.canStep('part', id.value, 1), onSelect: () => { void structure.step('part', id.value, 1) } },
    ],
  },
  {
    key: 'trash',
    actions: [{ key: 'trash', label: t(`manuscript.part.trash.${store.kind}`), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void structure.trash('part', id.value) } }],
  },
])
</script>

<template>
  <li class="manuscript-part group/part pt-5 first:pt-0" :data-id="part.id">
    <div class="group relative rounded-[calc(var(--ui-radius)*2)] pb-1 pe-0.5 pt-1 transition-colors duration-150 hover:bg-elevated has-[[data-row]:focus-visible]:bg-elevated">
      <!-- Over the title: past the handle, and from 40rem past the disclosure (44px below 1024px). -->
      <p v-if="!titleIsPosition" class="position-line ps-10 sm:ps-[5.5rem] lg:ps-[3.25rem]" aria-hidden="true">{{ position }}</p>
      <div class="flex items-center gap-1">
        <ManuscriptMoveMenu v-model:open="moveOpen" kind="part" :id="part.id" :title="title" />
        <ManuscriptToggle class="max-sm:hidden" :data-row="`part:${part.id}`" :collapsed="collapsed" :controls="listId" :title="label" @toggle="toggle" @keydown="onKeydown" />
        <div class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <DInlineText
            v-if="isRenaming"
            ref="renameInput"
            :model-value="draft"
            :placeholder="t(`manuscript.part.titlePlaceholder.${store.kind}`)"
            :aria-label="t('manuscript.actions.rename')"
            variant="heading"
            class="voice-author relative z-[2]"
            @update:model-value="draft = $event"
            @commit="finishRename"
          />
          <h2 v-else class="voice-author min-w-0 truncate text-lg leading-snug font-semibold" :class="untitled ? 'italic text-muted' : 'text-highlighted'">
            <span v-if="!titleIsPosition" class="sr-only">{{ position }}: </span>{{ title }}
          </h2>
          <DLeader class="hidden sm:block" />
          <div class="flex shrink-0 items-center gap-x-3 text-xs text-muted sm:text-sm">
            <ManuscriptFigures :text="chapterCount(chapters.length)" />
            <ManuscriptFigures class="sm:w-24 sm:text-end" :text="words(total)" />
          </div>
        </div>
        <span class="hidden w-[7.25rem] shrink-0 sm:block" aria-hidden="true" />
        <ManuscriptToggle class="sm:hidden" :data-row="`part:${part.id}`" :collapsed="collapsed" :controls="listId" :title="label" @toggle="toggle" @keydown="onKeydown" />
        <ManuscriptRowMenu :groups="menu" :label="t('manuscript.part.menu', { title })" />
      </div>
    </div>

    <div v-show="!collapsed" :id="listId" class="mt-1">
      <div class="relative">
        <VueDraggable
          tag="ul"
          :model-value="chapterIds"
          :group="{ name: 'chapters' }"
          v-bind="sortableOptions('chapter', !context.filtering.value)"
          class="manuscript-drop min-h-11 space-y-1"
          @start="onStart"
          @update:model-value="onDrop"
          @end="onEnd"
        >
          <ManuscriptOutlineChapter v-for="chapter in visibleChapters" :key="chapter.id" :chapter="chapter" />
        </VueDraggable>
        <p v-if="!visibleChapters.length" class="pointer-events-none absolute inset-0 flex items-center ps-9 text-sm text-dimmed">
          {{ context.filtering.value ? t('manuscript.filters.none') : t(`manuscript.part.empty.${store.kind}`) }}
        </p>
      </div>
      <ManuscriptAddRow
        v-if="!context.filtering.value"
        ref="addRow"
        class="ps-7 transition-opacity duration-150 lg:opacity-0 lg:group-hover/part:opacity-100 lg:focus-within:opacity-100 lg:pointer-coarse:opacity-100"
        :label="t('manuscript.chapter.new')"
        :placeholder="t('manuscript.chapter.titlePlaceholder')"
        :create="addChapter"
      />
    </div>
  </li>
</template>
