<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { Chapter } from '#shared/types/entities'
import { isEmptyDoc } from '#shared/utils/richtext'
import { sortableOptions, useDragging, useManuscriptStructure, useOutlineContext, useRenaming, type RowActionGroup } from './Structure.vue'

/**
 * A chapter of the outline: its row (number, title, a mark when the purpose is empty, scenes and
 * words joined by the leader) and its scenes, which can be dragged within it and to other chapters.
 * Collapsible; the state is kept on this device.
 */
const props = defineProps<{ chapter: Chapter }>()

const { t } = useI18n()
const store = useProjectStore()
const { words, scenes: sceneCount } = useFormat()
const structure = useManuscriptStructure()
const router = useRouter()
const context = useOutlineContext()
const renaming = useRenaming()
const dragging = useDragging()
const moveOpen = ref(false)
const addRow = ref<{ start: () => void } | null>(null)
const renameInput = ref<{ $el?: HTMLInputElement } | null>(null)
const draft = ref('')

const id = computed(() => props.chapter.id)
const title = computed(() => structure.chapterTitle(props.chapter))
const untitled = computed(() => !props.chapter.title.trim())
const number = computed(() => store.chapterNumber(id.value))
const path = computed(() => store.refPath({ type: 'chapter', id: id.value }))
const all = computed(() => store.chapterScenes(id.value))
const scenes = computed(() => (context.filtering.value ? all.value.filter(context.visible) : all.value))
const sceneIds = computed(() => scenes.value.map(s => s.id))
const total = computed(() => all.value.reduce((n, s) => n + s.wordCount, 0))
const noPurpose = computed(() => isEmptyDoc(props.chapter.reason))
const collapsed = computed(() => context.collapsed.value.includes(id.value))
const isRenaming = computed(() => renaming.value === id.value)
const listId = computed(() => `manuscript-chapter-${id.value}`)

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
  draft.value = props.chapter.title
  void nextTick(() => {
    renameInput.value?.$el?.focus()
    renameInput.value?.$el?.select()
  })
}, { immediate: true })

async function finishRename(value: string) {
  if (renaming.value !== id.value) return
  renaming.value = null
  structure.focusRow('chapter', id.value)
  await structure.rename('chapter', id.value, value)
}

function onKeydown(event: KeyboardEvent) {
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    void structure.step('chapter', id.value, event.key === 'ArrowUp' ? -1 : 1)
  }
  else if (event.key === 'F2') {
    event.preventDefault()
    startRename()
  }
}

async function addScene(titleText: string) {
  // The first scene of the manuscript opens in the editor: that is where the writing happens.
  const first = !store.rows.scenes.length
  const scene = await structure.createScene({ chapterId: id.value, title: titleText })
  if (first) void router.push(store.refPath({ type: 'scene', id: scene.id }))
}

function newScene() {
  if (collapsed.value) toggle()
  void nextTick(() => addRow.value?.start())
}

async function createNext(where: 'before' | 'after') {
  const chapter = await structure.createChapter(where === 'before' ? { before: id.value } : { after: id.value }).catch(() => null)
  if (chapter) renaming.value = chapter.id
}

// ---------------------------------------------------------------- drag and drop of scenes

function onStart(event: { item: HTMLElement }) {
  const sceneId = event.item.dataset.id
  if (sceneId) dragging.value = { kind: 'scene', id: sceneId }
}

/** Both lists of a drop emit their new order; this chapter acts only when it holds the dragged scene. */
function onDrop(ids: string[]) {
  const moving = dragging.value
  if (moving?.kind !== 'scene' || !ids.includes(moving.id)) return
  void store.reorder('scenes', ids, { chapterId: id.value }).catch(() => {})
  structure.announce(t('manuscript.live.moved', { title: structure.sceneTitle(store.get('scenes', moving.id)), n: ids.indexOf(moving.id) + 1, total: ids.length, container: title.value }))
}

function onEnd() {
  dragging.value = null
}

