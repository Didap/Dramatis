<script lang="ts">
import type { WorldRefType } from '#shared/types/domain'

/** What a node of the relationship map shows. Positions and selection live in Vue Flow. */
export interface MapNodeData {
  type: WorldRefType
  name: string
  imageId: string | null
  /** The type in words (Luogo, Oggetto, Gruppo), under the name of everything but characters. */
  typeLabel?: string
  /** Relationships of this entity with entities that are not on the map. */
  outside: number
  /** Out of the followspot (another node or edge is selected). */
  faded: boolean
  /** Desktop: the node can be dragged and linked from its knob. */
  editable: boolean
}

/**
 * The shape of each kind of node (DESIGN.md "Relationship map"): a 3:4 portrait for a character, a
 * rounded square for a place, a diamond for an object, a pill for a group. Sizes in px; the name hangs
 * below the shape, outside the box Vue Flow measures, so edges meet the shape itself.
 */
export const NODE_SHAPES: Record<WorldRefType, { width: number, height: number, outline: 'rect' | 'diamond' }> = {
  character: { width: 36, height: 48, outline: 'rect' },
  location: { width: 40, height: 40, outline: 'rect' },
  object: { width: 40, height: 40, outline: 'diamond' },
  group: { width: 56, height: 32, outline: 'rect' },
}

export interface Point { x: number, y: number }

/** Top-left position of a node whose centre is `center`. */
export function topLeft(type: WorldRefType, center: Point): Point {
  const shape = NODE_SHAPES[type]
  return { x: Math.round(center.x - shape.width / 2), y: Math.round(center.y - shape.height / 2) }
}

/** Centre of a node placed at `position` (its top-left corner). */
export function centreOf(type: WorldRefType, position: Point): Point {
  const shape = NODE_SHAPES[type]
  return { x: position.x + shape.width / 2, y: position.y + shape.height / 2 }
}

/** Distance from `p` to the segment from `a` to `b`. */
function toSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Free places for `count` new nodes around `center`, on rings at `gap` px from each other,
 * away from the centres already `taken` and off the `lines` already drawn (where a node would hide
 * an edge and its labels); places for which `prefer` holds (on screen) come first.
 * Deterministic, so the same map gets the same layout.
 */
export function freeSpots(taken: Point[], count: number, center: Point, prefer: (p: Point) => boolean = () => true, gap = 170, lines: [Point, Point][] = []): Point[] {
  const chosen: Point[] = []
  const busy = [...taken]
  const isFree = (p: Point) => busy.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= gap * 0.85)
    && lines.every(([a, b]) => toSegment(p, a, b) >= gap * 0.35)
  for (const strict of [true, false]) {
    for (let ring = 0; chosen.length < count && ring < 40; ring++) {
      const slots = ring === 0 ? 1 : ring * 6
      for (let i = 0; i < slots && chosen.length < count; i++) {
        const angle = (i / slots) * Math.PI * 2 + ring * 0.5
        const spot = { x: Math.round(center.x + Math.cos(angle) * ring * gap), y: Math.round(center.y + Math.sin(angle) * ring * gap * 0.8) }
        if (isFree(spot) && (!strict || prefer(spot))) {
          chosen.push(spot)
          busy.push(spot)
        }
      }
    }
  }
  return chosen
}
</script>

<script setup lang="ts">
import { Handle, Position, useVueFlow } from '@vue-flow/core'

/** A node of the relationship map: ink only, coded by shape, the name beneath (author's voice). */
defineOptions({ inheritAttrs: false })
const props = defineProps<{ id: string, data: MapNodeData, selected?: boolean }>()

const { t } = useI18n()
const { connectionStartHandle } = useVueFlow()
/** While a link is being dragged, the whole shape accepts the drop. */
const connecting = computed(() => !!connectionStartHandle.value)
const shape = computed(() => NODE_SHAPES[props.data.type])
const icon = computed(() => REF_ICONS[props.data.type])
</script>

