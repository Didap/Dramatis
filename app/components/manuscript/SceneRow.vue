<script setup lang="ts">
import type { SceneStatus } from '#shared/types/domain'
import type { Scene } from '#shared/types/entities'
import { SCENE_STATUSES } from '#shared/utils/constants'
import { STATUS_TEXT, useManuscriptStructure, useOutlineContext, useRenaming, type RowActionGroup } from './Structure.vue'

/**
 * A scene in the outline or on a chapter page: handle, title in the author's voice, the leader,
 * point of view and words, the status (icon plus label) and the row menu. Game rows add the scene
 * code, the kind, the start and ending marks, the choices and "Irraggiungibile". The whole row
 * opens the editor; Alt+Up/Down moves it, F2 renames it. Below 40rem the numbers move under the title.
 * Laid out as a grid (handle | lead | title, leader and numbers | status | menu) so the synopsis can
 * take a second line under the title column without pushing the leader or the numbers.
 */
const props = withDefaults(defineProps<{
  scene: Scene
  /** line: the synopsis as one quiet line when "Sinossi" is on; edit: always shown and editable. */
  synopsis?: 'line' | 'edit'
}>(), { synopsis: 'line' })

const { t } = useI18n()
const store = useProjectStore()
const { label } = useEnums()
const { words } = useFormat()
const structure = useManuscriptStructure()
const context = useOutlineContext()
const renaming = useRenaming()
const moveOpen = ref(false)
const renameInput = ref<{ $el?: HTMLInputElement } | null>(null)
const draft = ref('')

const id = computed(() => props.scene.id)
const title = computed(() => structure.sceneTitle(props.scene))
const untitled = computed(() => !props.scene.title.trim())
const editorPath = computed(() => store.refPath({ type: 'scene', id: id.value }))
const isRenaming = computed(() => renaming.value === id.value)

const showCode = computed(() => store.modules.branching || store.modules.script)
const showKind = computed(() => store.modules.scene_kinds)
const kindIcon = computed(() => SCENE_KIND_ICONS[props.scene.kind] ?? SCENE_KIND_ICONS.scene!)
const kindLabel = computed(() => label('sceneKind', props.scene.kind))
const isStart = computed(() => store.modules.branching && store.project?.startSceneId === id.value)
const isEnding = computed(() => store.modules.branching && props.scene.ending)
const unreachable = computed(() => store.modules.branching && context.unreachable.value.has(id.value))
const choices = computed(() => (store.modules.branching ? context.choices.value.get(id.value) ?? 0 : 0))
const pov = computed(() => store.get('characters', props.scene.povCharacterId))
const showPov = computed(() => !!pov.value && context.columns.value.pov)
// An empty column between two figures keeps them in line; one before them is left out, so the
// leader runs on from the title to the first figure.
const holdChoices = computed(() => !choices.value && context.columns.value.choices && showPov.value)
const statusLabel = computed(() => label('sceneStatus', props.scene.status))
const showSynopsisLine = computed(() => props.synopsis === 'line' && context.showSynopsis.value && !!props.scene.synopsis.trim())
const selecting = computed(() => context.selected.value.length > 0)
const isSelected = computed(() => context.selected.value.includes(id.value))
const phone = useMediaQuery('(max-width: 639.98px)')
const touch = useMediaQuery('(pointer: coarse)')

function toggleSelected(event?: MouseEvent | KeyboardEvent) {
  context.select(id.value, { range: !!event?.shiftKey })
}

/**
 * While scenes are selected on a phone or a touch screen, a tap on the row ticks the scene instead
 * of opening it (the selection bar has the way out). Caught on the way down, before the link navigates.
 */
function onRowClick(event: MouseEvent) {
  if (!selecting.value || !(phone.value || touch.value)) return
  if ((event.target as HTMLElement).closest('button, input, textarea')) return
  event.preventDefault()
  event.stopPropagation()
  toggleSelected(event)
}

function startRename() {
  draft.value = props.scene.title
  renaming.value = id.value
}

watch(isRenaming, (on) => {
  if (!on) return
  draft.value = props.scene.title
  void nextTick(() => {
    const input = renameInput.value?.$el
    input?.focus()
    input?.select()
  })
}, { immediate: true })

async function finishRename(value: string) {
  if (renaming.value !== id.value) return
  renaming.value = null
  structure.focusRow('scene', id.value)
  await structure.rename('scene', id.value, value)
}

function onKeydown(event: KeyboardEvent) {
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    void structure.step('scene', id.value, event.key === 'ArrowUp' ? -1 : 1)
  }
  else if (event.key === 'F2') {
    event.preventDefault()
    startRename()
  }
  else if (event.key === ' ' && selecting.value) {
    event.preventDefault()
    toggleSelected(event)
  }
}

async function createNext(where: 'before' | 'after') {
  const scene = await structure.createScene(where === 'before' ? { before: id.value } : { after: id.value }).catch(() => null)
  if (scene) renaming.value = scene.id
}

async function duplicate() {
  const copy = await structure.duplicateScene(id.value)
  if (copy) renaming.value = copy.id
}

