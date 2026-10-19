<script setup lang="ts">
import '@vue-flow/core/dist/style.css'
import { MarkerType, VueFlow, useVueFlow } from '@vue-flow/core'
import type { Connection, EdgeMouseEvent, NodeChange, NodeDragEvent, NodeMouseEvent } from '@vue-flow/core'
import { usePreferredReducedMotion, useElementSize } from '@vueuse/core'
import { QUEST_KINDS, SCENE_STATUSES } from '#shared/utils/constants'
import type { SceneStatus } from '#shared/types/domain'
import type { Scene, SceneLink } from '#shared/types/entities'
import type { SceneNodeData } from './GraphNode.vue'
import { LABEL_GAP, LABEL_W, NODE_W, labelHeight, type ChoiceEdgeData } from './GraphEdge.vue'
import { hasCondition } from './ChoiceSentence.vue'

/**
 * The flow graph (spec 4.5 "Grafo", DESIGN.md "Game flow graph"): one node per scene, laid out by
 * default in one column per chapter, acts as faint bands; a moved node keeps its place (drag, or the
 * arrows on a selected node). Dragging from a scene's right handle onto another scene adds a choice.
 * Selecting a scene lights every path from Inizio to it. A choice to a scene in the trash keeps its
 * label, marked as an error, with no line. On the phone the canvas pans and pinches only.
 */
const props = withDefaults(defineProps<{
  /** Desktop: nodes can be moved and linked. */
  interactive?: boolean
  /** The filters of the flow page: scenes outside them fade. */
  act?: string | null
  strand?: string | null
}>(), { interactive: true, act: null, strand: null })

const selected = defineModel<string | null>('selected', { default: null })
const emit = defineEmits<{ connect: [from: string, to: string], edit: [linkId: string], inspect: [sceneId: string, viaKeyboard: boolean] }>()

const FLOW_ID = 'dramatis-flow'
/** Node, its choice labels, room for the curves. */
const COLUMN = NODE_W + LABEL_GAP + LABEL_W + 104
const ACT_GAP = 64
const ROW_GAP = 52
const LABEL_SPACE = 6

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const { analysis } = useFlow()
const toast = useToast()
const reduced = usePreferredReducedMotion()
const { fitView, zoomIn, zoomOut, setCenter, setViewport, findNode, viewport, ariaLiveMessage, onInit } = useVueFlow(FLOW_ID)

const duration = computed(() => (reduced.value === 'reduce' ? 0 : 300))
const canvas = ref<HTMLElement | null>(null)
const { width: canvasWidth, height: canvasHeight } = useElementSize(canvas)

// ---------------------------------------------------------------- choices and their labels

const byPosition = (a: SceneLink, b: SceneLink) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)

/** Each scene's choices in the order the player sees them. */
const choicesOf = computed(() => {
  const map = new Map<string, SceneLink[]>()
  for (const link of [...store.rows.links].sort(byPosition)) map.set(link.fromSceneId, [...(map.get(link.fromSceneId) ?? []), link])
  return map
})

const hasRules = (link: SceneLink) => store.modules.variables && (hasCondition(link) || link.effects.length > 0)
const isBroken = (link: SceneLink) => !store.get('scenes', link.toSceneId)
/** A label's second line holds the rules as chips, or says that the target is in the trash. */
const heightOf = (link: SceneLink) => labelHeight(link.label, store.modules.variables && hasCondition(link), hasRules(link) || isBroken(link))

/** Offsets of each choice's label from the middle of its scene, and the height of the stack. */
const ports = computed(() => {
  const offsets = new Map<string, number>()
  const stacks = new Map<string, number>()
  for (const [sceneId, links] of choicesOf.value) {
    const heights = links.map(heightOf)
    const total = heights.reduce((n, h) => n + h, 0) + LABEL_SPACE * (links.length - 1)
    let y = -total / 2
    links.forEach((link, i) => {
      offsets.set(link.id, y + heights[i]! / 2)
      y += heights[i]! + LABEL_SPACE
    })
    stacks.set(sceneId, total)
  }
  return { offsets, stacks }
})

/** A scene's height as drawn (title on one or two lines, the ending and unreachable lines). */
function nodeHeight(scene: Scene) {
  return 76 + ((scene.title || '').length > 26 ? 20 : 0) + (scene.ending ? 24 : 0) + (unreachable.value.has(scene.id) ? 24 : 0)
}

