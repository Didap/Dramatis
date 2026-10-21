<script lang="ts">
import type { MapLineShape, RelationKind, WorldRefType } from '#shared/types/domain'
import type { Relation } from '#shared/types/entities'
import { NODE_SHAPES } from './MapNode.vue'
import type { Point } from './MapNode.vue'

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
  /** Lines bent by the author, by line key (the map's `settings.lines`). */
  shapes?: Record<string, MapLineShape>
  faded: boolean
  /** In the followspot of a selected node: drawn thicker, like a selected edge. */
  lit?: boolean
  /** Just followed with the arrow keys: Enter opens it. Drawn like a selected edge. */
  focused?: boolean
  /** Where the labels sit, as a fraction of the line between the two centres (0.5 is the middle). */
  labelAt?: number
  /** Opens one relationship (a click on its label). */
  pick?: (relationId: string) => void
  /** Desktop: a label dragged bends its line; null makes it straight again. */
  reshape?: (key: string, shape: MapLineShape | null) => void
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

/**
 * The lines a relationship draws on its edge, whose source is `a`. Every arrowhead points at the one
 * its words describe: two different words ("padre", "figlia") draw two lines in opposite directions,
 * the same word for both ("sorella") one line with a head at each end, a single word on a one-way
 * relationship one head. A single word on a mutual relationship ("sposi") names the bond and, like a
 * relationship without words, draws no head; without words a directed kind points at its target.
 */
export function edgeLines(r: Relation, a: string, kindLabel: string): EdgeRelation[] {
  const atSource = `${r.sourceType}:${r.sourceId}` === a ? 'source' : 'target'
  const atTarget = atSource === 'source' ? 'target' : 'source'
  const line = { id: r.id, kind: r.kind, kindLabel, authored: true }
  const words = r.label.trim()
  const reverse = r.reverseLabel.trim()
  if (!words && !reverse) return [{ ...line, key: r.id, text: kindLabel, authored: false, arrows: r.directed ? atTarget : 'none' }]
  if (words && reverse && words.toLocaleLowerCase() !== reverse.toLocaleLowerCase()) {
    return [
      { ...line, key: `${r.id}:source`, text: words, arrows: atSource },
      { ...line, key: `${r.id}:target`, text: reverse, arrows: atTarget },
    ]
  }
  if (words && reverse) return [{ ...line, key: r.id, text: words, arrows: 'both' }]
  if (!r.directed) return [{ ...line, key: r.id, text: words || reverse, arrows: 'none' }]
  return [{ ...line, key: r.id, text: words || reverse, arrows: words ? atSource : atTarget }]
}

/** How far a line bends at most, as a fraction of its length, and how close to its ends its label goes. */
export const MAX_BEND = 0.5
const AT_MIN = 0.15

/** Where the label of a bent line sits, from the two centres `a` and `b`. */
export function handleOf(a: Point, b: Point, shape: MapLineShape): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return { x: a.x + dx * shape.at - dy * shape.bend, y: a.y + dy * shape.at + dx * shape.bend }
}

/** The shape of a line whose label is taken to `p`, kept to what draws well. */
export function shapeAt(a: Point, b: Point, p: Point): MapLineShape {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const squared = dx * dx + dy * dy || 1
  const rx = p.x - a.x
  const ry = p.y - a.y
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
  return {
    at: clamp((rx * dx + ry * dy) / squared, AT_MIN, 1 - AT_MIN),
    bend: clamp((ry * dx - rx * dy) / squared, -MAX_BEND, MAX_BEND),
  }
}
</script>

<script setup lang="ts">
import { EdgeLabelRenderer, useVueFlow } from '@vue-flow/core'
import type { GraphNode } from '@vue-flow/core'
import { kindColor, kindStroke } from './KindLine.vue'
import type { MapNodeData } from './MapNode.vue'

/**
 * An edge of the relationship map (DESIGN.md): straight, from shape to shape; 1px (2px hovered or
 * selected) in the kind's colour with its dash family; 6px arrowheads on the ones the words describe
 * (or the target of a directed kind without words); the labels on pills. Parallel lines run side by
 * side; a word that points one way sits near the end it points at when there is room, the rest stack
 * at the midpoint. On desktop a label dragged away takes its line with it: the line curves through it
 * (let go near the straight line, it is straight again).
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
/** A label let go closer than this to the straight line (in pixels) makes it straight again. */
const STRAIGHT = 10
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

function unit(from: Point, to: Point) {
  const d = Math.hypot(to.x - from.x, to.y - from.y) || 1
  return { x: (to.x - from.x) / d, y: (to.y - from.y) / d }
}

