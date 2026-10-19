<script lang="ts">
/** Width of a choice label beside its scene; the edge leaves from its right end. */
export const LABEL_W = 176
/** Gap between a scene's right side and its labels. */
export const LABEL_GAP = 10
/** Width of a scene node, and where across its top the edges from behind come in. */
export const NODE_W = 216
export const TARGET_HANDLE = 0.74

/** A label is 16px lines in a 1px border with 3px of padding, and 19px more for its second part (chips, or a target in the trash). */
const LABEL_FRAME = 8
const LABEL_LINE = 16
const LABEL_EXTRA = 19
/**
 * Characters of choice text that surely fit one line of a label (manuscript italic at 13px, about
 * 5.9px each and up to 6.5px in a dense line, in 162px); longer texts take two. The lock icon takes 16px.
 */
const LINE_CHARS = 22
const LOCK_CHARS = 3

/** Lines of a choice's text in its label: one, or two for a longer text (clamped there; the whole choice is in the tooltip). */
export function labelLines(text: string, locked: boolean): 1 | 2 {
  return text.trim().length > LINE_CHARS - (locked ? LOCK_CHARS : 0) ? 2 : 1
}

/** A choice's label as drawn, so the graph stacks the labels of a scene without overlap. */
export function labelHeight(text: string, locked: boolean, extra: boolean) {
  return LABEL_FRAME + labelLines(text, locked) * LABEL_LINE + (extra ? LABEL_EXTRA : 0)
}

/** An orthogonal polyline through `points` with corners rounded to 12px (or less on short legs). */
function rounded(points: [number, number][]) {
  let path = ''
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!
    const next = points[i + 1]
    if (!next) {
      path += ` L ${x} ${y}`
      break
    }
    const [px, py] = points[i - 1]!
    const r = Math.min(12, Math.hypot(x - px, y - py) / 2, Math.hypot(next[0] - x, next[1] - y) / 2)
    const inX = x - Math.sign(x - px) * r
    const inY = y - Math.sign(y - py) * r
    const outX = x + Math.sign(next[0] - x) * r
    const outY = y + Math.sign(next[1] - y) * r
    path += ` L ${inX} ${inY} Q ${x} ${y} ${outX} ${outY}`
  }
  return path
}

export interface ChoiceEdgeData {
  /** The choice, or null for the implicit continuation. */
  linkId: string | null
  conditional: boolean
  /** Vertical offset of this choice's label from the middle of its scene (labels stack in choice order). */
  port: number
  /** forward: into the target's left side; back: from the gap above (a target in the same column);
   *  return: along the corridor above every scene (a target in an earlier column, a hub);
   *  down: the continuation to the scene right below; loop: a choice back to the same scene;
   *  broken: a choice to a scene in the trash, a label with a short stub and no line onwards. */
  route: 'forward' | 'back' | 'return' | 'down' | 'loop' | 'broken'
  /** The y of the corridor that returns run along. */
  corridor: number
  /** Among a scene's back routes, which channel beside its labels this one takes. */
  lane: number
  /** On a path from the start to the selected scene. */
  lit: boolean
  dim: boolean
}
</script>

<script setup lang="ts">
import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position } from '@vue-flow/core'
import { clauseProblem, effectProblem } from '#shared/utils/flow'
import { hasCondition, useChoiceText } from './ChoiceSentence.vue'

/**
 * A choice on the flow graph (DESIGN.md): 1px in border-accented, dashed when conditional, dotted for
 * the implicit continuation; 2px accent on the paths to the selected scene. Each choice leaves its
 * scene from a label stacked beside it in the order the player reads them: the text in manuscript
 * italic on up to two lines, then the condition and the effects as mono chips (in the error colour
 * when they no longer fit their variable). A choice to a scene in the trash says so in its label.
 */
const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  data: ChoiceEdgeData
  markerEnd?: string
}>()

const emit = defineEmits<{ edit: [linkId: string] }>()

const store = useProjectStore()
const { t } = useI18n()
const text = useChoiceText()

const link = computed(() => (props.data.linkId ? store.get('links', props.data.linkId) : undefined))
const broken = computed(() => props.data.route === 'broken')
const lines = computed(() => (link.value ? labelLines(link.value.label, props.data.conditional) : 1))

