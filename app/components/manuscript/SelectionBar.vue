<script setup lang="ts">
import type { SceneStatus } from '#shared/types/domain'
import { SCENE_STATUSES } from '#shared/utils/constants'
import { STATUS_TEXT, focusRowKey, neighbourRow, useManuscriptStructure, useOutlineContext, type RowActionGroup } from './Structure.vue'

/**
 * The scenes ticked in the outline or on a chapter page, acted on together: set their status, move
 * them into a chapter (they keep their reading order), move them to the trash. Floats at the foot of
 * the list while something is selected; Esc or the cross clears the selection. When the bar goes,
 * the keyboard focus goes back to a row instead of falling to the page.
 */
const { t } = useI18n()
const { label } = useEnums()
const store = useProjectStore()
const context = useOutlineContext()
const structure = useManuscriptStructure()
const phone = useMediaQuery('(max-width: 1023.98px)')
const touch = useMediaQuery('(pointer: coarse)')
const moveOpen = ref(false)
const bar = ref<HTMLElement | null>(null)

const count = computed(() => context.selected.value.length)
const ids = () => [...context.selected.value]
const keys = (list: readonly string[]) => list.map(id => `scene:${id}`)

const statusGroups = computed<RowActionGroup[]>(() => [{
  key: 'status',
  actions: SCENE_STATUSES.map(key => ({
    key,
    label: label('sceneStatus', key),
    icon: statusIcon('scene', key),
    iconClass: STATUS_TEXT[key],
    onSelect: () => { void structure.setStatusMany(ids(), key as SceneStatus) },
  })),
}])

/** The chapter every selected scene is in, if they share one: it is not offered as a destination. */
const here = computed(() => {
  const chapters = new Set(context.selected.value.map(id => store.get('scenes', id)?.chapterId))
  return chapters.size === 1 ? [...chapters][0] : undefined
})

const targets = computed(() => structure.chapterTargets((chapterId) => {
  moveOpen.value = false
  void move(chapterId)
}, here.value))

/** The focus is in the bar, or nowhere: it must not go down with the bar. */
const focusInBar = () => {
  const active = document.activeElement
  return !active || active === document.body || !!bar.value?.contains(active)
}

async function move(chapterId: string) {
  const list = ids()
  // On a chapter page the scenes leave with the move, and the bar with them.
  const fallback = neighbourRow(keys(list))
  const done = structure.moveScenesInto(list, chapterId)
  await nextTick()
  if (!count.value && fallback) focusRowKey(fallback)
  await done
}

function trash() {
  const list = ids()
  const fallback = neighbourRow(keys(list))
  context.selected.value = []
  void structure.trashMany(list)
  if (fallback) focusRowKey(fallback)
}

function clear() {
  const last = context.selected.value.at(-1)
  const lost = focusInBar()
  context.selected.value = []
  if (lost && last) focusRowKey(`scene:${last}`)
}

useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !count.value || event.defaultPrevented || moveOpen.value) return
  // Esc in a field, a menu or a drawer closes that, not the selection.
  if ((event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"], [role="listbox"]')) return
  clear()
})
</script>

<template>
  <div v-if="count" class="pointer-events-none sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mt-6 flex justify-center lg:bottom-6">
    <div
      ref="bar"
      role="region"
      :aria-label="t('manuscript.actions.selected', { n: count }, count)"
      class="pointer-events-auto flex max-w-full items-center gap-0.5 rounded-[6px] bg-(--ui-bg-floating) p-1.5 shadow-(--shadow-floating) ring-1 ring-default sm:gap-1"
    >
      <span class="px-2 text-sm font-medium whitespace-nowrap text-highlighted" aria-live="polite">{{ t('manuscript.actions.selected', { n: count }, count) }}</span>
      <ManuscriptRowMenu :groups="statusGroups" :label="t('manuscript.actions.statusMany', { n: count }, count)" side="top" :quiet="false">
        <template #trigger>
          <UButton color="neutral" variant="ghost" icon="i-lucide-list-checks" class="max-lg:min-h-11" :aria-label="t('manuscript.actions.statusMany', { n: count }, count)">
            <span class="max-sm:sr-only">{{ t('manuscript.actions.status') }}</span>
          </UButton>
        </template>
      </ManuscriptRowMenu>
      <UDrawer v-if="phone" v-model:open="moveOpen" :title="t('manuscript.actions.moveInto')" :ui="{ body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }">
        <UButton color="neutral" variant="ghost" icon="i-lucide-move-vertical" class="min-h-11">
          <span class="max-sm:sr-only">{{ t('manuscript.actions.moveInto') }}</span>
        </UButton>
        <template #body>
          <UCommandPalette :groups="targets" :placeholder="t('manuscript.actions.searchChapter')" :autofocus="!touch" :close="false" class="max-h-[60dvh]" :ui="{ input: '[&_input]:text-base', itemLabelPrefix: 'tabular text-dimmed', itemLabelBase: 'voice-author', itemLabelSuffix: 'text-xs text-dimmed' }" />
        </template>
      </UDrawer>
      <UPopover v-else v-model:open="moveOpen" :content="{ side: 'top', align: 'center' }">
        <UButton color="neutral" variant="ghost" icon="i-lucide-move-vertical" :label="t('manuscript.actions.moveInto')" />
        <template #content>
          <UCommandPalette :groups="targets" :placeholder="t('manuscript.actions.searchChapter')" :close="false" class="max-h-80 w-80" :ui="{ itemLabelPrefix: 'tabular text-dimmed', itemLabelBase: 'voice-author', itemLabelSuffix: 'text-xs text-dimmed' }" />
        </template>
      </UPopover>
      <UButton color="error" variant="ghost" icon="i-lucide-trash-2" :aria-label="t('manuscript.actions.trashMany', { n: count }, count)" class="max-lg:size-11 max-lg:justify-center" @click="trash" />
      <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('manuscript.actions.clearSelection')" class="max-lg:size-11 max-lg:justify-center" @click="clear" />
    </div>
  </div>
</template>
