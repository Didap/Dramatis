import { GROUP_KINDS, PROJECT_MODULES } from '#shared/utils/constants'
import { exportChoices, exportIsEnding, exportLines, exportPlaceOf, exportStartScene, exportTypedValue, type GameChoice } from './game'
import { exportPlainText, type ExportModel } from './model'

/*
 * "dramatis-game", version 1 (appendix D.5): the documented format for developers, separate from the
 * backup. Its JSON Schema is DRAMATIS_GAME_SCHEMA below, served at /api/projects/:id/export/schema.
 * Implicit continuations are written out as choices with "implicit": true, so a consumer needs no
 * knowledge of the rule. Ids are Dramatis' own and stable across exports; scenes are referred to by code.
 */

export const DRAMATIS_GAME_FORMAT = 'dramatis-game'
export const DRAMATIS_GAME_VERSION = 1

type Value = boolean | number | string

export interface DramatisGame {
  format: 'dramatis-game'
  version: 1
  generatedAt: string
  project: {
    id: string
    title: string
    subtitle: string
    author: string
    language: string
    type: 'novel' | 'game'
    modules: Record<string, boolean>
    startScene: string | null
  }
  variables: { id: string, name: string, type: 'boolean' | 'number' | 'string', default: Value, description: string }[]
  characters: { id: string, name: string, aliases: string[], importance: string, role: string | null, playable: boolean, tagline: string, voice: { answers: Record<string, string>, text: string } }[]
  locations: { id: string, name: string, kind: string, nation: string, region: string, city: string, description: string }[]
  objects: { id: string, name: string, kind: string, description: string }[]
  groups: { id: string, name: string, kind: string, description: string, members: { type: string, id: string, role: string }[] }[]
  quests: { id: string, name: string, kind: 'quest' | 'side_quest', status: string, giver: string | null, description: string, objectives: { id: string, text: string, optional: boolean, scene: string | null }[], rewards: { id: string, text: string, object: string | null }[] }[]
  scenes: {
    code: string
    id: string
    title: string
    act: { id: string, title: string } | null
    chapter: { id: string, title: string }
    kind: string
    status: string
    start: boolean
    ending: boolean
    endingLabel: string | null
    synopsis: string
    text: string
    words: number
    lines: { id: string | null, speakerId: string | null, speaker: string, direction: string, text: string }[]
    choices: {
      text: string
      target: string
      implicit: boolean
      condition: { mode: 'all' | 'any', clauses: { variable: string, variableId: string, op: string, value: Value | null }[] } | null
      effects: { variable: string, variableId: string, op: string, value: Value | null }[]
    }[]
  }[]
}

function choiceJson(choice: GameChoice) {
  return {
    text: choice.text,
    target: choice.to.code,
    implicit: choice.implicit,
    condition: choice.condition
      ? { mode: choice.condition.mode, clauses: choice.condition.clauses.map(c => ({ variable: c.variable.name, variableId: c.variable.id, op: c.op, value: c.value })) }
      : null,
    effects: choice.effects.map(e => ({ variable: e.variable.name, variableId: e.variable.id, op: e.op, value: e.value })),
  }
}

