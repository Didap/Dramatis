<script setup lang="ts">
import { ConnectionMode, Panel, VueFlow, useVueFlow } from '@vue-flow/core'
import type { Connection, Edge, EdgeMouseEvent, Node, NodeDragEvent, NodeMouseEvent } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import type { MapLineShape, WorldRefType } from '#shared/types/domain'
import type { Relation, StoryMap } from '#shared/types/entities'
import { parseMentionId } from '#shared/utils/richtext'
import { NODE_SHAPES, centreOf, freeSpots, topLeft } from './MapNode.vue'
import type { MapNodeData, Point } from './MapNode.vue'
import { PILL_H, edgeLines, handleOf, outlineReach, pillWidth, placeLabels } from './MapEdge.vue'
import type { EdgeRelation, MapEdgeData } from './MapEdge.vue'
import type { MapSelection } from './Selection.vue'

/**
 * The relationship map (DESIGN.md "Relationship map"), on Vue Flow. Nodes are the map's entities at
 * their saved positions; edges are the relationships among them, one per pair. Selecting lights a
 * followspot. Desktop: drag to move (saved on the map), drag from a node's knob to another to link,
 * drag a label to bend its line (saved on the map too).
 * Keyboard: Tab through nodes, arrows along the relationships, Enter on a node just reached opens
 * the relationship followed (Enter elsewhere: the node's actions), Shift and an arrow to move a node,
 * Esc to let go. Nodes still at 0,0 get a force layout when the map opens.
 */
const props = defineProps<{
  map: StoryMap
  /** Keys of the entities shown (in the map and not in the trash). */
  keys: string[]
  /** Relationships drawn: among the shown entities, of the kinds not hidden by the legend. */
  relations: Relation[]
  /** Relationships of each shown entity with entities outside the map. */
  outside: Record<string, number>
  editable: boolean
  /** An entity to select and centre when the map opens ("Mostra nella mappa"). */
  focusKey?: string | null
}>()

const selection = defineModel<MapSelection>('selection', { default: null })
const emit = defineEmits<{ connect: [a: string, b: string], activate: [], pick: [relationId: string] }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const reducedMotion = usePreferredReducedMotion()
const windowSize = useWindowSize()

const flowId = `relations-map-${props.map.id}`
const { fitView, zoomIn, zoomOut, setCenter, getViewport, dimensions } = useVueFlow(flowId)
const root = ref<HTMLElement | null>(null)
const helpId = `${flowId}-help`
const duration = computed(() => (reducedMotion.value === 'reduce' ? 0 : 250))

const typeOf = (key: string) => parseMentionId(key)!.type as WorldRefType
const nameOf = (key: string) => store.refLabel(parseMentionId(key))
const sourceOf = (r: Relation) => `${r.sourceType}:${r.sourceId}`
const targetOf = (r: Relation) => `${r.targetType}:${r.targetId}`

// ---------------------------------------------------------------- positions

/**
 * Where each node is drawn. It follows the map in the store, except for a node being dragged, which
 * keeps its live position until it is dropped and saved.
 */
const positions = reactive<Record<string, Point>>({})
const dragging = new Set<string>()

watch(() => props.map.nodes, (nodes) => {
  for (const key of Object.keys(positions)) if (!(key in nodes)) delete positions[key]
  for (const [key, p] of Object.entries(nodes)) if (!dragging.has(key)) positions[key] = { x: p.x, y: p.y }
}, { immediate: true, deep: true })

function save(updates: Record<string, Point>) {
  const nodes = { ...props.map.nodes }
  for (const [key, p] of Object.entries(updates)) {
    const point = { x: Math.round(p.x), y: Math.round(p.y) }
    nodes[key] = point
    positions[key] = point
  }
  store.patchSoon('maps', props.map.id, { nodes }, 400)
}

function centre(key: string): Point {
  const p = positions[key] ?? { x: 0, y: 0 }
  return centreOf(typeOf(key), p)
}

// ---------------------------------------------------------------- automatic layout (d3-force)