// ---------------------------------------------------------------- layout

/** One column per chapter in reading order, a wider gap between acts (spec 4.5); rows leave room for the labels. */
const defaults = computed(() => {
  const map = new Map<string, { x: number, y: number }>()
  let x = 0
  let lastPart: string | null | undefined
  for (const chapter of store.orderedChapters) {
    const scenes = store.chapterScenes(chapter.id)
    if (!scenes.length) continue
    if (lastPart !== undefined && chapter.partId !== lastPart) x += ACT_GAP
    let center = 0
    let previousHalf = 0
    scenes.forEach((scene, row) => {
      const height = nodeHeight(scene)
      const half = Math.max(height, ports.value.stacks.get(scene.id) ?? 0) / 2
      center = row === 0 ? half : center + previousHalf + ROW_GAP + half
      previousHalf = half
      map.set(scene.id, { x, y: Math.round(center - height / 2) })
    })
    lastPart = chapter.partId
    x += COLUMN
  }
  return map
})

const positionOf = (scene: Scene) => scene.flowPosition ?? defaults.value.get(scene.id) ?? { x: 0, y: 0 }

// ---------------------------------------------------------------- the legend's statuses, the page's filters

const hiddenStatuses = ref(new Set<SceneStatus>())

function toggleStatus(status: SceneStatus) {
  const next = new Set(hiddenStatuses.value)
  if (next.has(status)) next.delete(status)
  else next.add(status)
  hiddenStatuses.value = next
}

/** Quest strands, for the dots on the nodes (module quests). */
const questsById = computed(() => new Map(store.modules.quests ? store.rows.strands.filter(s => QUEST_KINDS.includes(s.kind)).map(q => [q.id, q]) : []))

const partOf = (scene: Scene) => store.get('chapters', scene.chapterId)?.partId ?? null
const isDim = (scene: Scene) =>
  hiddenStatuses.value.has(scene.status)
  || (!!props.strand && !scene.strandIds.includes(props.strand))
  || (!!props.act && partOf(scene) !== props.act)

const statusLegend = computed(() => SCENE_STATUSES.map(status => ({
  status,
  label: label('sceneStatus', status),
  icon: statusIcon('scene', status),
  hidden: hiddenStatuses.value.has(status),
  count: store.rows.scenes.filter(s => s.status === status).length,
})))

// ---------------------------------------------------------------- paths to the selection

/** Every edge on a path from the start to the selected scene. */
const litEdges = computed(() => {
  const flow = analysis.value
  const target = selected.value
  if (!flow?.hasStart || !target || !flow.reachable.has(target)) return new Set<string>()
  const incoming = new Map<string, string[]>()
  for (const edge of flow.edges) incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from])
  const reachesTarget = new Set<string>([target])
  const queue = [target]
  while (queue.length) {
    const current = queue.shift()!
    for (const from of incoming.get(current) ?? []) {
      if (!reachesTarget.has(from)) {
        reachesTarget.add(from)
        queue.push(from)
      }
    }
  }
  return new Set(flow.edges.filter(e => flow.reachable.has(e.from) && reachesTarget.has(e.to) && e.from !== target).map(e => e.linkId ?? `implicit:${e.from}`))
})

// ---------------------------------------------------------------- nodes and edges

const unreachable = computed(() => new Set(analysis.value?.unreachable ?? []))

/** What a screen reader hears on a node: everything the node shows, the quest dots by name. */
function nodeLabel(scene: Scene, quests: { name: string }[]) {
  const parts = [scene.code, scene.title || t('common.untitled.scene')]
  if (store.modules.scene_kinds) parts.push(label('sceneKind', scene.kind))
  parts.push(label('sceneStatus', scene.status))
  if (store.project?.startSceneId === scene.id) parts.push(t('flow.node.start'))
  if (scene.ending) parts.push(scene.endingLabel ? t('flow.node.endingNamed', { label: scene.endingLabel }) : term('ending'))
  if (unreachable.value.has(scene.id)) parts.push(t('flow.node.unreachable'))
  if (quests.length) parts.push(t('flow.node.quests', { names: quests.map(q => q.name).join(', ') }, quests.length))
  const count = choicesOf.value.get(scene.id)?.length ?? 0
  if (count) parts.push(t('flow.node.choices', { n: count }, count))
  return parts.join(', ')
}

