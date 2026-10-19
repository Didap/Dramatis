import type { RichDoc, RichNode } from '#shared/types/domain'
import type { Scene, Variable } from '#shared/types/entities'
import { exportChoices, exportIsEnding, exportStartScene, type GameChoice, type GameClause, type GameEffect } from './game'
import type { ExportTranslator } from './i18n'
import { exportDirection, exportMentionText, exportSpeaker, exportTrimDoc, type ExportModel } from './model'

/*
 * Twee 3 (appendix D.6), for Twine 2.6+ and Tweego, in two story formats: Harlowe 3 (the default) and
 * SugarCube 2 (P1). StoryTitle, StoryData with the IFID and the start passage, a startup passage that sets
 * every variable, one passage per scene ("S003 Dialogo con Oren") tagged with its kind and "ending", the
 * text as paragraphs, dialogue lines as ''Speaker'' (direction): line, and the choices as links, with the
 * format's macros for effects and conditions.
 */

export type TweeFormat = 'harlowe' | 'sugarcube'

/** A passage name: the scene code and its title, without the characters that break Twee headers or links. */
export function tweePassageName(scene: Pick<Scene, 'code' | 'title'>): string {
  const title = scene.title
    .replace(/->|<-/g, ' ')
    .replace(/[[\]{}|\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return title ? `${scene.code} ${title}` : scene.code
}

const entity = (ch: string) => `&#${ch.codePointAt(0)};`

/**
 * The author's text as literal markup: the characters that would start markup in either format (variables,
 * macros, hooks, emphasis, HTML, verbatim, passage headers...) become HTML entities, which both formats show
 * as they are.
 */
export function tweeEscape(text: string): string {
  return text
    .replace(/&(?=#?\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[[\]{}|`\\*@]/g, entity)
    .replace(/\$(?=[\w$])/g, '&#36;')
    .replace(/_(?=\w)/g, '&#95;')
    .replace(/\?(?=\w)/g, '&#63;')
    .replace(/\((?=\s*[\w-]+\s*:)/g, '&#40;')
    .replace(/\/(?=[/*%])/g, '&#47;')
    .replace(/''/g, '&#39;&#39;')
    .replace(/\^\^/g, '&#94;&#94;')
    .replace(/~~/g, '&#126;&#126;')
    .replace(/==/g, '&#61;&#61;')
    // At the start of a line: headings, lists, rules, quotes, alignment, and Twee's own passage headers.
    .replace(/^(\s*)([#\-!:=])/gm, (_, space: string, ch: string) => `${space}${entity(ch)}`)
    .replace(/^(\s*)0\./gm, '$1&#48;.')
}

/** A string literal of the formats' expressions (Harlowe and SugarCube both read backslash escapes). */
function tweeString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
}

function literal(value: boolean | number | string | null): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  return tweeString(value ?? '')
}

function defaultOf(v: Variable): string {
  return v.type === 'boolean' ? String(v.defaultValue === 'true') : v.type === 'number' ? String(Number.parseInt(v.defaultValue, 10) || 0) : tweeString(v.defaultValue)
}

interface Dialect {
  format: string
  version: string
  rule: string
  startup: (variables: Variable[]) => string[]
  link: (choice: GameChoice, text: string, target: string) => string
}

const comparisons: Record<TweeFormat, Record<'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte', string>> = {
  harlowe: { eq: 'is', neq: 'is not', gt: '>', gte: '>=', lt: '<', lte: '<=' },
  sugarcube: { eq: 'is', neq: 'isnot', gt: 'gt', gte: 'gte', lt: 'lt', lte: 'lte' },
}

function condition(choice: GameChoice, format: TweeFormat): string {
  const joiner = choice.condition!.mode === 'any' ? ' or ' : ' and '
  return choice.condition!.clauses.map((c: GameClause) => {
    const name = `$${c.variable.name}`
    if (c.op === 'is_true') return `${name} is true`
    if (c.op === 'is_false') return `${name} is false`
    return `${name} ${comparisons[format][c.op]} ${literal(c.value)}`
  }).join(joiner)
}

const DIALECTS: Record<TweeFormat, Dialect> = {
  harlowe: {
    format: 'Harlowe',
    version: '3.3.0',
    rule: '---',
    // Curly braces collapse the whitespace, so the startup passage prints nothing.
    startup: variables => [':: Startup [startup]', `{${variables.map(v => `(set: $${v.name} to ${defaultOf(v)})`).join('')}}`],
    link: (choice, text, target) => {
      const effect = (e: GameEffect) => {
        const name = `$${e.variable.name}`
        if (e.op === 'toggle') return `(set: ${name} to not it)`
        if (e.op === 'add') return `(set: ${name} to it + ${literal(e.value)})`
        if (e.op === 'subtract') return `(set: ${name} to it - ${literal(e.value)})`
        return `(set: ${name} to ${literal(e.value)})`
      }
      if (!choice.effects.length && !choice.condition) return `[[${text}->${target}]]`
      const action = choice.effects.length
        ? `(link: ${tweeString(text)})[${choice.effects.map(effect).join('')}(go-to: ${tweeString(target)})]`
        : `(link-goto: ${tweeString(text)}, ${tweeString(target)})`
      return choice.condition ? `(if: ${condition(choice, 'harlowe')})[${action}]` : action
    },
  },
  sugarcube: {
    format: 'SugarCube',
    version: '2.30.0',
    rule: '----',
    // StoryInit runs before the first passage and prints nothing.
    startup: variables => [':: StoryInit', ...variables.map(v => `<<set $${v.name} to ${defaultOf(v)}>>`)],
    link: (choice, text, target) => {
      const effect = (e: GameEffect) => {
        const name = `$${e.variable.name}`
        if (e.op === 'toggle') return `<<set ${name} to !${name}>>`
        if (e.op === 'add') return `<<set ${name} to ${name} + ${literal(e.value)}>>`
        if (e.op === 'subtract') return `<<set ${name} to ${name} - ${literal(e.value)}>>`
        return `<<set ${name} to ${literal(e.value)}>>`
      }
      const action = choice.effects.length
        ? `<<link ${tweeString(text)} ${tweeString(target)}>>${choice.effects.map(effect).join('')}<</link>>`
        : `[[${text}|${target}]]`
      return choice.condition ? `<<if ${condition(choice, 'sugarcube')}>>${action}<</if>>` : action
    },
  },
}

function inline(nodes: readonly RichNode[] | undefined, names: Map<string, string>): string {
  let out = ''
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      out += '\n'
      continue
    }
    if (node.type !== 'text' && node.type !== 'mention') {
      out += inline(node.content, names)
      continue
    }
    const raw = node.type === 'mention' ? exportMentionText(node, names) : node.text ?? ''
    let text = tweeEscape(raw)
    if (!text.trim()) {
      out += text
      continue
    }
    const marks = new Set((node.marks ?? []).map(m => m.type))
    if (marks.has('italic')) text = `//${text}//`
    if (marks.has('bold')) text = `''${text}''`
    out += text
  }
  return out
}

function body(doc: RichDoc | null, names: Map<string, string>, dialect: Dialect): string[] {
  const out: string[] = []
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
        out.push(dialect.rule)
        return
      case 'image':
        return
      case 'dialogueLine': {
        const speaker = exportSpeaker(node.attrs, names)
        const direction = exportDirection(node.attrs)
        // "(sottovoce: piano)" would read as a Harlowe macro call: its parenthesis is written as an entity.
        const open = /^[\w-]+\s*:/.test(direction) ? '&#40;' : '('
        const head = [speaker ? `''${tweeEscape(speaker)}''` : '', direction ? `${open}${tweeEscape(direction)})` : ''].filter(Boolean).join(' ')
        out.push(`${head}${head ? ': ' : ''}${inline(node.content, names).trim()}`)
        return
      }
      default: {
        const text = inline(node.content, names).trim()
        if (text) out.push(text)
      }
    }
  }
  const trimmed = exportTrimDoc(doc)
  if (trimmed) walk(trimmed)
  return out
}

/** The Twee 3 source of the project. `ui` translates in the author's interface language ("Continua"). */
export function gameTwee(model: ExportModel, ifid: string, ui: ExportTranslator, format: TweeFormat = 'harlowe'): string {
  const dialect = DIALECTS[format]
  const choices = exportChoices(model)
  const start = exportStartScene(model)
  const continueText = ui('export.out.continue')
  const out: string[] = []

  // The title on one line, and not starting with "::", which would open a passage of its own.
  out.push(':: StoryTitle', model.project.title.replace(/\s+/g, ' ').replace(/^[\s:]+/, '').trim() || 'Dramatis', '')
  out.push(':: StoryData', JSON.stringify({
    'ifid': ifid,
    'format': dialect.format,
    'format-version': dialect.version,
    'start': start ? tweePassageName(start) : undefined,
    'tag-colors': { ending: 'green' },
    'zoom': 1,
  }, null, 2), '')

  const variables = model.modules.variables ? model.bundle.variables : []
  if (variables.length) out.push(...dialect.startup(variables), '')

  // Twine's story map: the author's flow positions when there are any, otherwise chapters as columns.
  const column = new Map(model.chapters.map((c, i) => [c.id, i]))
  const row = new Map<string, number>()
  model.scenes.forEach((scene, index) => {
    const tags = [
      ...(model.modules.scene_kinds ? [scene.kind] : []),
      ...(exportIsEnding(model, scene) ? ['ending'] : []),
    ]
    const r = row.get(scene.chapterId) ?? 0
    row.set(scene.chapterId, r + 1)
    const x = scene.flowPosition ? Math.max(0, Math.round(scene.flowPosition.x)) : 100 + (column.get(scene.chapterId) ?? index) * 250
    const y = scene.flowPosition ? Math.max(0, Math.round(scene.flowPosition.y)) : 100 + r * 175
    const meta = JSON.stringify({ position: `${x},${y}`, size: '100,100' })
    out.push(`:: ${tweePassageName(scene)}${tags.length ? ` [${tags.join(' ')}]` : ''} ${meta}`)
    const paragraphs = body(model.content.get(scene.id) ?? null, model.names, dialect)
    const links = (choices.get(scene.id) ?? []).map(c => dialect.link(c, tweeEscape(c.text || continueText), tweePassageName(c.to)))
    out.push([paragraphs.join('\n\n'), links.join('\n')].filter(Boolean).join('\n\n'), '')
  })
  return `${out.join('\n').trimEnd()}\n`
}