function onSynopsis(value: string) {
  store.patchSoon('scenes', id.value, { synopsis: value.slice(0, 500) })
}

const menu = computed<RowActionGroup[]>(() => [
  {
    key: 'open',
    actions: [
      { key: 'open', label: t('manuscript.scene.open'), icon: 'i-lucide-square-pen', onSelect: () => { void navigateTo(editorPath.value) } },
      { key: 'rename', label: t('manuscript.actions.rename'), icon: 'i-lucide-text-cursor-input', kbds: ['F2'], onSelect: startRename },
    ],
  },
  {
    key: 'status',
    submenu: { label: t('manuscript.actions.status'), icon: statusIcon('scene', props.scene.status) },
    actions: SCENE_STATUSES.map(key => ({
      key,
      label: label('sceneStatus', key),
      icon: statusIcon('scene', key),
      iconClass: STATUS_TEXT[key],
      checked: props.scene.status === key,
      onSelect: () => { void structure.setStatus(id.value, key as SceneStatus) },
    })),
  },
  {
    key: 'move',
    actions: [
      { key: 'move', label: t('manuscript.actions.moveMenu'), icon: 'i-lucide-move-vertical', onSelect: () => { moveOpen.value = true } },
      { key: 'up', label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', kbds: ['alt', 'arrowup'], disabled: !structure.canStep('scene', id.value, -1), onSelect: () => { void structure.step('scene', id.value, -1) } },
      { key: 'down', label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', kbds: ['alt', 'arrowdown'], disabled: !structure.canStep('scene', id.value, 1), onSelect: () => { void structure.step('scene', id.value, 1) } },
    ],
  },
  {
    key: 'create',
    actions: [
      // The first scene of a chapter can get one before it; every other place is "after" a scene.
      ...(structure.isFirst('scene', id.value) ? [{ key: 'before', label: t('manuscript.scene.newBefore'), icon: 'i-lucide-arrow-up-to-line', onSelect: () => { void createNext('before') } }] : []),
      { key: 'after', label: t('manuscript.scene.newAfter'), icon: 'i-lucide-plus', onSelect: () => { void createNext('after') } },
      { key: 'duplicate', label: t('manuscript.scene.duplicate'), icon: 'i-lucide-copy', onSelect: () => { void duplicate() } },
      {
        key: 'select',
        label: t(isSelected.value ? 'manuscript.actions.deselect' : 'manuscript.actions.select'),
        icon: isSelected.value ? 'i-lucide-square-minus' : 'i-lucide-square-check',
        onSelect: () => toggleSelected(),
      },
    ],
  },
  {
    key: 'trash',
    actions: [{ key: 'trash', label: t('manuscript.scene.trash'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void structure.trash('scene', id.value) } }],
  },
])
</script>

<template>
  <li
    class="manuscript-scene group relative grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-1 rounded-[calc(var(--ui-radius)*2)] py-0.5 pe-0.5 transition-colors duration-150 hover:bg-elevated has-[[data-row]:focus-visible]:bg-elevated sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto]"
    :class="isSelected ? 'bg-elevated' : ''"
    :data-id="scene.id"
    @click.capture="onRowClick"
  >
    <!-- Selection: in the left margin on wide screens (on hover, or always while selecting). -->
    <button
      type="button"
      role="checkbox"
      :aria-checked="isSelected"
      :aria-label="t('manuscript.actions.selectScene', { title })"
      :tabindex="selecting ? 0 : -1"
      class="absolute -start-6 top-[1.125rem] z-[2] hidden size-6 -translate-y-1/2 place-items-center rounded-[calc(var(--ui-radius)*1.5)] outline-none transition-opacity duration-150 sm:grid"
      :class="selecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'"
      @click="toggleSelected"
    >
      <UIcon :name="isSelected ? 'i-lucide-square-check' : 'i-lucide-square'" class="size-4" :class="isSelected ? 'text-primary' : 'text-dimmed'" />
    </button>
    <ManuscriptMoveMenu v-model:open="moveOpen" kind="scene" :id="scene.id" :title="title" />

    <span class="flex shrink-0 items-center gap-1">
      <!-- Desktop: code and kind lead the row, like line numbers in a critical edition. -->
      <span v-if="showCode" class="hidden w-10 font-mono text-xs text-dimmed sm:inline" :title="t('manuscript.scene.code', { code: scene.code })">{{ scene.code }}</span>
      <UTooltip v-if="showKind" :text="kindLabel">
        <span class="relative z-[2] hidden sm:inline-flex">
          <UIcon :name="kindIcon" class="size-4 text-muted" />
          <span class="sr-only">{{ t('manuscript.scene.kind', { kind: kindLabel }) }}</span>
        </span>
      </UTooltip>
      <!-- Phone: the status glyph leads (its label is on the second line), or the tick while selecting. -->
      <button
        v-if="selecting"
        type="button"
        role="checkbox"
        :aria-checked="isSelected"
        :aria-label="t('manuscript.actions.selectScene', { title })"
        class="relative z-[2] -m-3 grid size-11 place-items-center sm:hidden"
        @click="toggleSelected"
      >
        <UIcon :name="isSelected ? 'i-lucide-square-check' : 'i-lucide-square'" class="size-5" :class="isSelected ? 'text-primary' : 'text-dimmed'" />
      </button>
      <UIcon v-else :name="statusIcon('scene', scene.status)" class="size-4 sm:hidden" :class="STATUS_TEXT[scene.status]" aria-hidden="true" />
    </span>

    <div class="flex min-w-0 flex-col py-1.5 ps-1 sm:flex-row sm:items-baseline sm:gap-3 sm:py-1">
      <div class="flex min-w-0 items-baseline gap-2">
        <DInlineText
          v-if="isRenaming"
          ref="renameInput"
          :model-value="draft"
          :placeholder="t('manuscript.scene.titlePlaceholder')"
          :aria-label="t('manuscript.actions.rename')"
          class="voice-author relative z-[2] font-medium"
          @update:model-value="draft = $event"
          @commit="finishRename"
        />
        <ManuscriptRowLink
          v-else
          :to="editorPath"
          :row="`scene:${scene.id}`"
          class="voice-author min-w-0 truncate font-medium"
          :class="untitled ? 'italic text-muted' : 'text-highlighted'"
          @keydown="onKeydown"
        >
          {{ title }}<span class="sr-only">, {{ statusLabel }}, {{ words(scene.wordCount) }}</span>
        </ManuscriptRowLink>
        <span v-if="isStart || isEnding || unreachable" class="hidden shrink-0 items-center gap-2 sm:inline-flex">
          <ManuscriptSceneMarks :start="isStart" :ending="isEnding" :ending-label="scene.endingLabel" :unreachable="unreachable" />
        </span>
      </div>

      <DLeader class="hidden sm:block" />

      <!-- The numbers: under the title on a phone; from 40rem in columns that line up from row to row. -->
      <div class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted sm:shrink-0 sm:flex-nowrap sm:items-baseline sm:gap-x-3 sm:text-sm">
        <span class="text-toned sm:hidden">{{ statusLabel }}</span>
        <span v-if="isStart || isEnding || unreachable" class="inline-flex items-center gap-2 sm:hidden">
          <ManuscriptSceneMarks :start="isStart" :ending="isEnding" :ending-label="scene.endingLabel" :unreachable="unreachable" />
        </span>
        <span v-if="showCode" class="font-mono sm:hidden">{{ scene.code }}</span>
        <span v-if="showKind" class="inline-flex items-center gap-1 sm:hidden">
          <UIcon :name="kindIcon" class="size-3.5" aria-hidden="true" />{{ kindLabel }}
        </span>
        <span v-if="showPov && pov" class="inline-flex min-w-0 items-center gap-1.5 sm:w-36">
          <DColorDot :color="pov.color" size="xs" />
          <span class="sr-only">{{ t('manuscript.scene.pov', { name: pov.name }) }}</span>
          <span class="voice-author truncate" aria-hidden="true">{{ pov.name }}</span>
        </span>
        <span v-if="choices" class="inline-flex items-center gap-1 whitespace-nowrap sm:w-24 sm:justify-end">
          <UIcon name="i-lucide-split" class="size-3.5" aria-hidden="true" /><ManuscriptFigures :text="t('manuscript.units.choices', { n: choices }, choices)" />
        </span>
        <span v-else-if="holdChoices" class="hidden sm:inline-block sm:w-24" aria-hidden="true">&#8203;</span>
        <ManuscriptFigures class="whitespace-nowrap sm:w-24 sm:text-end" :class="scene.wordCount ? '' : 'text-dimmed'" :text="words(scene.wordCount)" />
      </div>
    </div>

    <!-- The status: changed in place from 1024px; in between, the row menu (a drawer) has it. -->
    <span class="hidden w-[7.25rem] items-center gap-1.5 px-1.5 sm:inline-flex lg:hidden" aria-hidden="true">
      <UIcon :name="statusIcon('scene', scene.status)" class="size-4 shrink-0" :class="STATUS_TEXT[scene.status]" />
      <span class="truncate text-sm text-toned">{{ statusLabel }}</span>
    </span>
    <ManuscriptStatusMenu class="hidden lg:inline-flex" :status="scene.status" :title="title" @change="structure.setStatus(scene.id, $event)" />
    <ManuscriptRowMenu :groups="menu" :label="t('manuscript.scene.menu', { title })" />

    <p v-if="showSynopsisLine" class="voice-author col-start-3 -mt-1.5 truncate ps-1 pb-1 text-sm text-muted italic">{{ scene.synopsis }}</p>
    <div v-if="synopsis === 'edit'" class="relative z-[2] col-start-3 -mt-1 pb-1.5 ps-1 sm:col-end-5 sm:pe-2">
      <DInlineText
        :model-value="scene.synopsis"
        multiline
        :maxlength="500"
        :placeholder="t('manuscript.scene.synopsisPlaceholder')"
        :aria-label="t('manuscript.scene.synopsisLabel', { title })"
        variant="small"
        class="voice-author text-muted"
        @update:model-value="onSynopsis"
      />
    </div>
  </li>
</template>