const nodes = computed(() => store.orderedScenes.map((scene) => {
  const quests = scene.strandIds.map(id => questsById.value.get(id)).filter(q => !!q).map(q => ({ id: q.id, name: q.name, color: q.color }))
  const data: SceneNodeData = {
    sceneId: scene.id,
    start: store.project?.startSceneId === scene.id,
    unreachable: unreachable.value.has(scene.id),
    dim: isDim(scene),
    quests,
    connectable: props.interactive,
  }
  return {
    id: scene.id,
    type: 'scene',
    position: { ...positionOf(scene) },
    selected: scene.id === selected.value,
    draggable: props.interactive,
    connectable: props.interactive,
    deletable: false,
    ariaLabel: nodeLabel(scene, quests),
    // Vue Flow calls every node "node", in English.
    domAttributes: { 'aria-roledescription': t('flow.graph.nodeRole') },
    data,
  }
}))

const edges = computed(() => {
  const scenes = new Map(store.rows.scenes.map(s => [s.id, s]))
  const lanes = new Map<string, number>()
  let returns = 0
  const flowing = (analysis.value?.edges ?? []).map((edge) => {
    const id = edge.linkId ?? `implicit:${edge.from}`
    const link = edge.linkId ? store.get('links', edge.linkId) : undefined
    const from = scenes.get(edge.from)!
    const to = scenes.get(edge.to)!
    const a = positionOf(from)
    const b = positionOf(to)
    const lit = litEdges.value.has(id)
    let route: ChoiceEdgeData['route'] = 'forward'
    if (edge.from === edge.to) route = 'loop'
    else if (!link && Math.abs(b.x - a.x) < NODE_W / 2 && b.y > a.y) route = 'down'
    else if (b.x + NODE_W < a.x - 24) route = 'return'
    else if (b.x < a.x + NODE_W + (link ? LABEL_GAP + LABEL_W : 0) + 24) route = 'back'
    let lane = 0
    if (route === 'back' || route === 'loop' || route === 'return') {
      lane = lanes.get(edge.from) ?? 0
      lanes.set(edge.from, lane + 1)
    }
    // Returns run above every scene, under the chapter titles and clear of the "Inizio" tab.
    const corridor = bands.value.top + 70 + (route === 'return' ? (returns++ % 4) * 5 : 0)
    const data: ChoiceEdgeData = {
      linkId: edge.linkId,
      conditional: !!link && store.modules.variables && hasCondition(link),
      port: link ? ports.value.offsets.get(link.id) ?? 0 : 0,
      route,
      lane,
      corridor,
      lit,
      dim: isDim(from) || isDim(to),
    }
    return {
      id,
      source: edge.from,
      target: edge.to,
      sourceHandle: route === 'down' ? 'out-bottom' : 'out',
      targetHandle: route === 'down' ? 'in-top' : route === 'forward' ? 'in' : 'in-back',
      type: 'choice',
      focusable: false,
      deletable: false,
      zIndex: lit ? 1 : 0,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: lit ? 'var(--ui-primary)' : 'var(--ui-border-accented)' },
      data,
    }
  })
  // A choice to a scene in the trash leads nowhere: its label stays in the stack, marked, with no line.
  const broken = store.rows.links.filter(link => scenes.has(link.fromSceneId) && !scenes.has(link.toSceneId)).map((link) => {
    const data: ChoiceEdgeData = {
      linkId: link.id,
      conditional: store.modules.variables && hasCondition(link),
      port: ports.value.offsets.get(link.id) ?? 0,
      route: 'broken',
      lane: 0,
      corridor: 0,
      lit: false,
      dim: isDim(scenes.get(link.fromSceneId)!),
    }
    return { id: link.id, source: link.fromSceneId, target: link.fromSceneId, sourceHandle: 'out', targetHandle: 'in', type: 'choice', focusable: false, deletable: false, zIndex: 0, data }
  })
  return [...flowing, ...broken]
})

// ---------------------------------------------------------------- acts and chapters on the canvas

