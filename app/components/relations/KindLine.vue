<script lang="ts">
import type { RelationKind } from '#shared/types/domain'
import { RELATION_KIND_COLORS, RELATION_KIND_DASH } from '#shared/utils/constants'

/** The colour of a relation kind, as a CSS value (it follows the theme). */
export function kindColor(kind: RelationKind): string {
  return `var(--entity-${RELATION_KIND_COLORS[kind]})`
}

/**
 * The stroke of a relation kind (DESIGN.md "Relationship map"): bonds solid, work long dashes,
 * conflict short dashes, belonging dotted. Dots are drawn as round caps on zero-length dashes,
 * so they stay round at any width.
 */
export function kindStroke(kind: RelationKind): { dasharray?: string, linecap: 'butt' | 'round' } {
  const dash = RELATION_KIND_DASH[kind]
  if (dash === '1 3') return { dasharray: '0 4', linecap: 'round' }
  return { dasharray: dash, linecap: 'butt' }
}
</script>

<script setup lang="ts">
/** A sample of a relation kind's line, as drawn on the map. Decorative: the kind's name sits next to it. */
const props = withDefaults(defineProps<{ kind: RelationKind, width?: number }>(), { width: 20 })
const stroke = computed(() => kindStroke(props.kind))
</script>

<template>
  <svg :width="width" height="8" :viewBox="`0 0 ${width} 8`" class="shrink-0 overflow-visible" aria-hidden="true">
    <line
      x1="1"
      y1="4"
      :x2="width - 1"
      y2="4"
      :style="{ stroke: kindColor(kind) }"
      stroke-width="2"
      :stroke-dasharray="stroke.dasharray"
      :stroke-linecap="stroke.linecap"
    />
  </svg>
</template>