type LayoutNode = SimulationNodeDatum & {
  id: string
  /** Where a new node is held towards: beside the nodes it is tied to (none: the middle of the map). */
  home?: Point
  /** A point of an edge already drawn: it pushes new nodes away and never moves. */
  obstacle?: boolean
}

const mean = (points: Point[]): Point => ({
  x: points.reduce((n, p) => n + p.x, 0) / points.length,
  y: points.reduce((n, p) => n + p.y, 0) / points.length,
})

/**
 * Lays out `free` nodes around the others with a force simulation: relationships pull, nodes push
 * each other away and never overlap. Nodes not in `free` stay where they are; a new node starts
 * beside the nodes it is tied to and keeps clear of the edges already drawn, where it would hide a
 * line or its labels. Deterministic.
 */
function forceLayout(free: string[]): Record<string, Point> {
  const loose = new Set(free)
  const keys = new Set(props.keys)
  const fixed = props.keys.filter(k => !loose.has(k))
  const anchor = fixed.length ? mean(fixed.map(centre)) : { x: 0, y: 0 }
  const tied = store.rows.relations.filter(r => keys.has(sourceOf(r)) && keys.has(targetOf(r)))

  /** For each new node, the centres of the nodes it is tied to that stay where they are. */
  const neighbours = new Map<string, Point[]>()
  for (const r of tied) {
    for (const [mine, theirs] of [[sourceOf(r), targetOf(r)], [targetOf(r), sourceOf(r)]] as const) {
      if (loose.has(mine) && !loose.has(theirs)) neighbours.set(mine, [...(neighbours.get(mine) ?? []), centre(theirs)])
    }
  }

  const golden = Math.PI * (3 - Math.sqrt(5))
  const nodes: LayoutNode[] = props.keys.map((id, i) => {
    if (!loose.has(id)) {
      const c = centre(id)
      return { id, x: c.x, y: c.y, fx: c.x, fy: c.y }
    }
    const near = neighbours.get(id)
    if (near?.length) {
      // Beside what it is tied to, on the side away from the middle of the map.
      const c = mean(near)
      const dx = c.x - anchor.x
      const dy = c.y - anchor.y
      const d = Math.hypot(dx, dy)
      const [ux, uy] = d > 1 ? [dx / d, dy / d] : [Math.cos(i * golden), Math.sin(i * golden)]
      const home = { x: c.x + ux * 190 + Math.cos(i * golden) * 24, y: c.y + uy * 190 + Math.sin(i * golden) * 24 }
      return { id, x: home.x, y: home.y, home }
    }
    const r = 60 * Math.sqrt(i + 1)
    return { id, x: anchor.x + r * Math.cos(i * golden), y: anchor.y + r * Math.sin(i * golden) }
  })

  // The edges already drawn, sampled along the line every 80px or so: their lines and labels stay clear.
  const obstacles: LayoutNode[] = []
  const drawn = new Set<string>()
  for (const r of tied) {
    const [a, b] = [sourceOf(r), targetOf(r)].sort() as [string, string]
    if (loose.has(a) || loose.has(b) || drawn.has(`${a}|${b}`)) continue
    drawn.add(`${a}|${b}`)
    const p = centre(a)
    const q = centre(b)
    const count = Math.max(1, Math.round(Math.hypot(q.x - p.x, q.y - p.y) / 80))
    for (let k = 0; k < count; k++) {
      const at = 0.15 + 0.7 * (k + 0.5) / count
      const x = p.x + (q.x - p.x) * at
      const y = p.y + (q.y - p.y) * at
      obstacles.push({ id: `edge:${a}|${b}:${k}`, x, y, fx: x, fy: y, obstacle: true })
    }
  }

  const links: SimulationLinkDatum<LayoutNode>[] = tied.map(r => ({ source: sourceOf(r), target: targetOf(r) }))
  const simulation = forceSimulation([...nodes, ...obstacles])
    .force('link', forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(links).id(n => n.id).distance(220))
    .force('charge', forceManyBody<LayoutNode>().strength(n => (n.obstacle ? -260 : -900)).distanceMax(400))
    .force('collide', forceCollide<LayoutNode>(n => (n.obstacle ? 0 : 90)))
    .force('x', forceX<LayoutNode>(n => n.home?.x ?? anchor.x).strength(n => (n.home ? 0.05 : 0.08)))
    .force('y', forceY<LayoutNode>(n => n.home?.y ?? anchor.y).strength(n => (n.home ? 0.05 : 0.12)))
    .stop()
  for (let i = 0; i < 320; i++) simulation.tick()
  // A whole layout is widened a little on a landscape screen; a phone held upright keeps it as it is.
  const portrait = windowSize.height.value > windowSize.width.value
  const [sx, sy] = fixed.length || portrait ? [1, 1] : [1.3, 0.95]
  return Object.fromEntries(nodes.filter(n => loose.has(n.id)).map(n => [
    n.id,
    topLeft(typeOf(n.id), { x: anchor.x + ((n.x ?? 0) - anchor.x) * sx, y: anchor.y + ((n.y ?? 0) - anchor.y) * sy }),
  ]))
}