export function gameJson(model: ExportModel): DramatisGame {
  const { bundle, modules, names } = model
  const choices = exportChoices(model)
  const start = exportStartScene(model)
  const sceneCode = new Map(model.scenes.map(s => [s.id, s.code]))

  const members = (groupId: string) =>
    bundle.relations
      .filter(r => r.kind === 'membership' && r.targetType === 'group' && r.targetId === groupId)
      .map(r => ({ type: r.sourceType, id: r.sourceId, role: r.label }))

  return {
    format: DRAMATIS_GAME_FORMAT,
    version: DRAMATIS_GAME_VERSION,
    generatedAt: new Date().toISOString(),
    project: {
      id: model.project.id,
      title: model.project.title,
      subtitle: model.project.subtitle,
      author: model.project.authorName,
      language: model.project.language,
      type: model.project.kind,
      modules: Object.fromEntries(PROJECT_MODULES.map(m => [m, modules[m]])),
      startScene: start?.code ?? null,
    },
    variables: modules.variables
      ? bundle.variables.map(v => ({ id: v.id, name: v.name, type: v.type, default: exportTypedValue(v.type, v.defaultValue), description: v.description }))
      : [],
    characters: bundle.characters.map((c) => {
      const voice = c.profile?.voice
      return {
        id: c.id,
        name: c.name,
        aliases: c.aliases,
        importance: c.importance,
        role: c.role || null,
        playable: c.playable,
        tagline: c.tagline,
        voice: {
          answers: Object.fromEntries(Object.entries(voice?.answers ?? {}).filter(([, a]) => a?.trim())),
          text: exportPlainText(voice?.free, names),
        },
      }
    }),
    locations: bundle.locations.map(l => ({ id: l.id, name: l.name, kind: l.kind, nation: l.nation, region: l.region, city: l.city, description: exportPlainText(l.description, names) })),
    objects: bundle.objects.map(o => ({ id: o.id, name: o.name, kind: o.kind, description: exportPlainText(o.description, names) })),
    groups: bundle.groups.map(g => ({ id: g.id, name: g.name, kind: g.kind, description: exportPlainText(g.description, names), members: members(g.id) })),
    quests: modules.quests
      ? bundle.strands
          .filter(s => s.kind === 'quest' || s.kind === 'side_quest')
          .map(s => ({
            id: s.id,
            name: s.name,
            kind: s.kind as 'quest' | 'side_quest',
            status: s.status,
            giver: s.quest?.giverId && names.has(`character:${s.quest.giverId}`) ? s.quest.giverId : null,
            description: exportPlainText(s.description, names),
            objectives: (s.quest?.objectives ?? []).map(o => ({ id: o.id, text: o.text, optional: !!o.optional, scene: (o.sceneId && sceneCode.get(o.sceneId)) || null })),
            rewards: (s.quest?.rewards ?? []).map(r => ({ id: r.id, text: r.text, object: r.objectId && names.has(`object:${r.objectId}`) ? r.objectId : null })),
          }))
      : [],
    scenes: model.scenes.map((scene) => {
      const { chapter, part } = exportPlaceOf(model, scene)
      const content = model.content.get(scene.id) ?? null
      const ending = exportIsEnding(model, scene)
      return {
        code: scene.code,
        id: scene.id,
        title: scene.title,
        act: part ? { id: part.id, title: part.title } : null,
        chapter: { id: chapter?.id ?? scene.chapterId, title: chapter?.title ?? '' },
        kind: scene.kind,
        status: scene.status,
        start: scene.id === start?.id,
        ending,
        endingLabel: ending ? scene.endingLabel || null : null,
        synopsis: scene.synopsis,
        text: exportPlainText(content, names),
        words: scene.wordCount,
        lines: modules.script ? exportLines(content, names).map(l => ({ id: l.lineId, speakerId: l.speakerId, speaker: l.speaker, direction: l.direction, text: l.text })) : [],
        choices: (choices.get(scene.id) ?? []).map(choiceJson),
      }
    }),
  }
}

const value = { type: ['boolean', 'number', 'string'] }
const nullableValue = { type: ['boolean', 'number', 'string', 'null'] }
const id = { type: 'string', format: 'uuid' }
const nullableId = { type: ['string', 'null'], format: 'uuid' }
const code = { type: 'string', pattern: '^S\\d{3,}$' }
const text = { type: 'string' }
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
const list = (items: unknown) => ({ type: 'array', items })
const variableRef = { variable: { type: 'string', description: 'Name of the variable.' }, variableId: id }

