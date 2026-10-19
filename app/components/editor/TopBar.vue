<script lang="ts">
export type EditorPanel = 'details' | 'revisions' | 'find'
</script>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { SceneStatus } from '#shared/types/domain'

/**
 * The editor's top bar (DESIGN.md "Scene editor"): back to the manuscript, where the scene is, and the
 * tools: typography, find, revisions, details, focus, the menu. It fades while the author types.
 */
const props = defineProps<{
  sceneId: string
  panel: EditorPanel | null
  /** The scene title has scrolled away: the bar shows it. */
  showTitle: boolean
  /** Items of the ⋯ menu (move, trash...). */
  menu: DropdownMenuItem[][]
  defaultSize: number
  defaultLineHeight: number
}>()

const emit = defineEmits<{
  panel: [panel: EditorPanel]
  focus: []
}>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label, options } = useEnums()
const { macOS } = useKbd()

const scene = computed(() => store.get('scenes', props.sceneId))
const chapter = computed(() => store.get('chapters', scene.value?.chapterId))
const chapterLabel = computed(() => chapter.value?.title || `${term('chapter')} ${store.chapterNumber(chapter.value?.id ?? '')}`)
const manuscriptPath = computed(() => `/p/${store.projectId}/manuscript`)

function setStatus(status: string) {
  void store.update('scenes', props.sceneId, { status: status as SceneStatus }).catch(() => {})
}

/** Between lg and xl the status is an icon with its name in the tooltip and the menu (spec 4.5). */
const statusText = computed(() => (scene.value ? t('editor.bar.status', { status: label('sceneStatus', scene.value.status) }) : ''))
const statusItems = computed(() => [options('sceneStatus').map(option => ({
  label: option.label,
  icon: statusIcon('scene', option.value),
  type: 'checkbox' as const,
  checked: option.value === scene.value?.status,
  onSelect: () => setStatus(option.value),
}))])

const tools = computed(() => [
  { key: 'find' as const, icon: 'i-lucide-search', label: t('editor.bar.find'), kbds: ['meta', 'f'] },
  { key: 'revisions' as const, icon: 'i-lucide-history', label: term('revision', 2), kbds: [] as string[] },
  // ⌘J on a Mac; elsewhere Ctrl+J belongs to the browser, so Alt+Enter.
  { key: 'details' as const, icon: 'i-lucide-panel-right', label: t('editor.bar.details'), kbds: macOS.value ? ['meta', 'j'] : ['alt', 'enter'] },
])
</script>

<template>
  <div class="d-top-bar flex h-12 items-center gap-1 px-2 sm:px-3">
    <UTooltip :text="t('editor.bar.back', { where: term('manuscript').toLocaleLowerCase() })">
      <UButton :to="manuscriptPath" icon="i-lucide-arrow-left" :aria-label="t('editor.bar.back', { where: term('manuscript').toLocaleLowerCase() })" class="d-fade" />
    </UTooltip>
    <nav class="d-fade min-w-0 flex-1 truncate text-sm" :aria-label="t('editor.bar.breadcrumb')">
      <NuxtLink :to="manuscriptPath" class="text-muted hover:text-highlighted">{{ term('manuscript') }}</NuxtLink>
      <span class="px-1.5 text-dimmed" aria-hidden="true">/</span>
      <NuxtLink v-if="chapter" :to="store.refPath({ type: 'chapter', id: chapter.id })" class="voice-author text-muted hover:text-highlighted">{{ chapterLabel }}</NuxtLink>
      <template v-if="showTitle && scene">
        <span class="px-1.5 text-dimmed" aria-hidden="true">/</span>
        <span class="voice-author font-semibold text-highlighted">{{ scene.title || t('common.untitled.scene') }}</span>
      </template>
    </nav>

    <div class="d-fade flex shrink-0 items-center gap-0.5">
      <DStatusSelect
        v-if="scene"
        :model-value="scene.status"
        size="sm"
        class="me-1 hidden xl:flex"
        @update:model-value="setStatus"
      />
      <UDropdownMenu v-if="scene" :items="statusItems" :content="{ align: 'end' }" class="xl:hidden">
        <UTooltip :text="statusText">
          <UButton :aria-label="statusText" class="xl:hidden">
            <UIcon :name="statusIcon('scene', scene.status)" class="size-5" :style="{ color: `var(--status-${scene.status})` }" aria-hidden="true" />
          </UButton>
        </UTooltip>
      </UDropdownMenu>
      <UPopover :content="{ align: 'end', sideOffset: 6 }">
        <UTooltip :text="t('editor.bar.typography')">
          <UButton :aria-label="t('editor.bar.typography')" class="voice-author min-w-9 justify-center text-[0.9375rem] font-semibold">Aa</UButton>
        </UTooltip>
        <template #content>
          <EditorTypographyMenu :default-size="defaultSize" :default-line-height="defaultLineHeight" />
        </template>
      </UPopover>
      <UTooltip v-for="tool in tools" :key="tool.key" :text="tool.label" :kbds="tool.kbds">
        <UButton
          :icon="tool.icon"
          :aria-label="tool.label"
          :aria-pressed="panel === tool.key"
          :color="panel === tool.key ? 'primary' : 'neutral'"
          :variant="panel === tool.key ? 'soft' : 'ghost'"
          @click="emit('panel', tool.key)"
        />
      </UTooltip>
      <UTooltip :text="t('editor.bar.focus')" :kbds="['meta', 'shift', 'enter']">
        <UButton icon="i-lucide-maximize-2" :aria-label="t('editor.bar.focus')" @click="emit('focus')" />
      </UTooltip>
      <UDropdownMenu :items="menu" :content="{ align: 'end' }">
        <UButton icon="i-lucide-ellipsis" :aria-label="t('editor.bar.more')" />
      </UDropdownMenu>
    </div>
  </div>
</template>