/** The demo map, and nodes added from a sheet, wait at 0,0: lay them out once, then save. */
const atOrigin = (key: string) => {
  const p = props.map.nodes[key]
  return !p || (p.x === 0 && p.y === 0)
}
const waiting = props.keys.filter(atOrigin)
if (waiting.length) save(forceLayout(waiting))
watch(() => props.keys, (keys, before) => {
  const fresh = keys.filter(k => !before.includes(k) && atOrigin(k))
  if (fresh.length) save(forceLayout(fresh))
})

// ---------------------------------------------------------------- followspot

/** The nodes in the light: the selected node and its neighbours, or the two ends of the selected edge. */
const lit = computed<Set<string> | null>(() => {
  const s = selection.value
  if (!s) return null
  if (s.type === 'edge') return new Set([s.a, s.b])
  const out = new Set([s.key])
  for (const r of props.relations) {
    if (sourceOf(r) === s.key) out.add(targetOf(r))
    else if (targetOf(r) === s.key) out.add(sourceOf(r))
  }
  return out
})

/** The relationship just followed with an arrow key: drawn like a selected edge, Enter opens it. */
const stepped = ref<{ from: string, to: string } | null>(null)

// ---------------------------------------------------------------- nodes and edges

const degree = computed(() => {
  const out = new Map<string, number>()
  for (const r of props.relations) {
    out.set(sourceOf(r), (out.get(sourceOf(r)) ?? 0) + 1)
    out.set(targetOf(r), (out.get(targetOf(r)) ?? 0) + 1)
  }
  return out
})

const nodes = computed<Node<MapNodeData>[]>(() => {
  const light = lit.value
  return props.keys.map((key) => {
    const type = typeOf(key)
    const id = parseMentionId(key)!.id
    const name = nameOf(key)
    const count = degree.value.get(key) ?? 0
    const outside = props.outside[key] ?? 0
    const p = positions[key] ?? { x: 0, y: 0 }
    return {
      id: key,
      type: 'entity',
      position: { x: p.x, y: p.y },
      selected: selection.value?.type === 'node' && selection.value.key === key,
      draggable: props.editable,
      connectable: props.editable,
      data: {
        type,
        name,
        imageId: store.primaryImage(type, id),
        // A portrait says "person" by itself; places, things and groups also say what they are.
        typeLabel: type === 'character' ? undefined : term(type),
        outside,
        faded: !!light && !light.has(key),
        editable: props.editable,
      },
      ariaLabel: [
        t('relations.map.nodeLabel', { name, type: term(type) }),
        t('relations.map.nodeRelations', { n: count }, count),
        outside ? t('relations.map.outside', { n: outside }, outside) : '',
      ].filter(Boolean).join('. '),
      domAttributes: { 'aria-roledescription': t('relations.map.nodeRole'), 'aria-describedby': helpId },
    }
  })
})

