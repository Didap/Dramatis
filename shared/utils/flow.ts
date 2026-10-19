/**
 * The flow of a branching story (spec 0.8 and 5.5): explicit choices between scenes, plus the
 * implicit continuation, by which a scene with no outgoing choices that is not an ending continues
 * to the next scene in manuscript order. A scene with at least one choice has no implicit continuation.
 */

export interface FlowScene {
  id: string
  ending: boolean
}

export interface FlowLink {
  id: string
  fromSceneId: string
  toSceneId: string
  conditions?: { clauses: { variableId: string }[] }
  effects?: { variableId: string }[]
}

export interface FlowEdge {
  from: string
  to: string
  /** The choice, or null for the implicit continuation. */
  linkId: string | null
}

export interface FlowAnalysis {
  edges: FlowEdge[]
  /** Scenes reachable from the start scene (empty when no start is set). */
  reachable: Set<string>
  /** Scenes that cannot be reached from the start scene (only when a start is set). */
  unreachable: string[]
  /** Scenes that are not endings and lead nowhere. */
  deadEnds: string[]
  endings: string[]
  unreachableEndings: string[]
  /** Choices pointing to scenes that no longer exist. */
  brokenLinks: string[]
  hasStart: boolean
  /** Number of problems shown on the sidebar badge. */
  problems: number
}

/**
 * Analyses the flow. `scenes` must be in manuscript (reading) order; trashed scenes left out.
 */
export function analyseFlow(scenes: readonly FlowScene[], links: readonly FlowLink[], startSceneId: string | null | undefined): FlowAnalysis {
  const ids = new Set(scenes.map(s => s.id))
  const outgoing = new Map<string, FlowEdge[]>()
  const edges: FlowEdge[] = []
  const brokenLinks: string[] = []

  // A scene with any choice, even one pointing to a scene that is gone, has no implicit continuation.
  const hasChoices = new Set<string>()
  for (const link of links) {
    if (ids.has(link.fromSceneId)) hasChoices.add(link.fromSceneId)
    if (!ids.has(link.fromSceneId) || !ids.has(link.toSceneId)) {
      brokenLinks.push(link.id)
      continue
    }
    const edge = { from: link.fromSceneId, to: link.toSceneId, linkId: link.id }
    edges.push(edge)
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  }
  scenes.forEach((scene, index) => {
    if (scene.ending || hasChoices.has(scene.id)) return
    const next = scenes[index + 1]
    if (!next) return
    const edge = { from: scene.id, to: next.id, linkId: null }
    edges.push(edge)
    outgoing.set(scene.id, [edge])
  })

  const hasStart = !!startSceneId && ids.has(startSceneId)
  const reachable = new Set<string>()
  if (hasStart) {
    const queue = [startSceneId!]
    while (queue.length) {
      const current = queue.shift()!
      if (reachable.has(current)) continue
      reachable.add(current)
      for (const edge of outgoing.get(current) ?? []) if (!reachable.has(edge.to)) queue.push(edge.to)
    }
  }

  const unreachable = hasStart ? scenes.filter(s => !reachable.has(s.id)).map(s => s.id) : []
  // A dead end is a scene the player can reach and cannot leave (an unreachable one is listed as such).
  const deadEnds = scenes.filter(s => !s.ending && !outgoing.has(s.id) && (!hasStart || reachable.has(s.id))).map(s => s.id)
  const endings = scenes.filter(s => s.ending).map(s => s.id)
  const unreachableEndings = hasStart ? endings.filter(id => !reachable.has(id)) : []

  return {
    edges,
    reachable,
    unreachable,
    deadEnds,
    endings,
    unreachableEndings,
    brokenLinks,
    hasStart,
    problems: scenes.length ? unreachable.length + deadEnds.length + brokenLinks.length + (hasStart ? 0 : 1) + (endings.length ? 0 : 1) : 0,
  }
}

