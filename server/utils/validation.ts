import type { H3Event } from 'h3'
import { z } from 'zod'
import type { Collection, RichDoc } from '../../shared/types/domain'
import {
  CHARACTER_IMPORTANCES,
  CHARACTER_ROLES,
  CONDITION_OPS,
  DIALOGUE_STYLES,
  DURATION_UNITS,
  EFFECT_OPS,
  ENTITY_COLORS,
  EVENT_KINDS,
  GROUP_KINDS,
  IMAGE_OWNER_TYPES,
  PLANNING_STATUSES,
  POINTS_OF_VIEW,
  PROJECT_KINDS,
  PROJECT_MODULES,
  REF_TYPES,
  RELATION_KINDS,
  SCENE_KINDS,
  SCENE_STATUSES,
  STRAND_KINDS,
  VARIABLE_TYPES,
  WORLD_REF_TYPES,
} from '#shared/utils/constants'

function invalid(issues: z.core.$ZodIssue[]): never {
  throw createError({
    statusCode: 400,
    message: 'Invalid request',
    data: { issues: issues.map(i => ({ path: i.path.join('.'), message: i.message })) },
  })
}

/** Reads and validates the JSON body; answers 400 with the list of issues when it does not match. */
export async function parseBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  const body = await readBody(event).catch(() => undefined)
  const result = schema.safeParse(body ?? {})
  if (!result.success) invalid(result.error.issues)
  return result.data
}

/** Validates query parameters. */
export function parseQuery<T extends z.ZodType>(event: H3Event, schema: T): z.output<T> {
  const result = schema.safeParse(getQuery(event))
  if (!result.success) invalid(result.error.issues)
  return result.data
}

const MAX_DOC_CHARS = 3_000_000

export const zRichDoc = z.custom<RichDoc>(
  value =>
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { type?: unknown }).type === 'doc'
    && JSON.stringify(value).length <= MAX_DOC_CHARS,
  { message: 'Invalid document' },
)

export const zNullableDoc = zRichDoc.nullable()
export const zUuid = z.uuid()
export const zNullableUuid = z.uuid().nullable()
export const zName = z.string().trim().min(1).max(200)
export const zTitle = z.string().trim().max(300)
export const zText = (max: number) => z.string().trim().max(max)
export const zColor = z.union([z.enum(ENTITY_COLORS), z.literal('')])
export const zTags = z.array(z.string().trim().min(1).max(60)).max(40)
export const zMeta = z.record(z.string(), z.unknown())
export const zPosition = z.number().int().min(0).max(1_000_000)
export const zStatus = z.enum(PLANNING_STATUSES)
/** Day in the author's time zone. */
export const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** A story start: a year, year-month, date or date and time, years -9999 to 9999. */
export const zStoryTime = z.string().regex(/^-?\d{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01])(T([01]\d|2[0-3]):[0-5]\d)?)?)?$/)
export const zEntityRef = z.object({ type: z.enum(REF_TYPES), id: zUuid })
const zDurationValue = z.number().int().min(0).max(1_000_000).nullable()
const zDurationUnit = z.enum(DURATION_UNITS).nullable()

const zProfile = z.record(
  z.string().max(40),
  z.object({
    mode: z.enum(['interview', 'free']).optional(),
    answers: z.record(z.string().max(80), z.string().max(20_000)).optional(),
    free: zNullableDoc.optional(),
  }),
)

const zTraits = z.object({
  qualities: z.array(zText(200)).max(40).optional(),
  flaws: z.array(zText(200)).max(40).optional(),
  contradictions: z.array(zText(200)).max(40).optional(),
})

const zQuest = z
  .object({
    giverId: zNullableUuid.optional(),
    locationId: zNullableUuid.optional(),
    objectives: z
      .array(z.object({ id: z.string().min(1).max(40), text: zText(500), optional: z.boolean().optional(), sceneId: zNullableUuid.optional() }))
      .max(100)
      .optional(),
    rewards: z
      .array(z.object({ id: z.string().min(1).max(40), text: zText(500), objectId: zNullableUuid.optional() }))
      .max(50)
      .optional(),
    prerequisites: zText(2000).optional(),
  })
  .nullable()

const zConditions = z.object({
  mode: z.enum(['all', 'any']),
  clauses: z.array(z.object({ variableId: zUuid, op: z.enum(CONDITION_OPS), value: zText(200).optional() })).max(20),
})
const zEffects = z.array(z.object({ variableId: zUuid, op: z.enum(EFFECT_OPS), value: zText(200).optional() })).max(20)

