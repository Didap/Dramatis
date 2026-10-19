<script lang="ts">
import type { RelationKind } from '#shared/types/domain'

/** One relationship drawn on an edge of the map. */
export interface EdgeRelation {
  id: string
  kind: RelationKind
  /** The relationship's label, or the kind's name when the label is empty. */
  text: string
  /** true when `text` is the author's label (manuscript face), false for the kind's name. */
  authored: boolean
  /** The kind's name: on the pill of an authored label it shows in the light and in the tooltip. */
  kindLabel: string
  directed: boolean
  /** The relationship reads from the edge's source to its target (where the arrow points). */
  forward: boolean
}

/** Every relationship between the same two nodes: one edge, parallel lines, stacked labels (spec 4.4). */
export interface MapEdgeData {
  relations: EdgeRelation[]
  faded: boolean
  /** In the followspot of a selected node: drawn thicker, like a selected edge. */
  lit?: boolean
  /** Just followed with the arrow keys: Enter opens it. Drawn like a selected edge. */
  focused?: boolean
  /** Where the labels sit, as a fraction of the line between the two centres (0.5 is the middle). */
  labelAt?: number
  /** Opens one relationship (a click on its label). */
  pick?: (relationId: string) => void
}
</script>

<script setup lang="ts">
import { EdgeLabelRenderer } from '@vue-flow/core'
import type { GraphNode } from '@vue-flow/core'
import { kindColor, kindStroke } from './KindLine.vue'
import { NODE_SHAPES } from './MapNode.vue'
import type { MapNodeData } from './MapNode.vue'

/**
 * An edge of the relationship map (DESIGN.md): straight, from shape to shape; 1px (2px hovered or
 * selected) in the kind's colour with its dash family; a 6px arrow on directed kinds; the label on a
 * pill at the midpoint. Parallel relationships run side by side and stack their labels.
 */
defineOptions({ inheritAttrs: false })
const props = defineProps<{
  id: string
  sourceNode: GraphNode<MapNodeData>
  targetNode: GraphNode<MapNodeData>
  data: MapEdgeData
  selected?: boolean
}>()

const GAP = 4
const ARROW = 6
const SPACING = 5

/** Distance from a node's centre to its outline, along a unit direction. */
function reach(node: GraphNode<MapNodeData>, ux: number, uy: number): number {
  const shape = NODE_SHAPES[node.data?.type ?? 'character']
  const hw = (node.dimensions.width || shape.width) / 2
  const hh = (node.dimensions.height || shape.height) / 2
  if (shape.outline === 'diamond') return 1 / (Math.abs(ux) / hw + Math.abs(uy) / hh || 1)
  return Math.min(Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity)
}

function centre(node: GraphNode<MapNodeData>) {
  const shape = NODE_SHAPES[node.data?.type ?? 'character']
  return {
    x: node.computedPosition.x + (node.dimensions.width || shape.width) / 2,
    y: node.computedPosition.y + (node.dimensions.height || shape.height) / 2,
  }
}

/**
 * Two nodes on top of each other leave no line to draw: the labels stay, beside the pair, so the
 * relationship never vanishes from the map.
 */
function besideBoth(a: { x: number, y: number }, b: { x: number, y: number }) {
  const right = (node: GraphNode<MapNodeData>, c: { x: number }) => c.x + (node.dimensions.width || NODE_SHAPES[node.data?.type ?? 'character'].width) / 2
  return {
    lines: [],
    hit: null,
    label: { x: Math.max(right(props.sourceNode, a), right(props.targetNode, b)) + 10, y: (a.y + b.y) / 2 },
    beside: true,
  }
}