<template>
  <div
    class="relations-node relative"
    :class="[`relations-node--${data.type}`, { 'is-selected': selected, 'is-faded': data.faded }]"
    :style="{ width: `${shape.width}px`, height: `${shape.height}px` }"
  >
    <div class="relations-node__shape absolute inset-0 grid place-items-center" aria-hidden="true">
      <DEntityAvatar
        v-if="data.type === 'character'"
        :name="data.name"
        :image-id="data.imageId"
        size="md"
        shape="portrait"
        class="relations-node__portrait"
      />
      <span v-else-if="data.type === 'object'" class="relations-node__diamond grid place-items-center">
        <UIcon :name="icon" class="relations-node__icon size-4" />
      </span>
      <UIcon v-else :name="icon" class="relations-node__icon size-4" />
    </div>

    <span
      v-if="data.outside"
      class="relations-node__outside tabular"
      :title="t('relations.map.outside', { n: data.outside }, data.outside)"
      aria-hidden="true"
    >+{{ data.outside }}</span>

    <span class="relations-node__label" aria-hidden="true">
      <span class="voice-author relations-node__name">{{ data.name }}</span>
      <span v-if="data.typeLabel" class="relations-node__type">{{ data.typeLabel }}</span>
    </span>

    <Handle
      id="in"
      type="target"
      :position="Position.Top"
      :connectable-start="false"
      class="relations-node__drop"
      :style="{ pointerEvents: connecting ? 'all' : 'none' }"
    />
    <Handle
      v-if="data.editable"
      id="out"
      type="source"
      :position="Position.Right"
      class="relations-node__knob"
      :title="t('relations.map.knob')"
    />
  </div>
</template>

<style>
.relations-node {
  --relations-node-ring: transparent;
  transition: opacity 200ms var(--ease-out-expo);
}
.relations-node.is-faded {
  opacity: 0.3;
}

/* The shapes: ink on the page, a 1px rule at 3:1. */
.relations-node--location .relations-node__shape,
.relations-node--group .relations-node__shape {
  background: var(--ui-bg);
  border: 1px solid var(--ui-border-accented);
  color: var(--ui-text-toned);
  box-shadow: 0 0 0 2px var(--ui-bg), 0 0 0 4px var(--relations-node-ring);
}
.relations-node--location .relations-node__shape {
  border-radius: 6px;
}
.relations-node--group .relations-node__shape {
  border-radius: 9999px;
}
.relations-node__portrait {
  outline: 1px solid var(--ui-border-accented);
  outline-offset: -1px;
  box-shadow: 0 0 0 2px var(--ui-bg), 0 0 0 4px var(--relations-node-ring);
}
.relations-node__diamond {
  width: 28px;
  height: 28px;
  transform: rotate(45deg);
  border-radius: 3px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border-accented);
  color: var(--ui-text-toned);
  box-shadow: 0 0 0 2px var(--ui-bg), 0 0 0 4px var(--relations-node-ring);
}
.relations-node__diamond .relations-node__icon {
  transform: rotate(-45deg);
}

.vue-flow__node:hover .relations-node__shape,
.vue-flow__node:hover .relations-node__diamond {
  border-color: var(--ui-text-toned);
}
.relations-node.is-selected {
  --relations-node-ring: var(--ui-primary);
}

/*
 * The name hangs below the shape, on a scrap of paper so edges passing under it do not cross the words.
 * It is part of the node: a click or a tap on the name selects it, a drag moves it.
 */
.relations-node__label {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: 9.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 1px 4px;
  border-radius: 3px;
  background: color-mix(in oklab, var(--ui-bg) 88%, transparent);
  text-align: center;
}
.relations-node__name {
  font-size: 0.8125rem;
  line-height: 1.25;
  font-weight: 600;
  color: var(--ui-text-highlighted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.relations-node__type {
  font-size: 0.6875rem;
  line-height: 1.2;
  font-weight: 500;
  color: var(--ui-text-muted);
}

/* Relationships with entities outside the map (spec 5.4). */
.relations-node__outside {
  position: absolute;
  top: -7px;
  left: calc(100% + 3px);
  padding: 0 3px;
  border-radius: 3px;
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 0.875rem;
}

/* The drop target covers the whole shape, but only while a link is being dragged. */
.vue-flow__handle.relations-node__drop {
  inset: 0;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  transform: none;
  border: 0;
  border-radius: inherit;
  background: transparent;
  opacity: 0;
}

/* The knob to drag a new relationship from (desktop). */
.vue-flow__handle.relations-node__knob {
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: var(--ui-bg);
  border: 1.5px solid var(--ui-primary);
  opacity: 0;
  transition: opacity 150ms var(--ease-out-expo);
}
.vue-flow__handle.relations-node__knob::after {
  /* A larger hit area than the dot itself. */
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 9999px;
}
.vue-flow__node:hover .relations-node__knob,
.vue-flow__node:focus-visible .relations-node__knob,
.relations-node.is-selected .relations-node__knob,
.vue-flow__handle.relations-node__knob.connecting {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .relations-node,
  .vue-flow__handle.relations-node__knob {
    transition: none;
  }
}
</style>