const menu = computed<RowActionGroup[]>(() => [
  {
    key: 'open',
    actions: [
      { key: 'open', label: t('manuscript.chapter.open'), icon: 'i-lucide-book-open', onSelect: () => { void navigateTo(path.value) } },
      { key: 'read', label: t('manuscript.chapter.read'), icon: 'i-lucide-book-open-text', onSelect: () => { void navigateTo({ path: path.value, query: { view: 'read' } }) } },
      { key: 'rename', label: t('manuscript.actions.rename'), icon: 'i-lucide-text-cursor-input', kbds: ['F2'], onSelect: startRename },
    ],
  },
  {
    key: 'create',
    actions: [
      { key: 'scene', label: t('manuscript.chapter.newSceneIn'), icon: 'i-lucide-file-plus', onSelect: newScene },
      ...(structure.isFirst('chapter', id.value) ? [{ key: 'before', label: t('manuscript.chapter.newBefore'), icon: 'i-lucide-arrow-up-to-line', onSelect: () => { void createNext('before') } }] : []),
      { key: 'after', label: t('manuscript.chapter.newAfter'), icon: 'i-lucide-plus', onSelect: () => { void createNext('after') } },
    ],
  },
  {
    key: 'move',
    actions: [
      { key: 'move', label: t('manuscript.actions.moveMenu'), icon: 'i-lucide-move-vertical', onSelect: () => { moveOpen.value = true } },
      { key: 'up', label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', kbds: ['alt', 'arrowup'], disabled: !structure.canStep('chapter', id.value, -1), onSelect: () => { void structure.step('chapter', id.value, -1) } },
      { key: 'down', label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', kbds: ['alt', 'arrowdown'], disabled: !structure.canStep('chapter', id.value, 1), onSelect: () => { void structure.step('chapter', id.value, 1) } },
    ],
  },
  {
    key: 'trash',
    actions: [{ key: 'trash', label: t('manuscript.chapter.trash'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void structure.trash('chapter', id.value) } }],
  },
])
</script>

<template>
  <li class="manuscript-chapter group/chapter" :data-id="chapter.id">
    <div class="group relative flex items-center gap-1 rounded-[calc(var(--ui-radius)*2)] py-0.5 pe-0.5 transition-colors duration-150 hover:bg-elevated has-[[data-row]:focus-visible]:bg-elevated">
      <ManuscriptMoveMenu v-model:open="moveOpen" kind="chapter" :id="chapter.id" :title="title" />
      <!-- The disclosure leads the row on wide screens and closes it on a phone, next to the menu. -->
      <ManuscriptToggle class="max-sm:hidden" :collapsed="collapsed" :controls="listId" :title="title" @toggle="toggle" />
      <div class="flex min-w-0 flex-1 flex-col py-1.5 sm:flex-row sm:items-baseline sm:gap-3 sm:py-1">
        <div class="flex min-w-0 items-baseline gap-2">
          <span class="tabular w-5 shrink-0 text-end text-sm text-dimmed" aria-hidden="true">{{ number }}</span>
          <DInlineText
            v-if="isRenaming"
            ref="renameInput"
            :model-value="draft"
            :placeholder="t('manuscript.chapter.titlePlaceholder')"
            :aria-label="t('manuscript.actions.rename')"
            class="voice-author relative z-[2] text-[1.0625rem] font-semibold"
            @update:model-value="draft = $event"
            @commit="finishRename"
          />
          <component :is="structure.usesParts.value ? 'h3' : 'h2'" v-else class="min-w-0 truncate text-[1.0625rem] font-semibold">
            <ManuscriptRowLink
              :to="path"
              :row="`chapter:${chapter.id}`"
              class="voice-author"
              :class="untitled ? 'italic text-muted' : 'text-highlighted'"
              @keydown="onKeydown"
            >
              <span class="sr-only">{{ t('manuscript.position.chapter', { n: number }) }}: </span>{{ title }}<span class="sr-only">, {{ sceneCount(all.length) }}, {{ words(total) }}</span>
            </ManuscriptRowLink>
          </component>
          <span v-if="noPurpose" class="hidden shrink-0 text-xs text-dimmed italic sm:inline" :title="t('manuscript.chapter.noPurposeHint')">{{ t('manuscript.chapter.noPurpose') }}</span>
        </div>
        <DLeader class="hidden sm:block" />
        <div class="flex shrink-0 flex-wrap items-center gap-x-2.5 ps-7 text-xs text-muted sm:gap-x-3 sm:ps-0 sm:text-sm">
          <span v-if="noPurpose" class="italic text-dimmed sm:hidden">{{ t('manuscript.chapter.noPurpose') }}</span>
          <ManuscriptFigures :text="sceneCount(all.length)" />
          <ManuscriptFigures class="sm:w-24 sm:text-end" :text="words(total)" />
        </div>
      </div>
      <!-- Keeps the totals in the column of the scenes' words, left of their status. -->
      <span class="hidden w-[7.25rem] shrink-0 sm:block" aria-hidden="true" />
      <ManuscriptToggle class="sm:hidden" :collapsed="collapsed" :controls="listId" :title="title" @toggle="toggle" />
      <ManuscriptRowMenu :groups="menu" :label="t('manuscript.chapter.menu', { title })" />
    </div>

    <div v-show="!collapsed" :id="listId" class="ps-4 sm:ps-12">
      <div class="relative">
        <VueDraggable
          tag="ul"
          :model-value="sceneIds"
          :group="{ name: 'scenes' }"
          v-bind="sortableOptions('scene', !context.filtering.value)"
          class="manuscript-drop min-h-11"
          @start="onStart"
          @update:model-value="onDrop"
          @end="onEnd"
        >
          <ManuscriptSceneRow v-for="scene in scenes" :key="scene.id" :scene="scene" />
        </VueDraggable>
        <p v-if="!scenes.length" class="pointer-events-none absolute inset-0 flex min-w-0 items-center gap-3 ps-9 text-sm text-dimmed">
          <template v-if="context.filtering.value">{{ t('manuscript.filters.none') }}</template>
          <!-- An empty chapter opens straight on its sheet: no scene to invent first. -->
          <template v-else>
            <UButton class="pointer-events-auto shrink-0 max-lg:min-h-11" size="sm" color="primary" variant="soft" icon="i-lucide-pen-line" :label="t('manuscript.page.startWriting')" @click="structure.writeIn(id)" />
            <span class="truncate">{{ t('manuscript.chapter.empty') }}</span>
          </template>
        </p>
      </div>
      <ManuscriptAddRow
        v-if="!context.filtering.value"
        ref="addRow"
        class="ps-7 transition-opacity duration-150"
        :class="scenes.length && 'lg:opacity-0 lg:group-hover/chapter:opacity-100 lg:focus-within:opacity-100 lg:pointer-coarse:opacity-100'"
        :label="t('manuscript.scene.new')"
        :placeholder="t('manuscript.scene.titlePlaceholder')"
        :create="addScene"
      />
    </div>
  </li>
</template>
