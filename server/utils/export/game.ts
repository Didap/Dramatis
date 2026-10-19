import type { ConditionClause, LinkEffect, RichDoc, RichNode, VariableType } from '#shared/types/domain'
import type { Scene, SceneLink, Variable } from '#shared/types/entities'
import { booleanOp } from '#shared/utils/flow'
import { countWords } from '#shared/utils/richtext'
import { exportDirection, exportInlineText, exportSpeaker, type ExportModel } from './model'

/*
 * What the team formats (JSON, Twee, Ink, voice-over CSV) share: the choices of every scene with the
 * implicit continuation written out (spec 0.8), conditions and effects resolved to their variables,
 * the start scene and the dialogue lines.
 */

export interface GameClause {
  variable: Variable
  op: ConditionClause['op']
  /** The value typed by the variable (absent for is_true and is_false). */
  value: boolean | number | string | null
}

export interface GameEffect {
  variable: Variable
  op: LinkEffect['op']
  value: boolean | number | string | null
}

export interface GameChoice {
  /** The choice, or null for the implicit continuation. */
  linkId: string | null
  text: string
  to: Scene
  implicit: boolean
  /** Null when always available. */
  condition: { mode: 'all' | 'any', clauses: GameClause[] } | null
  effects: GameEffect[]
}

export interface GameLine {
  lineId: string | null
  speakerId: string | null
  speaker: string
  direction: string
  text: string
  words: number
}

/** A variable's value from its stored text: booleans true/false, integers, strings as they are. */
export function exportTypedValue(type: VariableType, raw: string | null | undefined): boolean | number | string {
  if (type === 'boolean') return raw === 'true'
  if (type === 'number') {
    const n = Number.parseInt(raw ?? '', 10)
    return Number.isFinite(n) ? n : 0
  }
  return raw ?? ''
}

/** The start scene: the project's own (with branching), otherwise the first scene of the manuscript. */
export function exportStartScene(model: ExportModel): Scene | null {
  if (model.modules.branching && model.project.startSceneId) {
    const start = model.scenes.find(s => s.id === model.project.startSceneId)
    if (start) return start
  }
  return model.scenes[0] ?? null
}

/** A scene ends the story (only with branching: without it, the last scene is the only ending). */
export function exportIsEnding(model: ExportModel, scene: Scene): boolean {
  return model.modules.branching && scene.ending
}

/** The condition and the effects of a choice, resolved to their variables (null and none without variables). */
export type GameRules = Pick<GameChoice, 'condition' | 'effects'>

/**
 * Reads the conditions and effects of choices. Without the variables module they are left out (the module is
 * off, the data is kept); a clause or an effect whose variable is gone is left out too (the flow checks report it).
 */
export function exportRules(model: ExportModel): (link: Pick<SceneLink, 'conditions' | 'effects'>) => GameRules {
  const variables = new Map(model.bundle.variables.map(v => [v.id, v]))
  const clauses = (list: readonly ConditionClause[]): GameClause[] =>
    list.flatMap((clause) => {
      const variable = variables.get(clause.variableId)
      if (!variable) return []
      // A boolean clause stored the older way ("eq true") is the is_true or is_false the formats know.
      const op = (variable.type === 'boolean' && booleanOp(clause)) || clause.op
      const value = op === 'is_true' || op === 'is_false' ? null : exportTypedValue(variable.type, clause.value)
      return [{ variable, op, value }]
    })
  const effects = (list: readonly LinkEffect[]): GameEffect[] =>
    list.flatMap((effect) => {
      const variable = variables.get(effect.variableId)
      if (!variable) return []
      const value = effect.op === 'toggle' ? null : exportTypedValue(variable.type, effect.value)
      return [{ variable, op: effect.op, value }]
    })
  return (link) => {
    if (!model.modules.variables) return { condition: null, effects: [] }
    const condition = clauses(link.conditions?.clauses ?? [])
    return {
      condition: condition.length ? { mode: link.conditions.mode === 'any' ? 'any' : 'all', clauses: condition } : null,
      effects: effects(link.effects ?? []),
    }
  }
}

