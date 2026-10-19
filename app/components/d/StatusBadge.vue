<script setup lang="ts">
import type { PlanningStatus, SceneStatus } from '#shared/types/domain'

/** A status shown as icon + label (never colour alone). */
const props = withDefaults(defineProps<{
  value: SceneStatus | PlanningStatus | string
  kind?: 'scene' | 'planning'
  /** Icon only, with the label for screen readers and as tooltip. */
  compact?: boolean
}>(), { kind: 'scene', compact: false })

const { label } = useEnums()
const text = computed(() => label(props.kind === 'scene' ? 'sceneStatus' : 'planningStatus', props.value))
const icon = computed(() => statusIcon(props.kind, props.value))
</script>

<template>
  <UTooltip v-if="compact" :text="text">
    <span class="inline-flex items-center" :style="{ color: `var(--status-${value})` }">
      <UIcon :name="icon" class="size-4" />
      <span class="sr-only">{{ text }}</span>
    </span>
  </UTooltip>
  <span v-else class="inline-flex items-center gap-1.5 text-sm text-toned">
    <UIcon :name="icon" class="size-4 shrink-0" :style="{ color: `var(--status-${value})` }" />
    {{ text }}
  </span>
</template>