const geometry = computed(() => {
  const a = centre(props.sourceNode)
  const b = centre(props.targetNode)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length < 1) return besideBoth(a, b)
  const ux = dx / length
  const uy = dy / length
  const startAt = reach(props.sourceNode, ux, uy) + GAP
  const endAt = length - reach(props.targetNode, -ux, -uy) - GAP
  if (endAt - startAt < 8) return besideBoth(a, b)
  const start = { x: a.x + ux * startAt, y: a.y + uy * startAt }
  const end = { x: a.x + ux * endAt, y: a.y + uy * endAt }
  // Perpendicular, for parallel lines.
  const px = -uy
  const py = ux
  const count = props.data.relations.length
  const lines = props.data.relations.map((relation, i) => {
    const offset = (i - (count - 1) / 2) * SPACING
    const s = { x: start.x + px * offset, y: start.y + py * offset }
    const e = { x: end.x + px * offset, y: end.y + py * offset }
    let arrow: string | null = null
    let from = s
    let to = e
    if (relation.directed) {
      // The arrow points where the relationship reads to: the line stops at the arrow's base.
      const [tip, dir] = relation.forward ? [e, 1] : [s, -1]
      const bx = tip.x - ux * ARROW * dir
      const by = tip.y - uy * ARROW * dir
      arrow = `M ${tip.x} ${tip.y} L ${bx + px * 3} ${by + py * 3} L ${bx - px * 3} ${by - py * 3} Z`
      if (relation.forward) to = { x: bx, y: by }
      else from = { x: bx, y: by }
    }
    return { relation, path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`, arrow, stroke: kindStroke(relation.kind), color: kindColor(relation.kind) }
  })
  // The labels stay on the visible part of the line, wherever the map put them.
  const at = Math.min(Math.max((props.data.labelAt ?? 0.5) * length, startAt), endAt)
  return {
    lines,
    hit: `M ${start.x} ${start.y} L ${end.x} ${end.y}` as string | null,
    label: { x: a.x + ux * at, y: a.y + uy * at },
    beside: false,
  }
})

/** One pill per relationship, with its colour, whether or not a line can be drawn. */
const pills = computed(() => (geometry.value.lines.length
  ? geometry.value.lines
  : props.data.relations.map(relation => ({ relation, color: kindColor(relation.kind) }))))

/** In the followspot an authored label also names its kind ("padre · Famiglia"): the colour is never alone. */
const showKinds = computed(() => !!(props.selected || props.data.lit || props.data.focused))
</script>

<template>
  <g class="relations-edge" :class="{ 'is-selected': selected || data.lit || data.focused, 'is-faded': data.faded }">
    <path v-if="geometry.hit" :d="geometry.hit" class="relations-edge__hit" />
    <template v-for="line in geometry.lines" :key="line.relation.id">
      <path
        :d="line.path"
        class="relations-edge__line"
        :style="{ stroke: line.color }"
        :stroke-dasharray="line.stroke.dasharray"
        :stroke-linecap="line.stroke.linecap"
      />
      <path v-if="line.arrow" :d="line.arrow" class="relations-edge__arrow" :style="{ fill: line.color }" />
    </template>
  </g>
  <EdgeLabelRenderer>
    <div
      class="relations-edge__labels nodrag nopan"
      :class="{ 'is-selected': selected || data.focused, 'is-faded': data.faded, 'is-beside': geometry.beside }"
      :style="{ transform: `${geometry.beside ? 'translate(0, -50%)' : 'translate(-50%, -50%)'} translate(${geometry.label.x}px, ${geometry.label.y}px)` }"
      aria-hidden="true"
    >
      <button
        v-for="line in pills"
        :key="line.relation.id"
        type="button"
        tabindex="-1"
        class="relations-edge__pill"
        :class="{ 'voice-author': line.relation.authored, 'is-lit': showKinds && line.relation.authored }"
        :style="{ borderColor: line.color }"
        :title="line.relation.authored ? `${line.relation.kindLabel}: ${line.relation.text}` : line.relation.text"
        @click.stop="data.pick?.(line.relation.id)"
      >
        <span class="relations-edge__text min-w-0 truncate">{{ line.relation.text }}</span>
        <span v-if="showKinds && line.relation.authored" class="relations-edge__kind">· {{ line.relation.kindLabel }}</span>
      </button>
    </div>
  </EdgeLabelRenderer>
</template>

<style>
.relations-edge {
  transition: opacity 200ms var(--ease-out-expo);
}
.relations-edge.is-faded,
.relations-edge__labels.is-faded {
  opacity: 0.3;
}
.relations-edge__hit {
  fill: none;
  stroke: transparent;
  stroke-width: 16;
  pointer-events: stroke;
}
.relations-edge__line {
  fill: none;
  stroke-width: 1;
  pointer-events: none;
  transition: stroke-width 150ms var(--ease-out-expo);
}
.relations-edge__arrow {
  pointer-events: none;
}
.vue-flow__edge:hover .relations-edge__line,
.relations-edge.is-selected .relations-edge__line {
  stroke-width: 2;
}

.relations-edge__labels {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
  transition: opacity 200ms var(--ease-out-expo);
}
.relations-edge__pill {
  display: inline-flex;
  align-items: center;
  max-width: 10rem;
  height: 1.25rem;
  padding: 0 6px;
  border-radius: 4.5px;
  border: 1px solid;
  background: var(--ui-bg);
  color: var(--ui-text);
  font-size: 0.75rem;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  pointer-events: all;
}
.relations-edge__pill.voice-author {
  font-size: 0.78rem;
}
/* Room for ascenders and descenders: the text is clipped when it is too long. */
.relations-edge__text {
  line-height: 1.35;
}
.relations-edge__pill.is-lit {
  max-width: 15rem;
}
.relations-edge__kind {
  flex-shrink: 0;
  margin-inline-start: 0.25rem;
  font-family: var(--font-sans);
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--ui-text-muted);
}
.relations-edge__labels.is-beside {
  align-items: flex-start;
}
.relations-edge__labels.is-selected .relations-edge__pill {
  border-width: 2px;
  padding: 0 5px;
}
.relations-edge__pill:hover {
  background: var(--ui-bg-elevated);
}

@media (prefers-reduced-motion: reduce) {
  .relations-edge,
  .relations-edge__line,
  .relations-edge__labels {
    transition: none;
  }
}
</style>