/** JSON Schema (draft 2020-12) of the dramatis-game format, version 1. */
export const DRAMATIS_GAME_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:dramatis:schema:dramatis-game:1',
  title: 'Dramatis game story',
  description: 'A game story exported by Dramatis: state variables, the cast and the world, quests, and every scene in manuscript order with its dialogue lines and choices. Implicit continuations are written out as choices with implicit set to true.',
  ...object({
    format: { const: DRAMATIS_GAME_FORMAT },
    version: { const: DRAMATIS_GAME_VERSION },
    generatedAt: { type: 'string', format: 'date-time' },
    project: object({
      id,
      title: text,
      subtitle: text,
      author: text,
      language: { type: 'string', description: 'BCP 47 language of the work.' },
      type: { enum: ['novel', 'game'] },
      modules: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Optional modules of the project; data of a module that is off is left out.' },
      startScene: { type: ['string', 'null'], pattern: '^S\\d{3,}$', description: 'Code of the start scene.' },
    }),
    variables: list(object({
      id,
      name: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
      type: { enum: ['boolean', 'number', 'string'] },
      default: value,
      description: text,
    })),
    characters: list(object({
      id,
      name: text,
      aliases: list(text),
      importance: { enum: ['main', 'secondary', 'minor'] },
      role: { type: ['string', 'null'] },
      playable: { type: 'boolean' },
      tagline: text,
      voice: object({
        answers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Answers of the voice and performance section, by question key.' },
        text: { type: 'string', description: 'The section written as free text.' },
      }),
    })),
    locations: list(object({ id, name: text, kind: text, nation: text, region: text, city: text, description: text })),
    objects: list(object({ id, name: text, kind: text, description: text })),
    groups: list(object({
      id,
      name: text,
      kind: { enum: [...GROUP_KINDS] },
      description: text,
      members: list(object({ type: { enum: ['character', 'location', 'object'] }, id, role: text })),
    })),
    quests: list(object({
      id,
      name: text,
      kind: { enum: ['quest', 'side_quest'] },
      status: { enum: ['todo', 'progress', 'done'] },
      giver: { ...nullableId, description: 'Character id of the quest giver.' },
      description: text,
      objectives: list(object({ id: text, text, optional: { type: 'boolean' }, scene: { type: ['string', 'null'], description: 'Code of the scene that completes the objective.' } })),
      rewards: list(object({ id: text, text, object: { ...nullableId, description: 'Id of the object (item) given.' } })),
    })),
    scenes: list(object({
      code,
      id,
      title: text,
      act: { anyOf: [{ type: 'null' }, object({ id, title: text })] },
      chapter: object({ id, title: text }),
      kind: { enum: ['scene', 'cutscene', 'dialogue', 'gameplay', 'exploration', 'combat', 'puzzle'] },
      status: { enum: ['planned', 'draft', 'revised', 'final'] },
      start: { type: 'boolean' },
      ending: { type: 'boolean' },
      endingLabel: { type: ['string', 'null'] },
      synopsis: text,
      text: { type: 'string', description: 'Plain text of the active revision; dialogue lines as "Speaker: (direction) line".' },
      words: { type: 'integer', minimum: 0 },
      lines: list(object({
        id: { type: ['string', 'null'], pattern: '^S\\d{3,}-L\\d{3,}$', description: 'Stable line id (S014-L003).' },
        speakerId: { ...nullableId, description: 'Character id of the speaker, when the speaker is a character.' },
        speaker: { type: 'string', description: 'Name of the speaker, or the free label.' },
        direction: text,
        text,
      })),
      choices: list(object({
        text: { type: 'string', description: 'Text the player sees; empty for a plain continuation.' },
        target: code,
        implicit: { type: 'boolean', description: 'True for the implicit continuation to the next scene in manuscript order.' },
        condition: {
          anyOf: [
            { type: 'null' },
            object({
              mode: { enum: ['all', 'any'] },
              clauses: list(object({ ...variableRef, op: { enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_true', 'is_false'] }, value: nullableValue })),
            }),
          ],
        },
        effects: list(object({ ...variableRef, op: { enum: ['set', 'add', 'subtract', 'toggle'] }, value: nullableValue })),
      })),
    })),
  }),
} as const
