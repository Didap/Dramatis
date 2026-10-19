<script lang="ts">
export interface SceneNodeData {
  sceneId: string
  start: boolean
  unreachable: boolean
  /** Faded by the legend's filters. */
  dim: boolean
  quests: { id: string, name: string, color: string }[]
  connectable: boolean
}
</script>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { TARGET_HANDLE } from './GraphEdge.vue'

/**
 * A scene on the flow graph (DESIGN.md "Game flow graph"): 13.5rem, 1px border, 6px radius; kind icon
 * and title, then status, quest dots and words. The start scene carries the "Inizio" tab, the one
 * solid control on the canvas; endings a flag and a double rule; unreachable scenes a dashed warning border.
 */
const props = defineProps<{ id: string, data: SceneNodeData, selected?: boolean }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const { number } = useFormat()

const scene = computed(() => store.get('scenes', props.data.sceneId))
const choices = computed(() => store.rows.links.filter(l => l.fromSceneId === props.data.sceneId).length)

const frame = computed(() => {
  if (scene.value?.ending) return 'border-[3px] border-double border-(--ui-border-accented)'
  if (props.data.unreachable) return 'border border-dashed border-warning'
  return 'border border-(--ui-border-accented)'
})
</script>

<template>
  <div
    v-if="scene"
    class="flow-node relative w-[13.5rem] rounded-[6px] bg-default px-3 pt-2 pb-2.5 text-start transition-opacity duration-150"
    :class="[frame, selected ? 'ring-2 ring-(--ui-primary) ring-offset-2 ring-offset-(--ui-bg)' : '', data.dim ? 'opacity-30' : '']"
  >
    <span
      v-if="data.start"
      class="absolute -top-[1.375rem] start-2 inline-flex h-[1.375rem] items-center gap-1 rounded-t-[4.5px] bg-primary px-2 text-xs font-medium text-inverted"
    >
      <UIcon name="i-lucide-play" class="size-3" />
      {{ t('flow.node.start') }}
    </span>

    <div class="flex items-center gap-1.5 text-xs text-dimmed">
      <UIcon v-if="store.modules.scene_kinds" :name="SCENE_KIND_ICONS[scene.kind] ?? 'i-lucide-file-text'" class="size-3.5 shrink-0" :aria-label="label('sceneKind', scene.kind)" />
      <span class="font-mono">{{ scene.code }}</span>
      <span class="flex-1" />
      <span v-if="choices" class="tabular inline-flex items-center gap-0.5" :title="t('flow.node.choices', { n: choices }, choices)">
        <UIcon name="i-lucide-split" class="size-3.5" />{{ choices }}
      </span>
    </div>

    <p class="voice-author mt-0.5 line-clamp-2 text-[0.9375rem] leading-snug font-semibold text-highlighted">
      {{ scene.title || t('common.untitled.scene') }}
    </p>

    <div class="mt-1.5 flex items-center gap-2 text-xs text-muted">
      <span class="inline-flex min-w-0 items-center gap-1">
        <UIcon :name="statusIcon('scene', scene.status)" class="size-3.5 shrink-0" :style="{ color: `var(--status-${scene.status})` }" />
        <span class="truncate">{{ label('sceneStatus', scene.status) }}</span>
      </span>
      <span v-if="data.quests.length" class="inline-flex items-center gap-0.5">
        <span
          v-for="quest in data.quests"
          :key="quest.id"
          class="size-2 rounded-full"
          :style="{ background: `var(--entity-${quest.color || 'slate'})` }"
          :title="quest.name"
        />
        <span class="sr-only">{{ data.quests.map(q => q.name).join(', ') }}</span>
      </span>
      <span class="flex-1" />
      <span class="tabular shrink-0">{{ number(scene.wordCount) }}</span>
    </div>

    <p v-if="scene.ending" class="mt-1.5 flex items-center gap-1 text-xs font-medium text-toned">
      <UIcon name="i-lucide-flag" class="size-3.5 shrink-0" />
      <span class="truncate">{{ scene.endingLabel ? t('flow.node.endingNamed', { label: scene.endingLabel }) : term('ending') }}</span>
    </p>
    <p v-if="data.unreachable" class="mt-1.5 flex items-center gap-1 text-xs font-medium text-warning">
      <UIcon name="i-lucide-unlink" class="size-3.5 shrink-0" />
      {{ t('flow.node.unreachable') }}
    </p>

    <!-- Edges come in from the left (forward) or from above (from a scene behind or in the same column,
         where the right side holds the scene's own choices); the continuation down the column leaves from the bottom. -->
    <Handle id="in" type="target" :position="Position.Left" :connectable="data.connectable" class="flow-handle flow-handle--hidden" />
    <Handle id="in-top" type="target" :position="Position.Top" :connectable="false" class="flow-handle flow-handle--hidden" />
    <Handle id="in-back" type="target" :position="Position.Top" :connectable="false" class="flow-handle flow-handle--hidden" :style="{ left: `${TARGET_HANDLE * 100}%` }" />
    <Handle id="out-bottom" type="source" :position="Position.Bottom" :connectable="false" class="flow-handle flow-handle--hidden" />
    <Handle id="out" type="source" :position="Position.Right" :connectable="data.connectable" class="flow-handle flow-handle--source" :title="t('flow.graph.dragToLink')" />
  </div>
</template>

<style>
.flow-handle.vue-flow__handle {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 9999px;
  border: 1px solid var(--ui-border-accented);
  background: var(--ui-bg);
  transition: background-color 150ms var(--ease-out-expo), transform 150ms var(--ease-out-expo);
}
.flow-handle--hidden.vue-flow__handle {
  opacity: 0;
}
.flow-handle--source.vue-flow__handle.connectable {
  cursor: crosshair;
}
.vue-flow__node:hover .flow-handle--source.vue-flow__handle.connectable,
.flow-handle--source.vue-flow__handle.connecting {
  background: var(--ui-primary);
  border-color: var(--ui-primary);
  transform: translate(50%, -50%) scale(1.25);
}
.flow-handle--source.vue-flow__handle:not(.connectable) {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .flow-handle.vue-flow__handle { transition: none; }
}
</style>