/** Relationships grouped by pair (the pair's keys in a stable order). */
const pairs = computed(() => {
  const out = new Map<string, { a: string, b: string, relations: Relation[] }>()
  for (const r of props.relations) {
    const s = sourceOf(r)
    const tk = targetOf(r)
    const [a, b] = s < tk ? [s, tk] : [tk, s]
    const id = `${a}|${b}`
    const pair = out.get(id)
    if (pair) pair.relations.push(r)
    else out.set(id, { a, b, relations: [r] })
  }
  return out
})

/** The lines a relationship draws on the edge whose source is `a`. */
const linesOf = (r: Relation, a: string) => edgeLines(r, a, label('relationKind', r.kind))

// ---------------------------------------------------------------- where the labels sit

interface Box { x: number, y: number, w: number, h: number }

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

/** What a node covers: its shape and the name hanging below it (estimated, the map is not measured). */
function nodeBoxes(key: string): Box[] {
  const type = typeOf(key)
  const shape = NODE_SHAPES[type]
  const p = positions[key] ?? { x: 0, y: 0 }
  const nameWidth = Math.min(152, nameOf(key).length * 7.2 + 10)
  const lines = nameOf(key).length * 7.2 > 152 ? 2 : 1
  return [
    { x: p.x - 4, y: p.y - 4, w: shape.width + 8, h: shape.height + 8 },
    { x: p.x + shape.width / 2 - nameWidth / 2, y: p.y + shape.height + 4, w: nameWidth, h: lines * 17 + 4 },
  ]
}

const LABEL_SPOTS = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8]

/** Lines bent by the author, by line key. */
const shapes = computed<Record<string, MapLineShape>>(() => props.map.settings.lines ?? {})

/** A line bent (or straightened, null) by the author, saved on the map. */
function reshape(key: string, shape: MapLineShape | null) {
  const { [key]: _before, ...lines } = shapes.value
  if (shape) lines[key] = { at: Math.round(shape.at * 1000) / 1000, bend: Math.round(shape.bend * 1000) / 1000 }
  store.patchSoon('maps', props.map.id, { settings: { ...props.map.settings, lines } }, 400)
}

/**
 * Where along each edge the labels of its straight lines sit, as a fraction of the line between the
 * two centres: the middle when it is free, otherwise the nearest spot that covers no name and no
 * other label. The labels of bent lines stay where the author put them, and the others keep off them.
 */
const labelSpots = computed(() => {
  const nodes = props.keys.flatMap(nodeBoxes)
  const placed: Box[] = []
  const out = new Map<string, number>()
  for (const pair of pairs.value.values()) {
    for (const line of pair.relations.flatMap(r => linesOf(r, pair.a))) {
      const shape = shapes.value[line.key]
      if (!shape) continue
      const at = handleOf(centre(pair.a), centre(pair.b), shape)
      const w = pillWidth(line.text)
      placed.push({ x: at.x - w / 2, y: at.y - PILL_H / 2, w, h: PILL_H })
    }
  }
  const items = [...pairs.value].map(([id, pair]) => {
    const a = centre(pair.a)
    const b = centre(pair.b)
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const ux = length ? (b.x - a.x) / length : 1
    const uy = length ? (b.y - a.y) / length : 0
    const shape = (key: string) => NODE_SHAPES[typeOf(key)]
    const startAt = outlineReach(typeOf(pair.a), shape(pair.a).width, shape(pair.a).height, ux, uy) + 4
    const endAt = length - outlineReach(typeOf(pair.b), shape(pair.b).width, shape(pair.b).height, -ux, -uy) - 4
    const lines = pair.relations.flatMap(r => linesOf(r, pair.a)).filter(line => !shapes.value[line.key])
    return { id, a, ux, uy, length, startAt, endAt, lines }
  }).sort((x, y) => x.length - y.length)
  /** The boxes the pills of an edge cover with its labels at `spot`. */
  const boxes = (item: typeof items[number], spot: number): Box[] =>
    placeLabels(item.lines, item.ux, item.uy, Math.min(Math.max(spot * item.length, item.startAt), item.endAt), item.startAt, item.endAt)
      .map((group) => {
        const w = Math.max(...group.lines.map(line => pillWidth(line.text)))
        const h = group.lines.length * PILL_H
        return { x: item.a.x + item.ux * group.d - w / 2, y: item.a.y + item.uy * group.d - h / 2, w, h }
      })
  for (const item of items) {
    if (!item.lines.length) continue
    let best = 0.5
    let bestCost = Infinity
    for (const spot of LABEL_SPOTS) {
      const cost = boxes(item, spot).reduce((n, box) => n
        + nodes.reduce((m, other) => m + overlap(box, other) * 3, 0)
        + placed.reduce((m, other) => m + overlap(box, other), 0), 0)
        + Math.abs(spot - 0.5) * 120
      if (cost < bestCost) {
        bestCost = cost
        best = spot
      }
    }
    placed.push(...boxes(item, best))
    out.set(item.id, best)
  }
  return out
})

