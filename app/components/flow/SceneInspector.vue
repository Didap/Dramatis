<script setup lang="ts">
/**
 * One scene seen from the flow: where it sits, its status, whether it starts or ends the story, and
 * its choices in and out. The graph's side panel on desktop, the drawer of a tapped scene on the phone.
 */
const props = withDefaults(defineProps<{ sceneId: string, nested?: boolean }>(), { nested: false })

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const { words } = useFormat()
const { analysis } = useFlow()

const scene = computed(() => store.get('scenes', props.sceneId))
const chapter = computed(() => (scene.value ? store.get('chapters', scene.value.chapterId) : undefined))

/** ATTO 1 · CAPITOLO 3 · SCENA 2 (the position line, DESIGN.md). */
const position = computed(() => {
  if (!scene.value || !chapter.value) return ''
  const parts: string[] = []
  if (chapter.value.partId) {
    const n = store.orderedParts.findIndex(p => p.id === chapter.value!.partId) + 1
    if (n > 0) parts.push(`${term('part')} ${n}`)
  }
  parts.push(`${term('chapter')} ${store.chapterNumber(chapter.value.id)}`)
  parts.push(`${term('scene')} ${store.chapterScenes(chapter.value.id).findIndex(s => s.id === props.sceneId) + 1}`)
  return parts.join(' · ')
})

const isStart = computed(() => store.project?.startSceneId === props.sceneId)
const unreachable = computed(() => !!analysis.value?.hasStart && !analysis.value.reachable.has(props.sceneId))

function setStart(value: boolean) {
  store.updateProject({ startSceneId: value ? props.sceneId : null }).catch(() => {})
}
function setEnding(value: boolean) {
  store.update('scenes', props.sceneId, { ending: value }).catch(() => {})
}
function setEndingLabel(value: string) {
  store.patchSoon('scenes', props.sceneId, { endingLabel: value.slice(0, 120) })
}

/** On a phone the label of a switch is a 44px row, the switch centred on it. */
const touchRow = { container: 'max-lg:h-11', label: 'max-lg:flex max-lg:min-h-11 max-lg:items-center' }

const titleId = useId()
defineExpose({ focusTitle: () => document.getElementById(titleId)?.focus() })
</script>

<template>
  <div v-if="scene" class="space-y-5">
    <header class="space-y-2">
      <p class="position-line">{{ position }}</p>
      <h2 :id="titleId" tabindex="-1" class="voice-author text-xl font-semibold text-highlighted text-balance outline-none">
        {{ scene.title || t('common.untitled.scene') }}
      </h2>
      <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span class="font-mono text-xs text-dimmed">{{ scene.code }}</span>
        <span v-if="store.modules.scene_kinds" class="inline-flex items-center gap-1.5">
          <UIcon :name="SCENE_KIND_ICONS[scene.kind] ?? 'i-lucide-file-text'" class="size-4 text-dimmed" />
          {{ label('sceneKind', scene.kind) }}
        </span>
        <DStatusBadge :value="scene.status" />
        <span class="tabular">{{ words(scene.wordCount) }}</span>
      </p>
      <p v-if="scene.synopsis" class="voice-author text-pretty text-sm text-toned">{{ scene.synopsis }}</p>
      <p v-if="unreachable" class="flex items-center gap-1.5 text-sm text-warning">
        <UIcon name="i-lucide-unlink" class="size-4 shrink-0" />
        {{ t('flow.node.unreachable') }}
      </p>
      <UButton
        :to="store.refPath({ type: 'scene', id: scene.id })"
        icon="i-lucide-file-pen-line"
        color="neutral"
        variant="outline"
        size="sm"
        class="max-lg:min-h-11"
        :label="t('flow.inspector.openScene')"
      />
    </header>

    <div class="space-y-3 border-t border-default pt-4">
      <USwitch
        :model-value="isStart"
        :ui="touchRow"
        :label="t('flow.inspector.start')"
        :description="isStart ? t('flow.inspector.startOn') : t('flow.inspector.startOff')"
        @update:model-value="setStart"
      />
      <USwitch
        :model-value="scene.ending"
        :ui="touchRow"
        :label="term('ending')"
        :description="t('flow.inspector.endingHelp')"
        @update:model-value="setEnding"
      />
      <UFormField v-if="scene.ending" :label="t('flow.inspector.endingLabel')" class="ps-11">
        <UInput
          :model-value="scene.endingLabel"
          :maxlength="120"
          :placeholder="t('flow.inspector.endingPlaceholder')"
          class="w-full"
          :ui="{ base: 'voice-author max-lg:h-11' }"
          @update:model-value="(v: string | number) => setEndingLabel(String(v))"
        />
      </UFormField>
    </div>

    <div class="border-t border-default pt-4">
      <FlowSceneChoices :scene-id="scene.id" :nested="nested" />
    </div>
  </div>
</template>