/** Writable fields of every generic collection. Server-managed fields (code, counters, tags, versions) are not here. */
export const collectionSchemas = {
  characters: z.object({
    name: zName,
    aliases: z.array(z.string().trim().min(1).max(100)).max(20),
    importance: z.enum(CHARACTER_IMPORTANCES),
    role: z.union([z.enum(CHARACTER_ROLES), z.literal('')]),
    tagline: zText(140),
    color: zColor,
    description: zNullableDoc,
    profile: zProfile,
    traits: zTraits,
    playable: z.boolean(),
    notes: zNullableDoc,
    tags: zTags,
    status: zStatus,
    position: zPosition,
    meta: zMeta,
  }),
  groups: z.object({
    name: zName,
    kind: z.enum(GROUP_KINDS),
    color: zColor,
    description: zNullableDoc,
    language: zNullableDoc,
    traditions: zNullableDoc,
    powers: zNullableDoc,
    notes: zNullableDoc,
    status: zStatus,
    position: zPosition,
    meta: zMeta,
  }),
  locations: z.object({
    parentId: zNullableUuid,
    name: zName,
    kind: zText(60),
    nation: zText(120),
    region: zText(120),
    city: zText(120),
    color: zColor,
    description: zNullableDoc,
    notes: zNullableDoc,
    status: zStatus,
    position: zPosition,
    meta: zMeta,
  }),
  objects: z.object({
    name: zName,
    kind: zText(60),
    color: zColor,
    description: zNullableDoc,
    notes: zNullableDoc,
    status: zStatus,
    position: zPosition,
    meta: zMeta,
  }),
  images: z.object({
    ownerType: z.enum(IMAGE_OWNER_TYPES),
    ownerId: zUuid,
    mediaId: zUuid,
    caption: zText(300),
    alt: zText(300),
    position: zPosition,
  }),
  strands: z.object({
    name: zName,
    kind: z.enum(STRAND_KINDS),
    color: zColor,
    description: zNullableDoc,
    characterId: zNullableUuid,
    quest: zQuest,
    status: zStatus,
    position: zPosition,
    meta: zMeta,
  }),
  parts: z.object({
    title: zTitle,
    description: zNullableDoc,
    position: zPosition,
    meta: zMeta,
  }),
  chapters: z.object({
    partId: zNullableUuid,
    title: zTitle,
    reason: zNullableDoc,
    notes: zNullableDoc,
    wordGoal: z.number().int().min(0).max(10_000_000).nullable(),
    position: zPosition,
    meta: zMeta,
  }),
  scenes: z.object({
    chapterId: zUuid,
    title: zTitle,
    synopsis: zText(500),
    notes: zNullableDoc,
    status: z.enum(SCENE_STATUSES),
    kind: z.enum(SCENE_KINDS),
    pov: z.enum(POINTS_OF_VIEW).nullable(),
    povCharacterId: zNullableUuid,
    storyAt: zStoryTime.nullable(),
    storyTimeLabel: zText(120),
    durationValue: zDurationValue,
    durationUnit: zDurationUnit,
    /** The complete list of manual tags; mentions and dialogue tags are computed by the server. */
    manualTags: z.array(z.object({ type: z.enum(['character', 'location', 'object']), id: zUuid })).max(1000),
    strandIds: z.array(zUuid).max(500),
    ending: z.boolean(),
    endingLabel: zText(120),
    flowPosition: z.object({ x: z.number().finite(), y: z.number().finite() }).nullable(),
    position: zPosition,
    meta: zMeta,
  }),
  links: z.object({
    fromSceneId: zUuid,
    toSceneId: zUuid,
    label: zText(300),
    conditions: zConditions,
    effects: zEffects,
    position: zPosition,
    meta: zMeta,
  }),
  variables: z.object({
    name: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Lowercase letters, digits and underscores, starting with a letter'),
    type: z.enum(VARIABLE_TYPES),
    defaultValue: zText(200),
    description: zText(1000),
    position: zPosition,
  }),
  relations: z.object({
    sourceType: z.enum(WORLD_REF_TYPES),
    sourceId: zUuid,
    targetType: z.enum(WORLD_REF_TYPES),
    targetId: zUuid,
    kind: z.enum(RELATION_KINDS),
    label: zText(120),
    reverseLabel: zText(120),
    description: zText(2000),
    directed: z.boolean(),
    intensity: z.number().int().min(1).max(3),
    meta: zMeta,
  }),
  maps: z.object({
    name: zName,
    nodes: z.record(z.string().max(80), z.object({ x: z.number().finite(), y: z.number().finite() })),
    settings: z.object({
      include: z.partialRecord(z.enum(WORLD_REF_TYPES), z.boolean()).optional(),
      kinds: z.array(z.enum(RELATION_KINDS)).optional(),
      refs: z.array(z.string().max(80)).max(2000).optional(),
      viewport: z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().finite() }).optional(),
    }),
    position: zPosition,
  }),
  events: z.object({
    title: zName,
    description: zNullableDoc,
    kind: z.enum(EVENT_KINDS),
    at: zStoryTime.nullable(),
    timeLabel: zText(120),
    durationValue: zDurationValue,
    durationUnit: zDurationUnit,
    color: zColor,
    refs: z.array(zEntityRef).max(200),
    position: zPosition,
    meta: zMeta,
  }),
  notes: z.object({
    title: zTitle,
    content: zNullableDoc,
    color: zColor,
    pinned: z.boolean(),
    refs: z.array(zEntityRef).max(200),
    position: zPosition,
    meta: zMeta,
  }),
  codexCategories: z.object({
    name: zName,
    position: zPosition,
  }),
  codexEntries: z.object({
    categoryId: zUuid,
    title: zName,
    body: zNullableDoc,
    position: zPosition,
    meta: zMeta,
  }),
} satisfies Record<Collection, z.ZodObject>