/** The choices of the scenes with branching on, in their order among the choices of their scene. */
function orderedLinks(model: ExportModel): SceneLink[] {
  return model.modules.branching
    ? [...model.bundle.links].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
    : []
}

/**
 * The choices of each scene, in their order, with the implicit continuation written out. Without
 * branching the story is linear.
 */
export function exportChoices(model: ExportModel): Map<string, GameChoice[]> {
  const byId = new Map(model.scenes.map(s => [s.id, s]))
  const rules = exportRules(model)
  const result = new Map<string, GameChoice[]>()
  const links = orderedLinks(model)
  // A scene with any choice has no implicit continuation, even when every choice points to a scene in the
  // trash (spec 0.8, as analyseFlow reads it): the export stops where the flow view shows a broken choice.
  const hasChoices = new Set(links.filter(l => byId.has(l.fromSceneId)).map(l => l.fromSceneId))
  for (const link of links) {
    const to = byId.get(link.toSceneId)
    if (!to || !byId.has(link.fromSceneId)) continue
    const choice: GameChoice = { linkId: link.id, text: link.label.trim(), to, implicit: false, ...rules(link) }
    result.set(link.fromSceneId, [...(result.get(link.fromSceneId) ?? []), choice])
  }

  model.scenes.forEach((scene, index) => {
    if (hasChoices.has(scene.id) || exportIsEnding(model, scene)) return
    const next = model.scenes[index + 1]
    if (next) result.set(scene.id, [{ linkId: null, text: '', to: next, implicit: true, condition: null, effects: [] }])
  })
  return result
}

/** The choices that point to a scene in the trash, by scene: no format can follow them, the document lists them. */
export function exportBrokenChoices(model: ExportModel): Map<string, (GameRules & { linkId: string, text: string })[]> {
  const live = new Set(model.scenes.map(s => s.id))
  const rules = exportRules(model)
  const result = new Map<string, (GameRules & { linkId: string, text: string })[]>()
  for (const link of orderedLinks(model)) {
    if (!live.has(link.fromSceneId) || live.has(link.toSceneId)) continue
    result.set(link.fromSceneId, [...(result.get(link.fromSceneId) ?? []), { linkId: link.id, text: link.label.trim(), ...rules(link) }])
  }
  return result
}

/** The shape of a line id the server hands out (S014-L003); anything else in a text is not one. */
const LINE_ID = /^S\d{3,}-L\d{3,}$/

/** The id of a dialogue line, or null when it has none (yet) or the text carries something else. */
export function exportLineId(attrs: Record<string, unknown> | undefined): string | null {
  return typeof attrs?.lineId === 'string' && LINE_ID.test(attrs.lineId) ? attrs.lineId : null
}

/** The dialogue lines of a scene's text, with the speaker's current name. */
export function exportLines(doc: RichDoc | null | undefined, names: Map<string, string>): GameLine[] {
  const lines: GameLine[] = []
  const walk = (node: RichNode) => {
    if (node.type === 'dialogueLine') {
      const text = exportInlineText(node, names).replace(/\s*\n\s*/g, ' ').trim()
      const speakerId = typeof node.attrs?.speakerId === 'string' && node.attrs.speakerId ? node.attrs.speakerId : null
      lines.push({
        lineId: exportLineId(node.attrs),
        speakerId: speakerId && names.has(`character:${speakerId}`) ? speakerId : null,
        speaker: exportSpeaker(node.attrs, names),
        direction: exportDirection(node.attrs),
        text,
        words: countWords(text),
      })
      return
    }
    ;(node.content ?? []).forEach(walk)
  }
  if (doc) walk(doc)
  return lines
}

/** The act (part) and chapter a scene belongs to. */
export function exportPlaceOf(model: ExportModel, scene: Scene) {
  const chapter = model.bundle.chapters.find(c => c.id === scene.chapterId) ?? null
  const part = model.usesParts && chapter?.partId ? model.parts.find(p => p.id === chapter.partId) ?? null : null
  return { chapter, part }
}