/** A relationship in words for a screen reader: "Famiglia (Tobia Marin: padre; Elsa Marin: figlia)". */
function spoken(r: Relation) {
  const sides = [
    r.label ? t('relations.map.sideWords', { name: nameOf(sourceOf(r)), words: r.label }) : '',
    r.reverseLabel ? t('relations.map.sideWords', { name: nameOf(targetOf(r)), words: r.reverseLabel }) : '',
  ].filter(Boolean)
  const kind = label('relationKind', r.kind)
  return sides.length ? `${kind} (${sides.join('; ')})` : kind
}

const samePair = (x: { a: string, b: string }, a: string, b: string) => (x.a === a && x.b === b) || (x.a === b && x.b === a)

const edges = computed<Edge<MapEdgeData>[]>(() => {
  const s = selection.value
  const spots = labelSpots.value
  const step = stepped.value
  return [...pairs.value].map(([id, pair]) => {
    const isSelected = s?.type === 'edge' && samePair(s, pair.a, pair.b)
    const inLight = !s || isSelected || (s.type === 'node' && (s.key === pair.a || s.key === pair.b))
    const relations: EdgeRelation[] = [...pair.relations]
      .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
      .flatMap(r => linesOf(r, pair.a))
    return {
      id,
      type: 'relation',
      source: pair.a,
      target: pair.b,
      selected: isSelected,
      focusable: false,
      data: {
        relations,
        shapes: shapes.value,
        faded: !inLight,
        lit: s?.type === 'node' && inLight,
        focused: !!step && samePair({ a: step.from, b: step.to }, pair.a, pair.b),
        labelAt: spots.get(id) ?? 0.5,
        pick: (relationId: string) => onPick(pair.a, pair.b, relationId),
        reshape: props.editable ? reshape : undefined,
      },
      ariaLabel: t('relations.map.edgeLabel', {
        a: nameOf(pair.a),
        b: nameOf(pair.b),
        relations: [...pair.relations].sort((x, y) => x.createdAt.localeCompare(y.createdAt)).map(spoken).join(', '),
      }),
    }
  })
})

// ---------------------------------------------------------------- pointer

function onNodeClick({ node }: NodeMouseEvent) {
  selection.value = { type: 'node', key: node.id }
}

function onEdgeClick({ edge }: EdgeMouseEvent) {
  selection.value = { type: 'edge', a: edge.source, b: edge.target }
}

function onPick(a: string, b: string, relationId: string) {
  selection.value = { type: 'edge', a, b }
  if (props.editable) emit('pick', relationId)
  else emit('activate')
}

function onConnect(connection: Connection) {
  if (connection.source && connection.target && connection.source !== connection.target) emit('connect', connection.source, connection.target)
}

const isValidConnection = (connection: Connection) => connection.source !== connection.target

function onDragStart({ nodes: moved }: NodeDragEvent) {
  for (const node of moved) dragging.add(node.id)
}