const bands = computed(() => {
  const positions = new Map(nodes.value.map(n => [n.id, n.position]))
  if (!positions.size) return { acts: [], chapters: [], top: 0, bottom: 0 }
  const scenes = new Map(store.rows.scenes.map(s => [s.id, s]))
  const top = Math.min(...[...positions.entries()].map(([id, p]) => p.y - Math.max(0, ((ports.value.stacks.get(id) ?? 0) - nodeHeight(scenes.get(id)!)) / 2))) - 112
  const bottom = Math.max(...[...positions.entries()].map(([id, p]) => p.y + nodeHeight(scenes.get(id)!) + Math.max(0, ((ports.value.stacks.get(id) ?? 0) - nodeHeight(scenes.get(id)!)) / 2))) + 40
  const acts: { id: string, x: number, y: number, width: number, height: number, label: string, title: string }[] = []
  const chapters: { id: string, x: number, y: number, label: string, title: string }[] = []
  const ranges = new Map<string, { min: number, max: number, number: number, title: string }>()
  for (const chapter of store.orderedChapters) {
    const ids = store.chapterScenes(chapter.id).map(s => s.id)
    const points = ids.map(id => positions.get(id)).filter(p => !!p)
    if (!points.length) continue
    const minX = Math.min(...points.map(p => p.x))
    chapters.push({ id: chapter.id, x: minX, y: top + 44, label: `${term('chapter')} ${store.chapterNumber(chapter.id)}`, title: chapter.title || t('common.untitled.chapter') })
    if (!chapter.partId) continue
    const range = ranges.get(chapter.partId) ?? { min: Infinity, max: -Infinity, number: store.orderedParts.findIndex(p => p.id === chapter.partId) + 1, title: store.get('parts', chapter.partId)?.title ?? '' }
    range.min = Math.min(range.min, minX)
    range.max = Math.max(range.max, ...ids.map(id => (positions.get(id)?.x ?? 0) + NODE_W + ((choicesOf.value.get(id)?.length ?? 0) ? LABEL_GAP + LABEL_W : 0)))
    ranges.set(chapter.partId, range)
  }
  for (const [id, range] of ranges) {
    acts.push({ id, x: range.min - 28, y: top, width: range.max - range.min + 56, height: bottom - top, label: `${term('part')} ${range.number}`, title: range.title })
  }
  return { acts, chapters, top, bottom }
})

// ---------------------------------------------------------------- interaction

function savePosition(id: string, position: { x: number, y: number }) {
  store.patchSoon('scenes', id, { flowPosition: { x: Math.round(position.x), y: Math.round(position.y) } }, 500)
}

function onDragStop(event: NodeDragEvent) {
  for (const node of event.nodes) savePosition(node.id, node.position)
}

function onNodesChange(changes: NodeChange[]) {
  for (const change of changes) {
    // Arrow keys on a selected node move it without a drag: those moves are kept too.
    if (change.type === 'position' && change.dragging === false && change.position) savePosition(change.id, change.position)
    if (change.type === 'select' && change.selected) selected.value = change.id
  }
}

function onNodeClick(event: NodeMouseEvent) {
  selected.value = event.node.id
  if (!props.interactive) emit('inspect', event.node.id, false)
}

function onEdgeClick(event: EdgeMouseEvent) {
  const data = event.edge.data as ChoiceEdgeData | undefined
  if (data?.linkId) emit('edit', data.linkId)
  else selected.value = event.edge.source
}

/** Enter on a focused node opens its details: the keyboard route to everything a drag does. */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  const id = (event.target as HTMLElement | null)?.closest<HTMLElement>('.vue-flow__node')?.dataset.id
  if (!id) return
  selected.value = id
  emit('inspect', id, true)
}

