import type { RichDoc, RichNode } from '#shared/types/domain'
import type { Scene } from '#shared/types/entities'
import { exportSlug } from './files'
import { exportChoices, exportLineId, exportStartScene, type GameChoice, type GameClause, type GameEffect } from './game'
import type { ExportTranslator } from './i18n'
import { exportDirection, exportInlineText, exportSpeaker, exportTrimDoc, type ExportModel } from './model'

/*
 * Ink (appendix D.7), for inklecate, Inky and the ink runtime: VAR declarations with their defaults, a
 * divert to the start knot, one knot per scene (s003_dialogo_con_oren), dialogue lines as
 * "Oren: (sottovoce) testo #id:S003-L004", sticky choices with their condition in braces and their
 * effects inside; the implicit continuation is a divert to the next knot, an ending ends with -> END.
 */

/** Lowercase words ink reads as its own. A variable with one of these names gets a "v_" prefix. */
const RESERVED = new Set(['true', 'false', 'not', 'and', 'or', 'mod', 'has', 'hasnt', 'else', 'return', 'temp', 'function', 'stopping', 'cycle', 'shuffle', 'once', 'ref', 'done', 'end'])

export function inkKnotName(scene: Pick<Scene, 'code' | 'title'>): string {
  const slug = exportSlug(scene.title, '', 40).replace(/-/g, '_')
  const code = scene.code.toLowerCase().replace(/[^a-z0-9]/g, '')
  return slug ? `${code}_${slug}` : code
}

function inkVariable(name: string): string {
  return RESERVED.has(name) || /^s\d+(?:_|$)/.test(name) ? `v_${name}` : name
}

/** The author's text as literal ink: every character ink would read as syntax is escaped with a backslash. */
export function inkEscape(text: string): string {
  let out = text
    .replace(/\\/g, '\\\\')
    .replace(/[{}|#[\]]/g, '\\$&')
    .replace(/->/g, '-\\>')
    .replace(/<-/g, '<\\-')
    .replace(/<>/g, '<\\>')
    .replace(/\/(?=[/*])/g, '/\\')
  // At the start of a line: choices, gathers, knots, logic, and the keywords of the language.
  out = out.replace(/^(\s*)([*+\-=~])/gm, '$1\\$2')
  out = out.replace(/^(\s*)(INCLUDE|VAR|CONST|LIST|EXTERNAL|TODO)\b/gm, (_, space: string, word: string) => `${space}\\${word}`)
  return out
}

function literal(value: boolean | number | string | null): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
}

function condition(choice: GameChoice): string {
  const joiner = choice.condition!.mode === 'any' ? ' or ' : ' and '
  return choice.condition!.clauses.map((c: GameClause) => {
    const name = inkVariable(c.variable.name)
    if (c.op === 'is_true') return name
    if (c.op === 'is_false') return `not ${name}`
    const op = { eq: '==', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' }[c.op]
    return `${name} ${op} ${literal(c.value)}`
  }).join(joiner)
}

function effect(e: GameEffect): string {
  const name = inkVariable(e.variable.name)
  if (e.op === 'toggle') return `~ ${name} = not ${name}`
  if (e.op === 'add') return `~ ${name} += ${literal(e.value)}`
  if (e.op === 'subtract') return `~ ${name} -= ${literal(e.value)}`
  return `~ ${name} = ${literal(e.value)}`
}

function body(doc: RichDoc | null, names: Map<string, string>): string[] {
  const out: string[] = []
  const push = (text: string) => {
    for (const line of text.split('\n')) if (line.trim()) out.push(inkEscape(line.trim()))
  }
  const walk = (node: RichNode) => {
    switch (node.type) {
      case 'doc':
      case 'blockquote':
      case 'bulletList':
      case 'orderedList':
      case 'listItem':
        ;(node.content ?? []).forEach(walk)
        return
      case 'horizontalRule':
      case 'sceneBreak':
        out.push(inkEscape('* * *'))
        return
      case 'image':
        return
      case 'dialogueLine': {
        const speaker = exportSpeaker(node.attrs, names)
        const direction = exportDirection(node.attrs)
        const text = exportInlineText(node, names).trim()
        // One line of ink: a break inside a dialogue line would start a new one.
        const line = `${speaker ? `${speaker}: ` : ''}${direction ? `(${direction}) ` : ''}${text}`.replace(/\s*\n\s*/g, ' ')
        const lineId = exportLineId(node.attrs)
        if (line.trim()) out.push(`${inkEscape(line)}${lineId ? ` #id:${lineId}` : ''}`)
        return
      }
      default:
        push(exportInlineText(node, names, '\n'))
    }
  }
  const trimmed = exportTrimDoc(doc)
  if (trimmed) walk(trimmed)
  return out
}

/** The ink source of the project. `ui` translates in the author's interface language ("Continua"). */
export function gameInk(model: ExportModel, ui: ExportTranslator): string {
  const choices = exportChoices(model)
  const start = exportStartScene(model)
  const continueText = ui('export.out.continue')
  const out: string[] = [`// ${model.project.title.replace(/\s+/g, ' ')}`, '']

  if (model.modules.variables && model.bundle.variables.length) {
    for (const v of model.bundle.variables) {
      const value = v.type === 'boolean' ? String(v.defaultValue === 'true') : v.type === 'number' ? String(Number.parseInt(v.defaultValue, 10) || 0) : literal(v.defaultValue)
      out.push(`VAR ${inkVariable(v.name)} = ${value}`)
    }
    out.push('')
  }
  out.push(start ? `-> ${inkKnotName(start)}` : '-> END', '')

  for (const scene of model.scenes) {
    out.push(`=== ${inkKnotName(scene)} ===`)
    out.push(`# code: ${scene.code}`)
    if (model.modules.scene_kinds) out.push(`# kind: ${scene.kind}`)
    out.push(...body(model.content.get(scene.id) ?? null, model.names))

    const list = choices.get(scene.id) ?? []
    const single = list.length === 1 && !list[0]!.condition && (list[0]!.implicit || !list[0]!.text)
    if (!list.length) {
      // An ending (or the last scene of a story without endings) closes the story.
      out.push('-> END')
    }
    else if (single) {
      // A plain continuation is a divert, after its effects.
      out.push(...list[0]!.effects.map(effect), `-> ${inkKnotName(list[0]!.to)}`)
    }
    else {
      for (const choice of list) {
        const guard = choice.condition ? `{${condition(choice)}} ` : ''
        out.push(`+ ${guard}[${inkEscape(choice.text || continueText)}]`)
        for (const e of choice.effects) out.push(`    ${effect(e)}`)
        out.push(`    -> ${inkKnotName(choice.to)}`)
      }
    }
    out.push('')
  }
  return `${out.join('\n').trimEnd()}\n`
}