function onDragStop({ nodes: moved }: NodeDragEvent) {
  const updates: Record<string, Point> = {}
  for (const node of moved) {
    dragging.delete(node.id)
    updates[node.id] = { x: node.position.x, y: node.position.y }
  }
  save(updates)
}

// ---------------------------------------------------------------- viewport

let fitted = false

/** Below this zoom the names on a phone fall under 11px: the map opens on its busiest node instead, to pan. */
const PHONE_MIN_ZOOM = 0.85

/** The node with the most relationships drawn (the first one, on a tie). */
function busiest(): string | null {
  let best: string | null = null
  for (const key of props.keys) if (!best || (degree.value.get(key) ?? 0) > (degree.value.get(best) ?? 0)) best = key
  return best
}

async function onInitialized() {
  if (fitted) return
  fitted = true
  const focus = props.focusKey && props.keys.includes(props.focusKey) ? props.focusKey : null
  if (focus) {
    selection.value = { type: 'node', key: focus }
    const c = centre(focus)
    void setCenter(c.x, c.y, { zoom: 1.1, duration: 0 }).then(() => focusNode(focus))
    return
  }
  await fitView({ padding: fitPadding.value, maxZoom: 1.2, duration: 0 })
  const hub = busiest()
  if (!props.editable && hub && getViewport().zoom < PHONE_MIN_ZOOM) {
    const c = framed(centre(hub), PHONE_MIN_ZOOM)
    await setCenter(c.x, c.y, { zoom: PHONE_MIN_ZOOM, duration: 0 })
  }
}

/**
 * The centre of a view at `zoom` that keeps `wanted` as close to the middle as it can without
 * showing empty paper past the map's edges: the screen stays inside the drawing, the rest is a pan away.
 */
function framed(wanted: Point, zoom: number): Point {
  const boxes = props.keys.flatMap(nodeBoxes)
  const margin = 16 / zoom
  const min = { x: Math.min(...boxes.map(b => b.x)) - margin, y: Math.min(...boxes.map(b => b.y)) - margin }
  const max = { x: Math.max(...boxes.map(b => b.x + b.w)) + margin, y: Math.max(...boxes.map(b => b.y + b.h)) + margin }
  const half = { x: dimensions.value.width / zoom / 2, y: dimensions.value.height / zoom / 2 }
  const axis = (k: 'x' | 'y') => (max[k] - min[k] <= half[k] * 2
    ? (min[k] + max[k]) / 2
    : Math.min(Math.max(wanted[k], min[k] + half[k]), max[k] - half[k]))
  return { x: axis('x'), y: axis('y') }
}

/**
 * The margin of "Adatta alla finestra", in pixels: the names hang below the shapes and are wider
 * than them, and Vue Flow only measures the shapes. Phones get a thinner one.
 */
const fitPadding = computed(() => (props.editable
  ? { x: '96px', top: '48px', bottom: '72px' } as const
  : { x: '44px', top: '20px', bottom: '40px' } as const))

function fit() {
  void fitView({ padding: fitPadding.value, maxZoom: 1.2, duration: duration.value })
}

/** The centre of what is on screen, in map coordinates. */
function viewportCentre(): Point {
  const v = getViewport()
  return { x: (dimensions.value.width / 2 - v.x) / v.zoom, y: (dimensions.value.height / 2 - v.y) / v.zoom }
}

/** Whether a point of the map is on screen, away from the edges. */
function onScreen(p: Point, margin = 70) {
  const v = getViewport()
  const x = p.x * v.zoom + v.x
  const y = p.y * v.zoom + v.y
  return x > margin && y > margin && x < dimensions.value.width - margin && y < dimensions.value.height - margin
}

/**
 * Positions (top-left) for new nodes: around `anchor` (a node's key) or the middle of the screen,
 * on screen if possible, off the nodes and the edges already drawn.
 */
