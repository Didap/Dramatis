<script lang="ts">
import type { RelationKind, WorldRefType } from '#shared/types/domain'
import { NODE_SHAPES } from './MapNode.vue'

/** Where a line's arrowheads go: at the edge's source end, its target end, both or neither. */
export type EdgeArrows = 'source' | 'target' | 'both' | 'none'

/**
 * One line drawn on an edge of the map. A relationship with a different word for each side draws
 * two lines, one per word, each pointing at the one its word describes.
 */
export interface EdgeRelation {
  /** Unique on the edge (a relationship can draw two lines). */
  key: string
  /** The relationship's id. */
  id: string
  kind: RelationKind
  /** The words of one side, or the kind's name when there are none. */
  text: string
  /** true when `text` is the author's label (manuscript face), false for the kind's name. */
  authored: boolean
  /** The kind's name: on the pill of an authored label it shows in the light and in the tooltip. */
  kindLabel: string
  /** The arrowheads point at the one the words describe ("figlia" points at the daughter). */
  arrows: EdgeArrows
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

/** Estimated pill size (the map is not measured): height with its gap, width from the text. */
export const PILL_H = 22
export const pillWidth = (text: string) => Math.min(164, text.length * 6.6 + 16)

/** Distance from a node's centre to its outline, along a unit direction. */
export function outlineReach(type: WorldRefType, width: number, height: number, ux: number, uy: number): number {
  const hw = width / 2
  const hh = height / 2
  if (NODE_SHAPES[type].outline === 'diamond') return 1 / (Math.abs(ux) / hw + Math.abs(uy) / hh || 1)
  return Math.min(Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity)
}

export interface PillGroup<T extends { arrows: EdgeArrows, text: string }> { key: 'source' | 'mid' | 'target', d: number, lines: T[] }

/**
 * Where the pills of an edge sit, as distances from the source centre along the line (`at` is the
 * edge's label spot, kept on the visible part between `startAt` and `endAt`). A word that points one
 * way moves halfway towards the end it points at, when every group then fits without touching its
 * neighbours; otherwise every pill stacks at the spot.
 */
export function placeLabels<T extends { arrows: EdgeArrows, text: string }>(lines: T[], ux: number, uy: number, at: number, startAt: number, endAt: number): PillGroup<T>[] {
  const toSource = lines.filter(l => l.arrows === 'source')
  const toTarget = lines.filter(l => l.arrows === 'target')
  const together: PillGroup<T>[] = [{ key: 'mid', d: at, lines }]
  if (!toSource.length && !toTarget.length) return together
  const middle = lines.filter(l => l.arrows !== 'source' && l.arrows !== 'target')
  // Half of a group's extent along the line.
  const extent = (group: T[]) => (Math.max(...group.map(l => pillWidth(l.text))) / 2) * Math.abs(ux) + (group.length * PILL_H / 2) * Math.abs(uy)
  const groups = ([
    { key: 'source', d: (startAt + at) / 2, lines: toSource },
    { key: 'mid', d: at, lines: middle },
    { key: 'target', d: (at + endAt) / 2, lines: toTarget },
  ] as PillGroup<T>[]).filter(g => g.lines.length)
  const fits = groups.every((g, i) => {
    const e = extent(g.lines)
    const next = groups[i + 1]
    return g.d - e >= startAt - 2 && g.d + e <= endAt + 2 && (!next || next.d - extent(next.lines) - (g.d + e) >= 6)
  })
  return fits ? groups : together
}
</script>

<script setup lang="ts">
import { EdgeLabelRenderer } from '@vue-flow/core'
import type { GraphNode } from '@vue-flow/core'
import { kindColor, kindStroke } from './KindLine.vue'
import type { MapNodeData } from './MapNode.vue'

/**
 * An edge of the relationship map (DESIGN.md): straight, from shape to shape; 1px (2px hovered or
 * selected) in the kind's colour with its dash family; 6px arrowheads on the ones the words describe
 * (or the target of a directed kind without words); the labels on pills. Parallel lines run side by
 * side; a word that points one way sits near the end it points at when there is room, the rest stack
 * at the midpoint.
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
type Point = { x: number, y: number }
type Line = { relation: EdgeRelation, color: string }
interface LabelGroup { key: string, at: Point, lines: Line[] }

function reach(node: GraphNode<MapNodeData>, ux: number, uy: number): number {
  const type = node.data?.type ?? 'character'
  return outlineReach(type, node.dimensions.width || NODE_SHAPES[type].width, node.dimensions.height || NODE_SHAPES[type].height, ux, uy)
}

function centre(node: GraphNode<MapNodeData>) {
  const shape = NODE_SHAPES[node.data?.type ?? 'character']
  return {
    x: node.computedPosition.x + (node.dimensions.width || shape.width) / 2,
    y: node.computedPosition.y + (node.dimensions.height || shape.height) / 2,
  }
}

const allLines = () => props.data.relations.map(relation => ({ relation, color: kindColor(relation.kind) }))

/**
 * Two nodes on top of each other leave no line to draw: the labels stay, beside the pair, so the
 * relationship never vanishes from the map.
 */
function besideBoth(a: Point, b: Point) {
  const right = (node: GraphNode<MapNodeData>, c: { x: number }) => c.x + (node.dimensions.width || NODE_SHAPES[node.data?.type ?? 'character'].width) / 2
  return {
    lines: [],
    hit: null,
    groups: [{ key: 'mid', at: { x: Math.max(right(props.sourceNode, a), right(props.targetNode, b)) + 10, y: (a.y + b.y) / 2 }, lines: allLines() }] as LabelGroup[],
    beside: true,
  }
}

/** A 6px arrowhead with its tip on `tip`, its base `ARROW` back along (ux, uy) times `dir`. */
function head(tip: Point, ux: number, uy: number, dir: 1 | -1) {
  const bx = tip.x - ux * ARROW * dir
  const by = tip.y - uy * ARROW * dir
  return { path: `M ${tip.x} ${tip.y} L ${bx - uy * 3} ${by + ux * 3} L ${bx + uy * 3} ${by - ux * 3} Z`, base: { x: bx, y: by } }
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
    let from = { x: start.x + px * offset, y: start.y + py * offset }
    let to = { x: end.x + px * offset, y: end.y + py * offset }
    // The line stops at each arrowhead's base.
    const heads: string[] = []
    if (relation.arrows === 'target' || relation.arrows === 'both') {
      const h = head(to, ux, uy, 1)
      heads.push(h.path)
      to = h.base
    }
    if (relation.arrows === 'source' || relation.arrows === 'both') {
      const h = head(from, ux, uy, -1)
      heads.push(h.path)
      from = h.base
    }
    return { relation, path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`, heads, stroke: kindStroke(relation.kind), color: kindColor(relation.kind) }
  })
  return {
    lines,
    hit: `M ${start.x} ${start.y} L ${end.x} ${end.y}` as string | null,
    groups: labelGroups(a, ux, uy, length, startAt, endAt),
    beside: false,
  }
})

/** The pill groups, placed on the line from the source centre `a`. */
function labelGroups(a: Point, ux: number, uy: number, length: number, startAt: number, endAt: number): LabelGroup[] {
  const at = Math.min(Math.max((props.data.labelAt ?? 0.5) * length, startAt), endAt)
  const lines = allLines()
  return placeLabels(lines.map(line => ({ ...line, arrows: line.relation.arrows, text: line.relation.text })), ux, uy, at, startAt, endAt)
    .map(g => ({ key: g.key, at: { x: a.x + ux * g.d, y: a.y + uy * g.d }, lines: g.lines }))
}

/** In the followspot an authored label also names its kind ("padre · Famiglia"): the colour is never alone. */
const showKinds = computed(() => !!(props.selected || props.data.lit || props.data.focused))
</script>

<template>
  <g class="relations-edge" :class="{ 'is-selected': selected || data.lit || data.focused, 'is-faded': data.faded }">
    <path v-if="geometry.hit" :d="geometry.hit" class="relations-edge__hit" />
    <template v-for="line in geometry.lines" :key="line.relation.key">
      <path
        :d="line.path"
        class="relations-edge__line"
        :style="{ stroke: line.color }"
        :stroke-dasharray="line.stroke.dasharray"
        :stroke-linecap="line.stroke.linecap"
      />
      <path v-for="(arrow, i) in line.heads" :key="i" :d="arrow" class="relations-edge__arrow" :style="{ fill: line.color }" />
    </template>
  </g>
  <EdgeLabelRenderer>
    <div
      v-for="group in geometry.groups"
      :key="group.key"
      class="relations-edge__labels nodrag nopan"
      :class="{ 'is-selected': selected || data.focused, 'is-faded': data.faded, 'is-beside': geometry.beside }"
      :style="{ transform: `${geometry.beside ? 'translate(0, -50%)' : 'translate(-50%, -50%)'} translate(${group.at.x}px, ${group.at.y}px)` }"
      aria-hidden="true"
    >
      <button
        v-for="line in group.lines"
        :key="line.relation.key"
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