// Linking: dropping on the target's handle fires `connect`; dropping anywhere on another scene counts too.
let connecting: { id: string, x: number, y: number } | null = null
let connected = false
const pointOf = (event?: MouseEvent | TouchEvent) => {
  const point = event && ('changedTouches' in event ? event.changedTouches[0] : event)
  return point ? { x: point.clientX, y: point.clientY } : null
}
function onConnectStart(event: { nodeId?: string | null, event?: MouseEvent | TouchEvent }) {
  const point = pointOf(event.event)
  connecting = event.nodeId ? { id: event.nodeId, x: point?.x ?? Number.NaN, y: point?.y ?? Number.NaN } : null
  connected = false
}
function onConnect(connection: Connection) {
  connected = true
  if (connection.source && connection.target) emit('connect', connection.source, connection.target)
}
function onConnectEnd(event?: MouseEvent | TouchEvent) {
  const from = connecting
  connecting = null
  const point = pointOf(event)
  if (!from || !point) return
  // A click on the handle is not a drag: there is nothing to link.
  if (Math.hypot(point.x - from.x, point.y - from.y) < 8) return
  setTimeout(() => {
    if (connected) return
    const id = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('.vue-flow__node')?.dataset.id
    // Back on the scene it started from: a drag given up. A choice to the same scene goes through the form.
    if (id && id !== from.id) emit('connect', from.id, id)
  }, 0)
}

// ---------------------------------------------------------------- viewport

const moved = computed(() => store.rows.scenes.filter(s => s.flowPosition))

/** The whole graph when it is readable that way; otherwise its beginning at a reading size. */
function initialView() {
  const list = nodes.value
  if (!list.length) return
  const minX = Math.min(...list.map(n => n.position.x)) - 40
  const maxX = Math.max(...list.map(n => n.position.x)) + COLUMN - 80
  const { top, bottom } = bands.value
  const fit = Math.min(canvasWidth.value / (maxX - minX), canvasHeight.value / (bottom - top))
  if (fit >= 0.72) {
    fitView({ padding: 0.06, maxZoom: 1 })
    return
  }
  const zoom = canvasWidth.value < 640 ? 0.7 : 0.82
  setViewport({ x: -minX * zoom + 8, y: -top * zoom + 8, zoom })
}

async function resetLayout() {
  const before = moved.value.map(s => ({ id: s.id, position: { ...s.flowPosition! } }))
  if (!before.length) return
  await Promise.all(before.map(item => store.update('scenes', item.id, { flowPosition: null }).catch(() => {})))
  nextTick(initialView)
  toast.add({
    title: t('flow.graph.layoutReset'),
    icon: 'i-lucide-columns-3',
    actions: [{
      label: t('common.actions.undo'),
      onClick: () => { Promise.all(before.map(item => store.update('scenes', item.id, { flowPosition: item.position }).catch(() => {}))) },
    }],
  })
}

let resolveReady: () => void
const ready = new Promise<void>((resolve) => { resolveReady = resolve })
onInit(() => {
  initialView()
  localiseDescriptions()
  resolveReady()
})

/** Centres a scene on the canvas ("Mostra"), at a readable zoom. */
async function centerOn(id: string) {
  await ready
  await nextTick()
  const node = findNode(id)
  const position = node?.computedPosition ?? nodes.value.find(n => n.id === id)?.position
  if (!position) return
  const width = node?.dimensions.width || NODE_W
  const height = node?.dimensions.height || 90
  await setCenter(position.x + width / 2 + LABEL_W / 2, position.y + height / 2, { zoom: Math.max(viewport.value.zoom, 0.9), duration: duration.value })
}

const unreachableList = computed(() => store.orderedScenes.filter(s => unreachable.value.has(s.id)).map(s => s.id))
let cycle = 0
function showNextUnreachable() {
  const list = unreachableList.value
  if (!list.length) return
  const id = list[cycle % list.length]!
  cycle++
  selected.value = id
  centerOn(id)
}

defineExpose({ centerOn })

// Vue Flow describes its keyboard use in English: say it in the interface language.
function localiseDescriptions() {
  const node = document.getElementById(`vue-flow__node-desc-${FLOW_ID}`)
  if (node) node.textContent = t('flow.graph.a11yNodes')
  const edge = document.getElementById(`vue-flow__edge-desc-${FLOW_ID}`)
  if (edge) edge.textContent = ''
}
watch(ariaLiveMessage, (message) => {
  if (message?.startsWith('Moved selected node')) ariaLiveMessage.value = t('flow.graph.a11yMoved')
})
</script>