function placeNew(keys: string[], anchor?: string | null): Record<string, Point> {
  const taken = props.keys.filter(k => !keys.includes(k)).map(centre)
  const lines = [...pairs.value.values()].map(pair => [centre(pair.a), centre(pair.b)] as [Point, Point])
  const spots = freeSpots(taken, keys.length, anchor && positions[anchor] ? centre(anchor) : viewportCentre(), p => onScreen(p), 170, lines)
  return Object.fromEntries(keys.map((key, i) => [key, topLeft(typeOf(key), spots[i] ?? viewportCentre())]))
}

/** "Disponi automaticamente": every node laid out again. */
function layoutAll() {
  save(forceLayout(props.keys))
  nextTick(() => setTimeout(fit, 50))
}

/** Pans to a node when it is off screen (or too close to an edge). */
function ensureVisible(key: string) {
  const c = centre(key)
  if (!onScreen(c, 80)) void setCenter(c.x, c.y, { zoom: getViewport().zoom, duration: duration.value })
}

function nodeElement(key: string) {
  return [...(root.value?.querySelectorAll<HTMLElement>('.vue-flow__node') ?? [])].find(el => el.dataset.id === key) ?? null
}

function focusNode(key: string) {
  ensureVisible(key)
  nextTick(() => nodeElement(key)?.focus({ preventScroll: true }))
}

// ---------------------------------------------------------------- keyboard

const announcement = ref('')
function announce(text: string) {
  announcement.value = ''
  nextTick(() => { announcement.value = text })
}

const DIRECTIONS: Record<string, Point> = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } }

/** The neighbour (along a relationship) closest to the direction of the arrow. */
function neighbourTowards(key: string, dir: Point): string | null {
  const from = centre(key)
  let best: string | null = null
  let bestScore = Infinity
  for (const r of props.relations) {
    const other = sourceOf(r) === key ? targetOf(r) : targetOf(r) === key ? sourceOf(r) : null
    if (!other) continue
    const c = centre(other)
    const dx = c.x - from.x
    const dy = c.y - from.y
    const along = dx * dir.x + dy * dir.y
    const across = Math.abs(dx * dir.y - dy * dir.x)
    if (along <= 0 || across > along * 1.8) continue
    const score = along + across * 1.5
    if (score < bestScore) {
      bestScore = score
      best = other
    }
  }
  return best
}

const between = (a: string, b: string) => props.relations.filter(r =>
  (sourceOf(r) === a && targetOf(r) === b) || (sourceOf(r) === b && targetOf(r) === a))

/**
 * Arriving at `to` from `from`: who it is and what it is to `from` ("Elsa Marin: figlia (Famiglia)"),
 * the label when `to` is the source, the reverse label when it is the target, else the kind alone.
 */
function describeStep(from: string, to: string) {
  const ties = between(from, to).map((r) => {
    const words = sourceOf(r) === to ? r.label : r.reverseLabel
    return words ? `${words} (${label('relationKind', r.kind)})` : label('relationKind', r.kind)
  })
  return t('relations.map.traversed', { name: nameOf(to), relations: ties.join(', ') })
}

/** Tabbing or clicking to another node, or leaving the map, forgets the step. */
function onFocusIn(event: FocusEvent) {
  const key = (event.target as HTMLElement).closest<HTMLElement>('.vue-flow__node')?.dataset.id
  if (stepped.value && key !== stepped.value.to) stepped.value = null
}

function onFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as globalThis.Node | null)) stepped.value = null
}

/** The pair's one relationship opens in the editor; with several, the pair opens with all of them. */
function openPair(a: string, b: string) {
  const ties = between(a, b)
  if (ties.length === 1) {
    onPick(a, b, ties[0]!.id)
    return
  }
  selection.value = { type: 'edge', a, b }
  emit('activate')
}