/** Variables used by at least one condition or effect, and those that are only read or only written. */
export function variableUsage(links: readonly FlowLink[]) {
  const read = new Map<string, number>()
  const written = new Map<string, number>()
  for (const link of links) {
    for (const clause of link.conditions?.clauses ?? []) read.set(clause.variableId, (read.get(clause.variableId) ?? 0) + 1)
    for (const effect of link.effects ?? []) written.set(effect.variableId, (written.get(effect.variableId) ?? 0) + 1)
  }
  return { read, written }
}

// ---------------------------------------------------------------- rules and checks (shared by the
// flow view, the sidebar badge, the path and the export's flowClean, so they always agree)

export type FlowVariableType = 'boolean' | 'number' | 'string'
export interface FlowVariable {
  id: string
  type: FlowVariableType
}
export interface FlowRuleClause {
  variableId: string
  op: string
  value?: string
}
export interface FlowRuleLink extends FlowLink {
  label: string
  conditions?: { clauses: FlowRuleClause[] }
  effects?: FlowRuleClause[]
}

/** Operators a condition offers for each variable type (spec 5.5, 7.19). */
export const CONDITION_OPS_BY_TYPE: Record<FlowVariableType, readonly string[]> = {
  boolean: ['is_true', 'is_false'],
  number: ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'],
  string: ['eq', 'neq'],
}
/** Operations an effect offers for each variable type. */
export const EFFECT_OPS_BY_TYPE: Record<FlowVariableType, readonly string[]> = {
  boolean: ['set', 'toggle'],
  number: ['set', 'add', 'subtract'],
  string: ['set'],
}
const isInteger = (value: string | undefined) => /^-?\d{1,15}$/.test((value ?? '').trim())

/** A boolean clause read as is_true or is_false (older data may say `eq true`). */
export function booleanOp(clause: Pick<FlowRuleClause, 'op' | 'value'>): 'is_true' | 'is_false' | null {
  if (clause.op === 'is_true' || clause.op === 'is_false') return clause.op
  if (clause.op !== 'eq' && clause.op !== 'neq') return null
  if (clause.value !== 'true' && clause.value !== 'false') return null
  return (clause.op === 'eq') === (clause.value === 'true') ? 'is_true' : 'is_false'
}

export type RuleProblem = 'missing' | 'type' | 'value'

/** What is wrong with a condition clause: its variable is gone, the operator does not fit, the value is not a number. */
export function clauseProblem(clause: FlowRuleClause, variable: FlowVariable | undefined): RuleProblem | null {
  if (!variable) return 'missing'
  if (variable.type === 'boolean') return booleanOp(clause) ? null : 'type'
  if (!CONDITION_OPS_BY_TYPE[variable.type].includes(clause.op)) return 'type'
  if (variable.type === 'number' && !isInteger(clause.value)) return 'value'
  return null
}

/** What is wrong with an effect. */
export function effectProblem(effect: FlowRuleClause, variable: FlowVariable | undefined): RuleProblem | null {
  if (!variable) return 'missing'
  if (!EFFECT_OPS_BY_TYPE[variable.type].includes(effect.op)) return 'type'
  if (variable.type === 'boolean' && effect.op === 'set' && effect.value !== 'true' && effect.value !== 'false') return 'value'
  if (variable.type === 'number' && !isInteger(effect.value)) return 'value'
  return null
}

export type FlowCheckKind =
  | 'noStart' | 'brokenTarget' | 'trashedVariable' | 'badRule'
  | 'unreachableEnding' | 'unreachable' | 'deadEnd' | 'noEnding' | 'emptyText' | 'unusedVariable' | 'unchangedVariable'

export interface FlowCheck {
  key: string
  kind: FlowCheckKind
  level: 'error' | 'warning'
  sceneId?: string
  linkId?: string
  variableId?: string
  /** How many conditions read the variable (unchangedVariable). */
  count?: number
}

const CHECK_ORDER: FlowCheckKind[] = ['noStart', 'brokenTarget', 'trashedVariable', 'badRule', 'unreachableEnding', 'unreachable', 'deadEnd', 'noEnding', 'emptyText', 'unusedVariable', 'unchangedVariable']