const geometry = computed(() => {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, data } = props
  if (!data.linkId) {
    if (data.route === 'down') return { path: `M ${sx} ${sy} L ${tx} ${ty}` }
    const [path] = getBezierPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition: Position.Right, targetPosition: data.route === 'back' ? Position.Right : Position.Left })
    return { path }
  }
  const py = sy + data.port
  const x0 = sx + LABEL_GAP + LABEL_W
  const lead = `M ${sx} ${py} L ${x0} ${py}`
  if (data.route === 'broken') return { path: `${lead} L ${x0 + 12} ${py}` }
  if (data.route === 'back' || data.route === 'loop' || data.route === 'return') {
    // Out past the labels and along the free channel beside them. A target in an earlier column is
    // reached along the corridor above every scene, then down its own column's channel; in the end
    // every one of these comes in through the gap right above the target.
    const cx = x0 + 20 + data.lane * 10
    const gap = ty - 26
    const points: [number, number][] = [[cx, py]]
    if (data.route === 'return') {
      const channel = tx + (1 - TARGET_HANDLE) * NODE_W + LABEL_GAP + LABEL_W + 20 + data.lane * 10
      points.push([cx, data.corridor], [channel, data.corridor], [channel, gap])
    }
    else points.push([cx, gap])
    points.push([tx, gap], [tx, ty])
    return { path: `${lead} ${rounded([[x0, py], ...points])}` }
  }
  const reach = Math.max(40, (tx - x0) / 2)
  return { path: `${lead} C ${x0 + reach} ${py}, ${tx - reach} ${ty}, ${tx} ${ty}` }
})

const stroke = computed(() => {
  if (broken.value) return { stroke: 'var(--ui-error)', strokeWidth: 1, strokeDasharray: '2 3', opacity: props.data.dim ? 0.3 : 1 }
  return {
    stroke: props.data.lit ? 'var(--ui-primary)' : 'var(--ui-border-accented)',
    strokeWidth: props.data.lit ? 2 : 1,
    strokeDasharray: !props.data.linkId ? '1 4' : props.data.conditional ? '6 4' : undefined,
    strokeLinecap: !props.data.linkId ? ('round' as const) : undefined,
    opacity: props.data.dim ? 0.3 : 1,
  }
})

/** Marked: the variable is gone, or the rule (its operation or its value) does not fit the variable. */
const marked = (problem: string | null) => !!problem

const chips = computed(() => {
  const current = link.value
  if (!current || !store.modules.variables || broken.value) return []
  const list: { text: string, marked: boolean }[] = []
  if (hasCondition(current)) {
    list.push({
      text: text.conditionChip(current.conditions),
      marked: current.conditions.clauses.some(c => marked(clauseProblem(c, text.variableOf(c.variableId)))),
    })
  }
  for (const effect of current.effects) list.push({ text: text.effectChip(effect), marked: marked(effectProblem(effect, text.variableOf(effect.variableId))) })
  return list
})
</script>

<template>
  <BaseEdge :id="id" :path="geometry.path" :marker-end="broken ? undefined : markerEnd" :style="stroke" :interaction-width="14" />
  <EdgeLabelRenderer v-if="link">
    <button
      type="button"
      tabindex="-1"
      class="flow-edge-label nodrag nopan pointer-events-auto absolute start-0 top-0 rounded-[4.5px] border bg-default px-1.5 py-[3px] text-start transition-[background-color,opacity,border-color] duration-150 hover:bg-elevated"
      :class="[data.dim ? 'opacity-30' : '', broken ? 'border-error' : data.lit ? 'border-(--ui-primary) hover:border-(--ui-primary)' : 'border-(--ui-border) hover:border-(--ui-border-accented)']"
      :style="{ width: `${LABEL_W}px`, transform: `translate(${sourceX + LABEL_GAP}px, ${sourceY + data.port}px) translateY(-50%)` }"
      :title="text.choiceSentence(link)"
      @click="emit('edit', link.id)"
    >
      <span class="flex gap-1" :class="lines === 2 ? 'items-start' : 'items-center'">
        <UIcon v-if="data.conditional" name="i-lucide-lock" class="size-3 shrink-0 text-muted" :class="lines === 2 ? 'mt-0.5' : ''" />
        <span v-if="link.label.trim()" class="voice-author min-w-0 text-[0.8125rem] leading-4 italic text-default" :class="lines === 2 ? 'line-clamp-2' : 'truncate'">{{ link.label.trim() }}</span>
        <span v-else class="text-xs leading-4 font-medium text-muted">{{ t('flow.text.continue') }}</span>
      </span>
      <span v-if="broken" class="mt-[3px] flex items-center gap-1 text-[0.6875rem] leading-4 font-medium text-error">
        <UIcon name="i-lucide-circle-alert" class="size-3 shrink-0" />{{ t('flow.text.trashedScene') }}
      </span>
      <span v-else-if="chips.length" class="mt-[3px] block truncate leading-none">
        <code v-for="(chip, i) in chips" :key="i" class="me-1 inline-block rounded-[3px] bg-elevated px-1 font-mono text-[0.6875rem] leading-4" :class="chip.marked ? 'text-error' : 'text-toned'">{{ chip.text }}</code>
      </span>
    </button>
  </EdgeLabelRenderer>
</template>