function onKeydown(event: KeyboardEvent) {
  const el = (event.target as HTMLElement).closest<HTMLElement>('.vue-flow__node')
  if (event.key === 'Escape' && (selection.value || stepped.value)) {
    selection.value = null
    stepped.value = null
    return
  }
  const key = el?.dataset.id
  if (!key || !props.keys.includes(key)) return

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const step = stepped.value
    if (step && step.to === key && between(step.from, key).length) {
      openPair(step.from, key)
      return
    }
    selection.value = { type: 'node', key }
    emit('activate')
    return
  }
  const dir = DIRECTIONS[event.key]
  if (!dir || event.altKey || event.metaKey || event.ctrlKey) return
  event.preventDefault()

  if (event.shiftKey) {
    // Shift and an arrow move the node (spec 6, P1).
    if (!props.editable) return
    const p = positions[key] ?? { x: 0, y: 0 }
    save({ [key]: { x: p.x + dir.x * 10, y: p.y + dir.y * 10 } })
    announce(t('relations.map.moved', { name: nameOf(key) }))
    ensureVisible(key)
    return
  }

  const next = neighbourTowards(key, dir)
  if (!next) {
    announce(t('relations.map.noNeighbour'))
    return
  }
  if (selection.value) selection.value = { type: 'node', key: next }
  stepped.value = { from: key, to: next }
  focusNode(next)
  announce(describeStep(key, next))
}

defineExpose({
  fit,
  zoomIn: () => zoomIn({ duration: duration.value }),
  zoomOut: () => zoomOut({ duration: duration.value }),
  placeNew,
  layoutAll,
  reshape,
  focusNode,
  reveal: (key: string) => nextTick(() => ensureVisible(key)),
})
</script>

<template>
  <div
    ref="root"
    class="relations-canvas relative size-full"
    role="region"
    :aria-label="t('relations.map.region', { name: map.name })"
    @keydown="onKeydown"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <p :id="helpId" class="sr-only">{{ editable ? t('relations.selection.keyboard') : t('relations.selection.keyboardPhone') }}</p>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
    <VueFlow
      :id="flowId"
      :nodes="nodes"
      :edges="edges"
      :min-zoom="0.25"
      :max-zoom="2"
      :nodes-draggable="editable"
      :nodes-connectable="editable"
      :elements-selectable="false"
      :disable-keyboard-a11y="true"
      :nodes-focusable="true"
      :edges-focusable="false"
      :delete-key-code="null"
      :selection-key-code="null"
      :multi-selection-key-code="null"
      :zoom-on-double-click="false"
      :connection-mode="ConnectionMode.Loose"
      :connection-radius="24"
      :is-valid-connection="isValidConnection"
      :connection-line-options="{ style: { stroke: 'var(--ui-primary)', strokeWidth: 1.5, strokeDasharray: '4 3' } }"
      :node-drag-threshold="3"
      :pan-on-scroll="false"
      class="relations-flow"
      @node-click="onNodeClick"
      @edge-click="onEdgeClick"
      @pane-click="selection = null"
      @connect="onConnect"
      @node-drag-start="onDragStart"
      @node-drag-stop="onDragStop"
      @nodes-initialized="onInitialized"
    >
      <template #node-entity="nodeProps">
        <RelationsMapNode :id="nodeProps.id" :data="nodeProps.data" :selected="nodeProps.selected" />
      </template>
      <template #edge-relation="edgeProps">
        <RelationsMapEdge
          :id="edgeProps.id"
          :source-node="edgeProps.sourceNode"
          :target-node="edgeProps.targetNode"
          :data="edgeProps.data"
          :selected="edgeProps.selected"
        />
      </template>
      <Panel position="bottom-right" class="relations-zoom">
        <slot name="controls" />
      </Panel>
    </VueFlow>
  </div>
</template>

<style>
.relations-flow {
  background: var(--ui-bg);
}
.relations-flow .vue-flow__node {
  border-radius: 6px;
  cursor: pointer;
}
.relations-flow .vue-flow__node.draggable {
  cursor: grab;
}
.relations-flow .vue-flow__node.dragging {
  cursor: grabbing;
}
.relations-flow .vue-flow__node:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 4px;
}
.relations-flow .vue-flow__edge {
  cursor: pointer;
}
.relations-flow .vue-flow__connection-path {
  fill: none;
}
.relations-zoom.vue-flow__panel {
  margin: 0.75rem;
}
</style>