/** Checks that count as problems of the flow (badge, path, flowClean); the others are hygiene hints. */
export const PROBLEM_KINDS: readonly FlowCheckKind[] = ['noStart', 'brokenTarget', 'trashedVariable', 'badRule', 'unreachableEnding', 'unreachable', 'deadEnd', 'noEnding']

export interface FlowCheckInput {
  /** In manuscript order, trashed scenes left out. */
  scenes: readonly FlowScene[]
  /** Every live choice, including those pointing to a scene that is gone. */
  links: readonly FlowRuleLink[]
  startSceneId: string | null | undefined
  /** Live variables. */
  variables: readonly FlowVariable[]
  /** Whether the variables module is on (rules are not checked otherwise). */
  variablesModule: boolean
}

/** Every check of the flow (spec 5.5), errors first. Empty for a project without scenes. */
export function flowChecks(input: FlowCheckInput): { checks: FlowCheck[], problems: number, analysis: FlowAnalysis } {
  const analysis = analyseFlow(input.scenes, input.links, input.startSceneId)
  if (!input.scenes.length) return { checks: [], problems: 0, analysis }
  const list: FlowCheck[] = []
  const add = (check: Omit<FlowCheck, 'key'>) => list.push({ ...check, key: `${check.kind}:${check.sceneId ?? ''}:${check.linkId ?? ''}:${check.variableId ?? ''}` })
  const live = new Set(input.scenes.map(s => s.id))
  const variables = new Map(input.variables.map(v => [v.id, v]))

  if (!analysis.hasStart) add({ kind: 'noStart', level: 'error' })
  for (const id of analysis.brokenLinks) {
    const link = input.links.find(l => l.id === id)
    if (link && live.has(link.fromSceneId)) add({ kind: 'brokenTarget', level: 'error', linkId: id, sceneId: link.fromSceneId })
  }

  const choiceCount = new Map<string, number>()
  for (const link of input.links) choiceCount.set(link.fromSceneId, (choiceCount.get(link.fromSceneId) ?? 0) + 1)
  for (const link of input.links) {
    if (!live.has(link.fromSceneId)) continue
    const problems = input.variablesModule
      ? [...(link.conditions?.clauses ?? []).map(c => clauseProblem(c, variables.get(c.variableId))), ...(link.effects ?? []).map(e => effectProblem(e, variables.get(e.variableId)))]
      : []
    if (problems.includes('missing')) add({ kind: 'trashedVariable', level: 'error', linkId: link.id, sceneId: link.fromSceneId })
    else if (problems.some(Boolean)) add({ kind: 'badRule', level: 'error', linkId: link.id, sceneId: link.fromSceneId })
    if (!link.label.trim() && (choiceCount.get(link.fromSceneId) ?? 0) > 1) add({ kind: 'emptyText', level: 'warning', linkId: link.id, sceneId: link.fromSceneId })
  }

  const endings = new Set(analysis.endings)
  for (const id of analysis.unreachableEndings) add({ kind: 'unreachableEnding', level: 'warning', sceneId: id })
  for (const id of analysis.unreachable) if (!endings.has(id)) add({ kind: 'unreachable', level: 'warning', sceneId: id })
  // A dead end is a reachable scene with no way out; an unreachable one is already listed.
  for (const id of analysis.deadEnds) if (!analysis.hasStart || analysis.reachable.has(id)) add({ kind: 'deadEnd', level: 'warning', sceneId: id })
  if (!analysis.endings.length) add({ kind: 'noEnding', level: 'warning' })

  if (input.variablesModule) {
    const { read, written } = variableUsage(input.links)
    for (const v of input.variables) {
      if (!read.has(v.id) && !written.has(v.id)) add({ kind: 'unusedVariable', level: 'warning', variableId: v.id })
      else if (read.has(v.id) && !written.has(v.id)) add({ kind: 'unchangedVariable', level: 'warning', variableId: v.id, count: read.get(v.id) })
    }
  }
  const checks = list.sort((a, b) => CHECK_ORDER.indexOf(a.kind) - CHECK_ORDER.indexOf(b.kind))
  return { checks, problems: checks.filter(c => PROBLEM_KINDS.includes(c.kind)).length, analysis }
}