/** Fields required when creating an item; everything else is optional and gets a default. */
export const requiredOnCreate: Record<Collection, readonly string[]> = {
  characters: ['name'],
  groups: ['name'],
  locations: ['name'],
  objects: ['name'],
  images: ['ownerType', 'ownerId', 'mediaId'],
  strands: ['name'],
  parts: [],
  chapters: [],
  scenes: ['chapterId'],
  links: ['fromSceneId', 'toSceneId'],
  variables: ['name'],
  relations: ['sourceType', 'sourceId', 'targetType', 'targetId'],
  maps: ['name'],
  events: ['title'],
  notes: [],
  codexCategories: ['name'],
  codexEntries: ['categoryId', 'title'],
}

/** Base versions of long text fields, sent with a save: `{ "$base": { "description": 3 } }`. */
const zBase = z.record(z.string().max(40), z.number().int().min(0)).optional()

export function createSchema(collection: Collection): z.ZodType<Record<string, unknown>> {
  const base = (collectionSchemas[collection] as z.ZodObject<z.ZodRawShape>).partial()
  const required = requiredOnCreate[collection]
  if (!required.length) return base
  return base.required(Object.fromEntries(required.map(k => [k, true])) as Record<string, true>)
}

export function updateSchema(collection: Collection): z.ZodType<Record<string, unknown>> {
  return (collectionSchemas[collection] as z.ZodObject<z.ZodRawShape>).partial().extend({ $base: zBase })
}

/** A word of a project's spelling dictionary: letters, apostrophes and hyphens, no spaces. */
export const zSpellWord = z.string().trim().min(1).max(60).regex(/^[\p{L}\p{M}'’-]+$/u)
export const DICTIONARY_MAX = 5000

export const projectSettingsSchema = z
  .object({
    chapterNumbering: z.enum(['arabic', 'roman', 'words', 'none']).optional(),
    sceneSeparator: zText(20).optional(),
    dialogueStyle: z.enum(DIALOGUE_STYLES).optional(),
    smartTypography: z.boolean().optional(),
    guidance: z.boolean().optional(),
    parts: z.boolean().optional(),
    customQuestions: z
      .record(z.string().max(40), z.array(z.object({ key: z.string().max(80), label: zText(300) })).max(100))
      .optional(),
    dictionary: z.array(zSpellWord).max(DICTIONARY_MAX).optional(),
  })
  .loose()

export const projectUpdateSchema = z
  .object({
    kind: z.enum(PROJECT_KINDS),
    title: zName,
    subtitle: zText(300),
    authorName: zText(200),
    language: z.string().trim().min(2).max(35),
    genre: zText(100),
    logline: zText(600),
    color: zColor,
    premise: zNullableDoc,
    premiseStatus: zStatus,
    fabula: zNullableDoc,
    fabulaStatus: zStatus,
    setting: zNullableDoc,
    settingStatus: zStatus,
    wordGoal: z.number().int().min(0).max(10_000_000).nullable(),
    dailyWordGoal: z.number().int().min(0).max(1_000_000).nullable(),
    deadline: zDay.nullable(),
    modules: z.partialRecord(z.enum(PROJECT_MODULES), z.boolean()),
    settings: projectSettingsSchema,
    startSceneId: zNullableUuid,
    $base: zBase,
  })
  .partial()

export const projectCreateSchema = z.object({
  title: zText(200).optional(),
  kind: z.enum(PROJECT_KINDS).default('novel'),
  subtitle: zText(300).optional(),
  authorName: zText(200).optional(),
  language: z.string().trim().min(2).max(35).optional(),
  genre: zText(100).optional(),
  logline: zText(600).optional(),
  color: zColor.optional(),
  wordGoal: z.number().int().min(0).max(10_000_000).nullable().optional(),
  dailyWordGoal: z.number().int().min(0).max(1_000_000).nullable().optional(),
  deadline: zDay.nullable().optional(),
  /** Key of a structure template (shared/content/structures.ts). */
  structure: z.string().max(60).optional(),
})