/** A point of the curve from `p0` to `p2` with control point `c`, at `s` (0 to 1). */
function bezier(p0: Point, c: Point, p2: Point, s: number): Point {
  const m = 1 - s
  return { x: m * m * p0.x + 2 * m * s * c.x + s * s * p2.x, y: m * m * p0.y + 2 * m * s * c.y + s * s * p2.y }
}

/** Whether `p` falls on the node's shape or within the gap around it (`c` is its centre). */
function covers(node: GraphNode<MapNodeData>, c: Point, p: Point) {
  const d = Math.hypot(p.x - c.x, p.y - c.y)
  return d < 1 || d < reach(node, (p.x - c.x) / d, (p.y - c.y) / d) + GAP
}

/**
 * A bent line: the curve from centre to centre through its label (at `at` along it), cut where it
 * leaves each shape. null when the label sits on one of the two shapes: the line is drawn straight.
 */
function curve(a: Point, b: Point, shape: MapLineShape) {
  const h = handleOf(a, b, shape)
  if (covers(props.sourceNode, a, h) || covers(props.targetNode, b, h)) return null
  const t = shape.at
  const k = 2 * t * (1 - t)
  const c = { x: (h.x - (1 - t) ** 2 * a.x - t * t * b.x) / k, y: (h.y - (1 - t) ** 2 * a.y - t * t * b.y) / k }
  // Where the curve leaves each shape, by halving.
  let inside = 0
  let outside = t
  for (let i = 0; i < 14; i++) {
    const s = (inside + outside) / 2
    if (covers(props.sourceNode, a, bezier(a, c, b, s))) inside = s
    else outside = s
  }
  const s0 = outside
  outside = t
  inside = 1
  for (let i = 0; i < 14; i++) {
    const s = (inside + outside) / 2
    if (covers(props.targetNode, b, bezier(a, c, b, s))) inside = s
    else outside = s
  }
  const s1 = outside
  // The piece between the two is a curve of its own, with this control point.
  const w = (1 - s0) * s1 + s0 * (1 - s1)
  const q1 = { x: (1 - s0) * (1 - s1) * a.x + w * c.x + s0 * s1 * b.x, y: (1 - s0) * (1 - s1) * a.y + w * c.y + s0 * s1 * b.y }
  return { label: h, q0: bezier(a, c, b, s0), q1, q2: bezier(a, c, b, s1) }
}

/** The line whose label is being dragged, with its shape so far (saved when it is let go). */
const live = ref<{ key: string, shape: MapLineShape } | null>(null)

/** The shape of a line: the one being dragged, else the one saved on the map. */
const shapeOf = (key: string) => (live.value?.key === key ? live.value.shape : props.data.shapes?.[key])

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
  const curves = new Map(props.data.relations.flatMap((relation) => {
    const shape = shapeOf(relation.key)
    const bent = shape ? curve(a, b, shape) : null
    return bent ? [[relation.key, bent] as const] : []
  }))
  // Perpendicular, for parallel lines: the straight ones run side by side.
  const px = -uy
  const py = ux
  const straight = props.data.relations.filter(relation => !curves.has(relation.key))
  const lines = props.data.relations.map((relation) => {
    const bent = curves.get(relation.key)
    const offset = (straight.indexOf(relation) - (straight.length - 1) / 2) * SPACING
    let from = bent ? bent.q0 : { x: start.x + px * offset, y: start.y + py * offset }
    let to = bent ? bent.q2 : { x: end.x + px * offset, y: end.y + py * offset }
    const hit = bent ? `M ${from.x} ${from.y} Q ${bent.q1.x} ${bent.q1.y} ${to.x} ${to.y}` : `M ${from.x} ${from.y} L ${to.x} ${to.y}`
    // The line stops at each arrowhead's base; on a curve the heads follow its direction at the ends.
    const heads: string[] = []
    if (relation.arrows === 'target' || relation.arrows === 'both') {
      const d = bent ? unit(bent.q1, bent.q2) : { x: ux, y: uy }
      const h = head(to, d.x, d.y, 1)
      heads.push(h.path)
      to = h.base
    }
    if (relation.arrows === 'source' || relation.arrows === 'both') {
      const d = bent ? unit(bent.q0, bent.q1) : { x: ux, y: uy }
      const h = head(from, d.x, d.y, -1)
      heads.push(h.path)
      from = h.base
    }
    const path = bent ? `M ${from.x} ${from.y} Q ${bent.q1.x} ${bent.q1.y} ${to.x} ${to.y}` : `M ${from.x} ${from.y} L ${to.x} ${to.y}`
    return { relation, path, hit, heads, stroke: kindStroke(relation.kind), color: kindColor(relation.kind) }
  })
  const bentGroups: LabelGroup[] = [...curves].map(([key, bent]) => ({
    key,
    at: bent.label,
    lines: allLines().filter(line => line.relation.key === key),
  }))
  return {
    lines,
    groups: [...labelGroups(a, ux, uy, length, startAt, endAt, straight), ...bentGroups],
    beside: false,
  }
})