<template>
  <div class="flow-graph @container flex size-full flex-col">
    <div class="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-1 border-b border-default px-2 py-1.5 sm:px-3">
      <UTooltip :text="t('flow.graph.fit')">
        <UButton icon="i-lucide-maximize" color="neutral" variant="ghost" size="sm" class="max-lg:size-11 max-lg:justify-center" :aria-label="t('flow.graph.fit')" @click="fitView({ padding: 0.06, duration })" />
      </UTooltip>
      <UTooltip :text="t('flow.graph.zoomOut')">
        <UButton icon="i-lucide-zoom-out" color="neutral" variant="ghost" size="sm" class="max-lg:size-11 max-lg:justify-center" :aria-label="t('flow.graph.zoomOut')" @click="zoomOut({ duration })" />
      </UTooltip>
      <UTooltip :text="t('flow.graph.zoomIn')">
        <UButton icon="i-lucide-zoom-in" color="neutral" variant="ghost" size="sm" class="max-lg:size-11 max-lg:justify-center" :aria-label="t('flow.graph.zoomIn')" @click="zoomIn({ duration })" />
      </UTooltip>
      <template v-if="interactive">
        <UTooltip :text="moved.length ? t('flow.graph.resetHelp') : t('flow.graph.resetNothing')">
          <UButton icon="i-lucide-columns-3" color="neutral" variant="ghost" size="sm" :label="t('flow.graph.reset')" :disabled="!moved.length" @click="resetLayout" />
        </UTooltip>
      </template>
      <UButton
        v-if="unreachableList.length"
        icon="i-lucide-unlink"
        color="warning"
        variant="ghost"
        size="sm"
        class="max-lg:min-h-11"
        :aria-label="t('flow.graph.unreachableShow', { n: unreachableList.length }, unreachableList.length)"
        @click="showNextUnreachable"
      >
        <span class="tabular sm:hidden">{{ unreachableList.length }}</span>
        <span class="max-sm:hidden">{{ t('flow.graph.unreachable', { n: unreachableList.length }, unreachableList.length) }}</span>
      </UButton>

      <span class="flex-1" />

      <!-- The legend: what the lines mean, and the statuses as filters. -->
      <ul class="hidden items-center gap-3 pe-1 text-xs text-toned @4xl:flex" :aria-label="t('flow.legend.lines')">
        <li class="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--ui-border-accented)" stroke-width="1" /></svg>
          {{ t('flow.legend.choice') }}
        </li>
        <li class="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--ui-border-accented)" stroke-width="1" stroke-dasharray="6 4" /></svg>
          <UIcon name="i-lucide-lock" class="-ms-0.5 size-3" />{{ t('flow.legend.conditional') }}
        </li>
        <li class="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="22" y2="4" stroke="var(--ui-border-accented)" stroke-width="1" stroke-dasharray="1 4" stroke-linecap="round" /></svg>
          {{ t('flow.legend.continuation') }}
        </li>
      </ul>
      <span class="mx-1 hidden h-5 w-px bg-(--ui-border) @4xl:block" aria-hidden="true" />
      <UPopover :content="{ align: 'end' }">
        <UButton icon="i-lucide-list-filter" color="neutral" variant="ghost" size="sm" :label="t('flow.legend.title')" class="max-lg:min-h-11" :trailing-icon="hiddenStatuses.size ? 'i-lucide-dot' : undefined" />
        <template #content>
          <div class="w-72 space-y-4 p-3 text-sm">
            <ul class="space-y-1.5" :aria-label="t('flow.legend.lines')">
              <li class="flex items-center gap-2 text-toned">
                <svg width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" stroke="var(--ui-border-accented)" stroke-width="1" /></svg>
                {{ t('flow.legend.choice') }}
              </li>
              <li class="flex items-center gap-2 text-toned">
                <svg width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" stroke="var(--ui-border-accented)" stroke-width="1" stroke-dasharray="6 4" /></svg>
                <UIcon name="i-lucide-lock" class="size-3" />{{ t('flow.legend.conditional') }}
              </li>
              <li class="flex items-center gap-2 text-toned">
                <svg width="28" height="8" aria-hidden="true"><line x1="1" y1="4" x2="28" y2="4" stroke="var(--ui-border-accented)" stroke-width="1" stroke-dasharray="1 4" stroke-linecap="round" /></svg>
                {{ t('flow.legend.continuation') }}
              </li>
            </ul>
            <div class="flex items-center gap-2 text-toned">
              <svg width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" stroke="var(--ui-primary)" stroke-width="2" /></svg>
              {{ t('flow.legend.path') }}
            </div>
            <div>
              <p class="mb-1.5 text-xs text-muted">{{ t('flow.legend.statuses') }}</p>
              <ul class="grid grid-cols-2 gap-1">
                <li v-for="item in statusLegend" :key="item.status">
                  <button
                    type="button"
                    class="flex h-8 w-full items-center gap-1.5 rounded-[4.5px] px-2 max-lg:h-11 text-start outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
                    :class="item.hidden ? 'text-dimmed line-through' : 'text-toned'"
                    :aria-pressed="!item.hidden"
                    @click="toggleStatus(item.status)"
                  >
                    <UIcon :name="item.icon" class="size-4 shrink-0" :style="{ color: `var(--status-${item.status})` }" />
                    <span class="flex-1 truncate">{{ item.label }}</span>
                    <span class="tabular text-xs text-dimmed">{{ item.count }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </template>
      </UPopover>
    </div>

    <div ref="canvas" class="relative min-h-0 flex-1" @keydown="onKeydown">
      <VueFlow
        :id="FLOW_ID"
        :nodes="nodes"
        :edges="edges"
        :min-zoom="0.2"
        :max-zoom="1.6"
        :delete-key-code="null"
        :selection-key-code="null"
        :multi-selection-key-code="null"
        :nodes-draggable="interactive"
        :nodes-connectable="interactive"
        :edges-focusable="false"
        :connection-radius="36"
        :connect-on-click="false"
        :connection-line-options="{ style: { stroke: 'var(--ui-primary)', strokeWidth: 1.5 } }"
        :zoom-on-double-click="false"
        class="flow-canvas"
        @nodes-change="onNodesChange"
        @node-drag-stop="onDragStop"
        @node-click="onNodeClick"
        @edge-click="onEdgeClick"
        @pane-click="selected = null"
        @connect-start="onConnectStart"
        @connect="onConnect"
        @connect-end="onConnectEnd"
      >
        <template #zoom-pane>
          <div
            v-for="band in bands.acts"
            :key="band.id"
            class="pointer-events-none absolute start-0 top-0 -z-10 rounded-[9px] bg-muted"
            :style="{ transform: `translate(${band.x}px, ${band.y}px)`, width: `${band.width}px`, height: `${band.height}px` }"
            aria-hidden="true"
          >
            <p class="flex min-w-0 items-baseline gap-1.5 px-4 pt-4">
              <span class="position-line shrink-0">{{ band.label }}</span>
              <template v-if="band.title">
                <span class="text-xs text-dimmed">·</span>
                <span class="voice-author truncate text-xs font-semibold text-muted">{{ band.title }}</span>
              </template>
            </p>
          </div>
          <p
            v-for="chapter in bands.chapters"
            :key="chapter.id"
            class="pointer-events-none absolute start-0 top-0 -z-10 truncate text-xs text-muted"
            :style="{ transform: `translate(${chapter.x}px, ${chapter.y}px)`, width: `${NODE_W + LABEL_W}px` }"
            aria-hidden="true"
          >
            <span class="font-medium">{{ chapter.label }}</span> · <span class="voice-author font-semibold">{{ chapter.title }}</span>
          </p>
        </template>

        <template #node-scene="nodeProps">
          <FlowGraphNode :id="nodeProps.id" :data="nodeProps.data" :selected="nodeProps.selected" />
        </template>
        <template #edge-choice="edgeProps">
          <FlowGraphEdge
            :id="edgeProps.id"
            :source-x="edgeProps.sourceX"
            :source-y="edgeProps.sourceY"
            :target-x="edgeProps.targetX"
            :target-y="edgeProps.targetY"
            :source-position="edgeProps.sourcePosition"
            :target-position="edgeProps.targetPosition"
            :data="edgeProps.data"
            :marker-end="edgeProps.markerEnd"
            @edit="(id: string) => emit('edit', id)"
          />
        </template>
      </VueFlow>
    </div>
  </div>
</template>

<style>
.flow-canvas .vue-flow__node {
  border-radius: 6px;
}
.flow-canvas .vue-flow__node:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 3px;
}
.flow-canvas .vue-flow__edge-labels {
  z-index: 1;
}
</style>