/** The pill groups of the straight lines, placed on the line from the source centre `a`. */
function labelGroups(a: Point, ux: number, uy: number, length: number, startAt: number, endAt: number, straight: EdgeRelation[]): LabelGroup[] {
  if (!straight.length) return []
  const at = Math.min(Math.max((props.data.labelAt ?? 0.5) * length, startAt), endAt)
  const lines = allLines().filter(line => straight.includes(line.relation))
  return placeLabels(lines.map(line => ({ ...line, arrows: line.relation.arrows, text: line.relation.text })), ux, uy, at, startAt, endAt)
    .map(g => ({ key: g.key, at: { x: a.x + ux * g.d, y: a.y + uy * g.d }, lines: g.lines }))
}

// ---------------------------------------------------------------- dragging a label

const { screenToFlowCoordinate } = useVueFlow()

let grab: { key: string, pointerId: number, x: number, y: number, label: Point, moved: boolean } | null = null
/** A drag ends with a click on the label: it does not open the relationship. */
let dragged = false

/**
 * The drag is followed on the window: once its line bends, the label moves to a group of its own and
 * the pill under the pointer is a new element.
 */
function onPointerDown(event: PointerEvent, key: string) {
  dragged = false
  // Ctrl and a click is the context menu on a Mac: its release never reaches the page.
  if (!props.data.reshape || event.button !== 0 || event.ctrlKey) return
  event.preventDefault()
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  grab = { key, pointerId: event.pointerId, x: event.clientX, y: event.clientY, label: screenToFlowCoordinate({ x: box.left + box.width / 2, y: box.top + box.height / 2 }), moved: false }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
}

function stopFollowing() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
}
onBeforeUnmount(stopFollowing)

function onPointerMove(event: PointerEvent) {
  if (!grab || event.pointerId !== grab.pointerId) return
  // No button held: the release was lost (a menu, another app); the drag ends and saves nothing.
  if (!event.buttons) {
    onPointerCancel()
    return
  }
  if (!grab.moved && Math.hypot(event.clientX - grab.x, event.clientY - grab.y) < 4) return
  grab.moved = true
  const from = screenToFlowCoordinate({ x: grab.x, y: grab.y })
  const to = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const p = { x: grab.label.x + to.x - from.x, y: grab.label.y + to.y - from.y }
  live.value = { key: grab.key, shape: shapeAt(centre(props.sourceNode), centre(props.targetNode), p) }
}

function onPointerUp(event: PointerEvent) {
  if (!grab || event.pointerId !== grab.pointerId) return
  const { key, moved } = grab
  grab = null
  stopFollowing()
  const shape = live.value?.shape
  if (moved && shape) {
    dragged = true
    const a = centre(props.sourceNode)
    const b = centre(props.targetNode)
    const near = Math.abs(shape.bend) * Math.hypot(b.x - a.x, b.y - a.y) < STRAIGHT
    props.data.reshape?.(key, near ? null : shape)
  }
  live.value = null
}

function onPointerCancel() {
  grab = null
  live.value = null
  stopFollowing()
}

function onPillClick(relationId: string) {
  if (dragged) {
    dragged = false
    return
  }
  props.data.pick?.(relationId)
}

/** In the followspot an authored label also names its kind ("padre · Famiglia"): the colour is never alone. */
const showKinds = computed(() => !!(props.selected || props.data.lit || props.data.focused))
</script>

<template>
  <g class="relations-edge" :class="{ 'is-selected': selected || data.lit || data.focused, 'is-faded': data.faded }">
    <path v-for="line in geometry.lines" :key="`hit-${line.relation.key}`" :d="line.hit" class="relations-edge__hit" />
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
        :class="{ 'voice-author': line.relation.authored, 'is-lit': showKinds && line.relation.authored, 'is-draggable': !!data.reshape, 'is-dragging': live?.key === line.relation.key }"
        :style="{ borderColor: line.color }"
        :title="line.relation.authored ? `${line.relation.kindLabel}: ${line.relation.text}` : line.relation.text"
        @pointerdown="onPointerDown($event, line.relation.key)"
        @click.stop="onPillClick(line.relation.id)"
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
.relations-edge__pill.is-draggable {
  /* A finger dragging a word bends its arrow instead of panning the page. */
  touch-action: none;
}
.relations-edge__pill.is-dragging {
  cursor: grabbing;
}

@media (prefers-reduced-motion: reduce) {
  .relations-edge,
  .relations-edge__line,
  .relations-edge__labels {
    transition: none;
  }
}
</style>
