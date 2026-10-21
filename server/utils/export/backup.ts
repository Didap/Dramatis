import { randomUUID } from 'node:crypto'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { strFromU8, strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import { z } from 'zod'
import {
  CHARACTER_IMPORTANCES,
  CHARACTER_ROLES,
  CONDITION_OPS,
  DURATION_UNITS,
  EFFECT_OPS,
  ENTITY_COLORS,
  EVENT_KINDS,
  EXPORT_WHATS,
  GROUP_KINDS,
  RACE_DESCRIPTIONS,
  IMAGE_OWNER_TYPES,
  MAX_UPLOAD_BYTES,
  PLANNING_STATUSES,
  POINTS_OF_VIEW,
  PROJECT_KINDS,
  REF_TYPES,
  RELATION_KINDS,
  SCENE_KINDS,
  SCENE_STATUSES,
  SNAPSHOT_REASONS,
  STRAND_KINDS,
  VARIABLE_TYPES,
  WORLD_REF_TYPES,
} from '#shared/utils/constants'
import { exportUnzip } from './limits'

/*
 * The project backup (spec 7.25, appendix D.9): a .zip with one JSON document (format name and version, the
 * project and every record, trashed ones included, with revisions, history, writing log and export log)
 * and the image files. Importing it creates a new project with new ids, keeps scene codes and line ids,
 * and reproduces the project exactly: export, import and a second export give the same JSON apart from
 * ids and times. New ids keep the order of the old ones, and times are kept, so rows come out in the
 * same order the second time.
 */

export const BACKUP_FORMAT = 'dramatis-backup'
/** 2: a relationship's intensity goes from 1 to 10 (1 to 3 in version 1, which is still read). */
export const BACKUP_VERSION = 2
const JSON_NAME = 'dramatis.json'

/** The project's tables in the order they are restored (every reference points backwards). */
const BACKUP_TABLES = {
  characters: tables.characters,
  groups: tables.groups,
  locations: tables.locations,
  objects: tables.objects,
  images: tables.images,
  strands: tables.strands,
  parts: tables.parts,
  chapters: tables.chapters,
  scenes: tables.scenes,
  sceneRevisions: tables.sceneRevisions,
  sceneSnapshots: tables.sceneSnapshots,
  links: tables.sceneLinks,
  variables: tables.variables,
  relations: tables.relations,
  maps: tables.maps,
  events: tables.events,
  notes: tables.notes,
  codexCategories: tables.codexCategories,
  codexEntries: tables.codexEntries,
  writingLog: tables.writingLog,
  exportLog: tables.exportLog,
} as const

type BackupTable = keyof typeof BACKUP_TABLES

/** Tables read a few hundred rows at a time: the texts and their history can be large. */
const BATCH: Partial<Record<BackupTable, number>> = { sceneRevisions: 100, sceneSnapshots: 100 }

const MEDIA_EXT: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }
const MEDIA_SRC_RE = /\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi

/** The largest JSON document a backup may hold, and the largest archive once unpacked. */
const MAX_JSON_BYTES = 200_000_000
const MAX_ARCHIVE_BYTES = 500_000_000

// ---------------------------------------------------------------- export

/**
 * The backup archive of a project: the JSON document, and the image files under media/. Every table is read in
 * one repeatable-read transaction, so a save landing meanwhile cannot leave a scene and its revisions from two
 * different moments. The document is written row by row into a streaming zip, and the event loop gets a turn
 * between pieces, so a long novel with its whole history does not hold up every other author.
 */
export async function buildBackup(projectId: string, ownerId: string): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let failure: Error | null = null
  const zip = new Zip((error, chunk) => {
    if (error) failure = error
    else chunks.push(chunk)
  })

  await useDb().transaction(async (tx) => {
    const [project] = await tx.select().from(tables.projects).where(and(eq(tables.projects.id, projectId), eq(tables.projects.ownerId, ownerId)))
    if (!project) throw createError({ statusCode: 404, message: 'Project not found' })
    const { ownerId: _owner, ...projectRow } = project

    const document = new ZipDeflate(JSON_NAME, { level: 6 })
    zip.add(document)
    let pending = ''
    const write = async (text: string, final = false) => {
      pending += text
      if (pending.length < 1_000_000 && !final) return
      document.push(strToU8(pending), final)
      pending = ''
      await nextTurn()
    }

    // The image files: those of the gallery (trashed ones too) and any linked from a text.
    const wanted = new Set<string>()
    const linked = (text: string) => {
      if (text.includes('/api/media/')) for (const match of text.matchAll(MEDIA_SRC_RE)) wanted.add(match[1]!.toLowerCase())
      return text
    }

    await write(`{"format":${JSON.stringify(BACKUP_FORMAT)},"version":${BACKUP_VERSION},"exportedAt":${JSON.stringify(new Date().toISOString())},\n"project":${linked(JSON.stringify(projectRow))}`)
    for (const [key, table] of Object.entries(BACKUP_TABLES) as [BackupTable, any][]) {
      const order = key === 'writingLog' ? [asc(table.day)] : [asc(table.createdAt), asc(table.id)]
      const size = BATCH[key] ?? 2000
      let written = 0
      await write(`,\n${JSON.stringify(key)}:[`)
      for (let offset = 0; ; offset += size) {
        const rows: Record<string, unknown>[] = await tx.select().from(table).where(eq(table.projectId, projectId)).orderBy(...order).limit(size).offset(offset)
        for (const { projectId: _p, ...row } of rows) {
          if (key === 'images') wanted.add(String(row.mediaId).toLowerCase())
          await write(`${written++ ? ',' : ''}\n${linked(JSON.stringify(row))}`)
        }
        if (rows.length < size) break
      }
      await write(']')
    }

    const m = tables.media
    const media = wanted.size
      ? await tx
          .select({ id: m.id, mime: m.mime, width: m.width, height: m.height, size: m.size, createdAt: m.createdAt, thumbed: sql<boolean>`${m.thumb} is not null and length(${m.thumb}) > 0` })
          .from(m)
          .where(and(eq(m.ownerId, ownerId), inArray(m.id, [...wanted])))
          .orderBy(asc(m.createdAt), asc(m.id))
      : []
    const entries = media.map((row) => {
      const ext = MEDIA_EXT[row.mime] ?? 'bin'
      return { id: row.id, mime: row.mime, width: row.width, height: row.height, size: row.size, createdAt: row.createdAt, file: `media/${row.id}.${ext}`, thumb: row.thumbed ? `media/${row.id}-thumb.${ext}` : null }
    })
    await write(`,\n"media":${JSON.stringify(entries)}}\n`, true)

    // The files, stored as they are (they are compressed images already), a few at a time.
    const add = (name: string, data: Uint8Array) => {
      const file = new ZipPassThrough(name)
      zip.add(file)
      file.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), true)
    }
    for (let i = 0; i < entries.length; i += 8) {
      const batch = entries.slice(i, i + 8)
      const rows = await tx.select({ id: m.id, data: m.data, thumb: m.thumb }).from(m).where(and(eq(m.ownerId, ownerId), inArray(m.id, batch.map(e => e.id))))
      const byId = new Map(rows.map(r => [r.id, r]))
      for (const entry of batch) {
        add(entry.file, byId.get(entry.id)?.data ?? new Uint8Array(0))
        if (entry.thumb) add(entry.thumb, byId.get(entry.id)?.thumb ?? new Uint8Array(0))
      }
      await nextTurn()
    }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })

  zip.end()
  if (failure) throw failure
  return Buffer.concat(chunks)
}

// ---------------------------------------------------------------- import: validation

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).transform(v => v.toLowerCase())
const nullableUuid = uuid.nullable().catch(null)
const time = z.string().max(64).refine(v => !Number.isNaN(Date.parse(v))).transform(v => new Date(v))
const created = time.optional().transform(v => v ?? new Date())
const nullableTime = time.nullable().optional().catch(null).transform(v => v ?? null)
/**
 * Text no longer than the API lets the field be (server/utils/validation.ts). A genuine backup never goes over;
 * a crafted one is cut to the limit rather than refused, so nothing else of the project is lost.
 */
const str = (max: number) => z.string().catch('').transform(v => v.slice(0, max))
const int = z.number().int().min(-1_000_000_000).max(1_000_000_000)
const count = int.min(0).catch(0)
/** A step of a relationship's evolution; a broken one is dropped by the filter after parsing. */
const relationStep = z.object({
  id: z.string().min(1).max(40),
  side: z.enum(['source', 'target']),
  chapterId: nullableUuid,
  intensity: z.number().int().min(1).max(10).catch(5),
  note: str(500),
}).nullable().catch(null)
const bool = z.boolean().catch(false)
const json = z.record(z.string(), z.unknown()).catch({})
const doc = zNullableDoc.optional().catch(null).transform(v => v ?? null)
const versions = z.record(z.string(), z.number().int().min(0)).catch({})
const oneOf = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) => z.enum(values).catch(fallback)
const nullableOneOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).nullable().catch(null)
/** A list of short texts, as the API keeps it: each one cut to `length`, at most `items` of them. */
const strings = (length: number, items: number) => z.array(z.unknown()).catch([]).transform(list => list.filter((v): v is string => typeof v === 'string' && !!v).map(v => v.slice(0, length)).slice(0, items))
const uuids = z.array(uuid).max(100_000).catch([])
/** One of the named entity colours, or none: anything else would reach a CSS variable name. */
const color = z.union([z.enum(ENTITY_COLORS), z.literal('')]).catch('')
const storyTime = z.string().regex(/^-?\d{1,4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01])(T([01]\d|2[0-3]):[0-5]\d)?)?)?$/).nullable().catch(null)
const point = z.object({ x: z.number().finite(), y: z.number().finite() })
const stamps = { createdAt: created, updatedAt: created, deletedAt: nullableTime }
/** Scene codes and variable names reach Twee passages, Ink knots and macros: they must have their own shape. */
const sceneCode = z.string().regex(/^S\d{3,9}$/, 'A scene code is S and digits (S014)')
const variableName = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Lowercase letters, digits and underscores, starting with a letter')
const clause = z.object({ variableId: uuid, op: z.enum(CONDITION_OPS), value: z.string().max(200).optional() })
const effect = z.object({ variableId: uuid, op: z.enum(EFFECT_OPS), value: z.string().max(200).optional() })

const ROW_SCHEMAS = {
  characters: z.object({ id: uuid, name: str(200), aliases: strings(100, 20), importance: oneOf(CHARACTER_IMPORTANCES, 'secondary'), role: z.union([z.enum(CHARACTER_ROLES), z.literal('')]).catch(''), tagline: str(140), color, description: doc, profile: json, traits: json, playable: bool, notes: doc, tags: strings(60, 40), status: oneOf(PLANNING_STATUSES, 'todo'), position: count, versions, meta: json, ...stamps }),
  groups: z.object({ id: uuid, name: str(200), kind: oneOf(GROUP_KINDS, 'other'), color, description: doc, language: doc, traditions: doc, powers: doc, notes: doc, describe: oneOf(RACE_DESCRIPTIONS, 'free'), subraces: z.array(z.object({ id: z.string().min(1).max(40), name: str(120), description: doc }).nullable().catch(null)).max(100).catch([]).transform(list => list.filter(s => !!s)), status: oneOf(PLANNING_STATUSES, 'todo'), position: count, versions, meta: json, ...stamps }),
  locations: z.object({ id: uuid, parentId: nullableUuid, name: str(200), kind: str(60), nation: str(120), region: str(120), city: str(120), color, description: doc, notes: doc, status: oneOf(PLANNING_STATUSES, 'todo'), position: count, versions, meta: json, ...stamps }),
  objects: z.object({ id: uuid, name: str(200), kind: str(60), color, description: doc, notes: doc, status: oneOf(PLANNING_STATUSES, 'todo'), position: count, versions, meta: json, ...stamps }),
  images: z.object({ id: uuid, ownerType: z.enum(IMAGE_OWNER_TYPES), ownerId: uuid, mediaId: uuid, caption: str(300), alt: str(300), position: count, ...stamps }),
  strands: z.object({ id: uuid, name: str(200), kind: oneOf(STRAND_KINDS, 'plot'), color, description: doc, characterId: nullableUuid, quest: json.nullable().catch(null), status: oneOf(PLANNING_STATUSES, 'todo'), position: count, versions, meta: json, ...stamps }),
  parts: z.object({ id: uuid, title: str(300), description: doc, position: count, versions, meta: json, ...stamps }),
  chapters: z.object({ id: uuid, partId: nullableUuid, title: str(300), reason: doc, notes: doc, wordGoal: int.nullable().catch(null), position: count, versions, meta: json, ...stamps }),
  scenes: z.object({
    id: uuid,
    chapterId: uuid,
    code: sceneCode,
    title: str(300),
    synopsis: str(500),
    notes: doc,
    status: oneOf(SCENE_STATUSES, 'planned'),
    kind: oneOf(SCENE_KINDS, 'scene'),
    pov: nullableOneOf(POINTS_OF_VIEW),
    povCharacterId: nullableUuid,
    storyAt: storyTime,
    storyTimeLabel: str(120),
    durationValue: int.nullable().catch(null),
    durationUnit: nullableOneOf(DURATION_UNITS),
    tags: z.record(z.string(), z.object({ manual: z.boolean().optional(), mentions: z.number().int().min(0).optional(), lines: z.number().int().min(0).optional() })).catch({}),
    characterIds: uuids,
    locationIds: uuids,
    objectIds: uuids,
    strandIds: uuids,
    ending: bool,
    endingLabel: str(120),
    flowPosition: point.nullable().catch(null),
    lineCounter: count,
    wordCount: count,
    charCount: count,
    charCountNoSpaces: count,
    currentRevisionId: nullableUuid,
    editedAt: nullableTime,
    position: count,
    versions,
    meta: json,
    ...stamps,
  }),
  sceneRevisions: z.object({ id: uuid, sceneId: uuid, number: count, label: str(200), content: doc, contentText: str(5_000_000), wordCount: count, charCount: count, charCountNoSpaces: count, version: count, ...stamps }),
  sceneSnapshots: z.object({ id: uuid, sceneId: uuid, revisionId: uuid, content: doc, wordCount: count, reason: oneOf(SNAPSHOT_REASONS, 'auto'), createdAt: created }),
  links: z.object({
    id: uuid,
    fromSceneId: uuid,
    toSceneId: uuid,
    label: str(300),
    conditions: z.object({ mode: z.enum(['all', 'any']).catch('all'), clauses: z.array(clause).max(20).catch([]) }).catch({ mode: 'all', clauses: [] }),
    effects: z.array(effect).max(20).catch([]),
    position: count,
    meta: json,
    ...stamps,
  }),
  variables: z.object({ id: uuid, name: variableName, type: oneOf(VARIABLE_TYPES, 'boolean'), defaultValue: str(200), description: str(1000), position: count, ...stamps }),
  relations: z.object({ id: uuid, sourceType: z.enum(WORLD_REF_TYPES), sourceId: uuid, targetType: z.enum(WORLD_REF_TYPES), targetId: uuid, kind: oneOf(RELATION_KINDS, 'other'), label: str(120), reverseLabel: str(120), description: str(2000), directed: bool, intensity: z.number().int().min(1).max(10).catch(5), reverseIntensity: z.number().int().min(1).max(10).catch(5), evolution: z.array(relationStep).max(200).catch([]), meta: json, ...stamps }),
  maps: z.object({ id: uuid, name: str(200), nodes: z.record(z.string(), point).catch({}), settings: json, position: count, ...stamps }),
  events: z.object({ id: uuid, title: str(200), description: doc, kind: oneOf(EVENT_KINDS, 'story'), at: storyTime, timeLabel: str(120), durationValue: int.nullable().catch(null), durationUnit: nullableOneOf(DURATION_UNITS), color, refs: z.array(z.object({ type: z.enum(REF_TYPES), id: uuid })).catch([]), position: count, versions, meta: json, ...stamps }),
  notes: z.object({ id: uuid, title: str(300), content: doc, color, pinned: bool, refs: z.array(z.object({ type: z.enum(REF_TYPES), id: uuid })).catch([]), position: count, versions, meta: json, ...stamps }),
  codexCategories: z.object({ id: uuid, name: str(200), position: count, ...stamps }),
  codexEntries: z.object({ id: uuid, categoryId: uuid, title: str(200), body: doc, position: count, versions, meta: json, ...stamps }),
  writingLog: z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), added: count, removed: count, total: count, updatedAt: created }),
  exportLog: z.object({ id: uuid, what: z.enum(EXPORT_WHATS), format: z.string().max(40), allFinal: bool, flowClean: bool, createdAt: created }),
} satisfies Record<BackupTable, z.ZodType>

const mediaSchema = z.object({
  id: uuid,
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  width: count,
  height: count,
  size: count,
  createdAt: created,
  file: z.string().max(300),
  thumb: z.string().max(300).nullable().catch(null),
})

const projectSchema = z.object({
  id: uuid,
  kind: oneOf(PROJECT_KINDS, 'novel'),
  title: str(200),
  subtitle: str(300),
  authorName: str(200),
  language: z.string().min(2).max(35).catch('it'),
  genre: str(100),
  logline: str(600),
  color,
  premise: doc,
  premiseStatus: oneOf(PLANNING_STATUSES, 'todo'),
  fabula: doc,
  fabulaStatus: oneOf(PLANNING_STATUSES, 'todo'),
  setting: doc,
  settingStatus: oneOf(PLANNING_STATUSES, 'todo'),
  wordGoal: int.nullable().catch(null),
  dailyWordGoal: int.nullable().catch(null),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  modules: z.record(z.string(), z.boolean()).catch({}),
  settings: json,
  startSceneId: nullableUuid,
  sceneCounter: count,
  versions,
  createdAt: created,
})

/** A failed import, with the reason the projects page shows ("notBackup", "version", "invalid", "tooLarge"). */
function refuse(reason: 'notBackup' | 'version' | 'invalid' | 'tooLarge', message: string, issues?: unknown): never {
  throw createError({ statusCode: reason === 'tooLarge' ? 413 : 400, message, data: { reason, issues } })
}

/**
 * Reads an uploaded backup: the .zip of an export, or its JSON document alone (without images). Nothing is
 * unpacked before its size is known to be reasonable (server/utils/export/limits.ts).
 */
export function readBackup(data: Uint8Array): { json: unknown, files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>()
  // A bare JSON document (it starts with "{", maybe after a BOM or spaces).
  const head = strFromU8(data.subarray(0, 16)).replace(/^﻿/, '').trimStart()
  if (head.startsWith('{')) {
    if (data.length > MAX_JSON_BYTES) refuse('tooLarge', 'The backup is too large')
    try {
      return { json: JSON.parse(strFromU8(data).replace(/^﻿/, '')), files }
    }
    catch {
      refuse('notBackup', 'The file is not a Dramatis backup')
    }
  }
  if (data[0] !== 0x50 || data[1] !== 0x4B) refuse('notBackup', 'The file is not a Dramatis backup')
  let entries: Record<string, Uint8Array>
  try {
    entries = exportUnzip(data, {
      entry: name => (name === JSON_NAME ? MAX_JSON_BYTES : /^media\/[0-9a-f-]{36}(?:-thumb)?\.(?:webp|png|jpg|bin)$/i.test(name) ? MAX_UPLOAD_BYTES * 2 : null),
      total: MAX_ARCHIVE_BYTES,
    })
  }
  catch (error) {
    if ((error as { data?: { reason?: string } })?.data?.reason) throw error
    refuse('notBackup', 'The file is not a Dramatis backup')
  }
  const document = entries[JSON_NAME]
  if (!document) refuse('notBackup', 'The archive has no dramatis.json')
  for (const [name, bytes] of Object.entries(entries)) if (name !== JSON_NAME) files.set(name, bytes)
  try {
    return { json: JSON.parse(strFromU8(document)), files }
  }
  catch {
    refuse('invalid', 'The backup document is damaged')
  }
}

// ---------------------------------------------------------------- import: restore

type Row = Record<string, any>

/** New ids for old ones, in the same order (so a second export lists rows in the same order). */
function orderedIds(old: Iterable<string>): Map<string, string> {
  const before = [...new Set(old)].sort()
  const after = before.map(() => randomUUID()).sort()
  return new Map(before.map((id, i) => [id, after[i]!]))
}

const REF_STRING = /^(?:(character|group|location|object|strand|chapter|scene|event|note|codex):)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
/** A line bent on a map, one per side of a relationship ("<relationId>:source"). */
const LINE_KEY = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(source|target)$/i

/**
 * Gives every reference its new id: strings that are an id, a "<type>:<id>" reference (mentions, tags,
 * map nodes) or an image address, and object keys of the same shape. The author's text is never touched.
 */
function remap(value: unknown, ids: Map<string, string>): unknown {
  const swap = (text: string): string => {
    const ref = REF_STRING.exec(text)
    if (ref) {
      const next = ids.get(ref[2]!.toLowerCase())
      return next ? `${ref[1] ? `${ref[1]}:` : ''}${next}` : text
    }
    const line = LINE_KEY.exec(text)
    if (line) return ids.has(line[1]!.toLowerCase()) ? `${ids.get(line[1]!.toLowerCase())}:${line[2]}` : text
    if (text.includes('/api/media/')) return text.replace(MEDIA_SRC_RE, (match, id: string) => (ids.has(id.toLowerCase()) ? `/api/media/${ids.get(id.toLowerCase())}` : match))
    return text
  }
  if (typeof value === 'string') return swap(value)
  if (Array.isArray(value)) return value.map(v => remap(v, ids))
  if (value instanceof Date || value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) out[swap(key)] = remap(inner, ids)
  return out
}

/**
 * The project's settings as the settings page would accept them: a setting that does not fit is left out.
 * The IFID of the Twine story is left out too: the copy is another story, and gets its own at its first
 * Twee export (A11's "Duplica" goes through here as well).
 */
function restoredSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const { ifid: _ifid, ...settings } = raw
  for (let attempt = 0; attempt < 12; attempt++) {
    const parsed = projectSettingsSchema.safeParse(settings)
    if (parsed.success) return parsed.data
    for (const issue of parsed.error.issues) delete settings[String(issue.path[0])]
  }
  return {}
}

/** Refuses a backup in which a value that must be unique is not (the database would answer a 500). */
function assertUnique(table: string, field: string, values: string[]) {
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) refuse('invalid', `${field} ${value} is repeated in ${table}`, [{ path: [table, index, field], message: 'Repeated' }])
    seen.add(value)
  }
}

/** Version 1 measured intensity 1 weak, 2 normal, 3 strong: on today's scale 3, 5 and 8. */
const FROM_VERSION_1: Record<number, number> = { 1: 3, 2: 5, 3: 8 }

function intensityFromVersion1(relation: Row) {
  const convert = (n: unknown) => FROM_VERSION_1[n as number] ?? 5
  relation.intensity = convert(relation.intensity)
  relation.reverseIntensity = convert(relation.reverseIntensity)
  // A broken step is null here, and the filter after parsing drops it.
  relation.evolution = (relation.evolution as (Row | null)[]).map(step => (step ? { ...step, intensity: convert(step.intensity) } : step))
}

/**
 * Creates a new project of the user from a backup. Everything is validated, every id is new, and a
 * reference to anything outside the backup is dropped, so a crafted file cannot point into another project.
 * `untitled` names a project whose backup has no title.
 */
export async function restoreBackup(userId: string, input: unknown, files: Map<string, Uint8Array>, options: { untitled?: string } = {}) {
  const raw = input as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object' || raw.format !== BACKUP_FORMAT) refuse('notBackup', 'The file is not a Dramatis backup')
  if (raw.version !== BACKUP_VERSION && raw.version !== 1) refuse('version', `Backup version ${String(raw.version)} is not supported`)

  const parsedProject = projectSchema.safeParse(raw.project)
  if (!parsedProject.success) refuse('invalid', 'The project in the backup is not valid', parsedProject.error.issues.slice(0, 5))
  const rows = {} as Record<BackupTable, Row[]>
  for (const key of Object.keys(BACKUP_TABLES) as BackupTable[]) {
    const list = Array.isArray(raw[key]) ? (raw[key] as unknown[]) : []
    if (list.length > 200_000) refuse('tooLarge', 'The backup is too large')
    rows[key] = []
    for (const [index, item] of list.entries()) {
      const parsed = ROW_SCHEMAS[key].safeParse(item)
      if (!parsed.success) refuse('invalid', `Row ${index} of ${key} is not valid`, parsed.error.issues.slice(0, 5).map(i => ({ ...i, path: [key, index, ...i.path] })))
      rows[key].push(parsed.data as Row)
    }
    if (key !== 'writingLog') assertUnique(key, 'id', rows[key].map(r => r.id as string))
  }
  if (raw.version === 1) for (const relation of rows.relations) intensityFromVersion1(relation)
  const mediaRows = (Array.isArray(raw.media) ? raw.media : []).flatMap((item) => {
    const parsed = mediaSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
  assertUnique('media', 'id', mediaRows.map(m => m.id))
  // What the database keeps unique: scene codes (trashed scenes too), the names of live variables, one log per day.
  assertUnique('scenes', 'code', rows.scenes.map(s => s.code as string))
  assertUnique('variables', 'name', rows.variables.filter(v => !v.deletedAt).map(v => v.name as string))
  assertUnique('writingLog', 'day', rows.writingLog.map(w => w.day as string))

  // ---- new ids, in the order of the old ones
  const oldIds: string[] = [parsedProject.data.id, ...mediaRows.map(m => m.id)]
  for (const key of Object.keys(rows) as BackupTable[]) for (const row of rows[key]) if (row.id) oldIds.push(row.id)
  const ids = orderedIds(oldIds)
  const project = remap(parsedProject.data, ids) as Row
  for (const key of Object.keys(rows) as BackupTable[]) rows[key] = rows[key].map(row => remap(row, ids) as Row)
  if (!project.title.trim()) project.title = options.untitled ?? 'Dramatis'
  project.settings = restoredSettings(project.settings as Row)
  // The next scene gets a code no scene of the backup has (codes are never reused).
  project.sceneCounter = rows.scenes.reduce((n, s) => Math.max(n, Number((s.code as string).slice(1))), project.sceneCounter as number)

  // ---- the image files present in the archive (a JSON backup alone brings none)
  const media = mediaRows.flatMap((m) => {
    const data = files.get(m.file)
    if (!data || data.length > MAX_UPLOAD_BYTES * 2) return []
    const thumb = m.thumb ? files.get(m.thumb) : undefined
    return [{ ...m, id: ids.get(m.id)!, data: Buffer.from(data), thumb: thumb && thumb.length <= MAX_UPLOAD_BYTES ? Buffer.from(thumb) : null }]
  })

  // ---- keep only references to what the backup itself contains
  const idSet = (list: Row[]) => {
    const set = new Set(list.map(r => r.id as string))
    return (id: string | null | undefined) => !!id && set.has(id)
  }
  const isMedia = idSet(media)
  const isCharacter = idSet(rows.characters)
  const isLocation = idSet(rows.locations)
  const isObject = idSet(rows.objects)
  const isStrand = idSet(rows.strands)
  const isPart = idSet(rows.parts)
  const isChapter = idSet(rows.chapters)
  const isVariable = idSet(rows.variables)
  const isCategory = idSet(rows.codexCategories)
  rows.scenes = rows.scenes.filter(s => isChapter(s.chapterId))
  const isScene = idSet(rows.scenes)
  rows.sceneRevisions = rows.sceneRevisions.filter(r => isScene(r.sceneId))
  const revisionScene = new Map(rows.sceneRevisions.map(r => [r.id as string, r.sceneId as string]))
  const isRevision = idSet(rows.sceneRevisions)
  rows.codexEntries = rows.codexEntries.filter(e => isCategory(e.categoryId))
  const owners: Record<string, (id: string) => boolean> = { character: isCharacter, group: idSet(rows.groups), location: isLocation, object: isObject, codex: idSet(rows.codexEntries) }
  const refs: Record<string, (id: string) => boolean> = { ...owners, strand: isStrand, chapter: isChapter, scene: isScene, event: idSet(rows.events), note: idSet(rows.notes) }
  const isRef = (type: string, id: string) => !!refs[type]?.(id)
  const isRefKey = (key: string) => {
    const [type, id] = key.split(':')
    return !!type && !!id && isRef(type, id)
  }

  rows.images = rows.images.filter(i => isMedia(i.mediaId) && owners[i.ownerType]?.(i.ownerId))
  for (const l of rows.locations) if (!isLocation(l.parentId)) l.parentId = null
  for (const s of rows.strands) {
    if (!isCharacter(s.characterId)) s.characterId = null
    const quest = s.quest as Row | null
    if (quest) {
      if (quest.giverId && !isCharacter(quest.giverId)) quest.giverId = null
      if (quest.locationId && !isLocation(quest.locationId)) quest.locationId = null
      if (Array.isArray(quest.objectives)) for (const o of quest.objectives) if (o?.sceneId && !isScene(o.sceneId)) o.sceneId = null
      if (Array.isArray(quest.rewards)) for (const r of quest.rewards) if (r?.objectId && !isObject(r.objectId)) r.objectId = null
    }
  }
  for (const c of rows.chapters) if (!isPart(c.partId)) c.partId = null
  for (const s of rows.scenes) {
    if (!isCharacter(s.povCharacterId)) s.povCharacterId = null
    // The active revision must be one of the scene's own.
    if (!isRevision(s.currentRevisionId) || revisionScene.get(s.currentRevisionId) !== s.id) s.currentRevisionId = null
    s.characterIds = s.characterIds.filter(isCharacter)
    s.locationIds = s.locationIds.filter(isLocation)
    s.objectIds = s.objectIds.filter(isObject)
    s.strandIds = s.strandIds.filter(isStrand)
    s.tags = Object.fromEntries(Object.entries(s.tags as Row).filter(([key]) => isRefKey(key)))
  }
  rows.sceneSnapshots = rows.sceneSnapshots.filter(s => isScene(s.sceneId) && isRevision(s.revisionId))
  rows.links = rows.links.filter(l => isScene(l.fromSceneId) && isScene(l.toSceneId))
  for (const l of rows.links) {
    l.conditions = { ...l.conditions, clauses: (l.conditions.clauses as Row[]).filter(c => isVariable(c.variableId)) }
    l.effects = (l.effects as Row[]).filter(e => isVariable(e.variableId))
  }
  rows.relations = rows.relations.filter(r => owners[r.sourceType]?.(r.sourceId) && owners[r.targetType]?.(r.targetId))
  for (const r of rows.relations) {
    r.evolution = (r.evolution as (Row | null)[]).filter((s): s is Row => !!s).map(s => (s.chapterId && !isChapter(s.chapterId) ? { ...s, chapterId: null } : s))
  }
  for (const m of rows.maps) {
    m.nodes = Object.fromEntries(Object.entries(m.nodes as Row).filter(([key]) => isRefKey(key)))
    const settings = m.settings as Row
    if (Array.isArray(settings.refs)) settings.refs = settings.refs.filter((r: unknown) => typeof r === 'string' && isRefKey(r))
  }
  for (const key of ['events', 'notes'] as const) for (const row of rows[key]) row.refs = (row.refs as Row[]).filter(r => isRef(r.type, r.id))
  if (!isScene(project.startSceneId)) project.startSceneId = null

  // ---- write everything in one transaction
  const now = new Date()
  return useDb().transaction(async (tx) => {
    const [created] = await tx.insert(tables.projects).values({
      ...(project as typeof tables.projects.$inferInsert),
      ownerId: userId,
      openedAt: now,
      updatedAt: now,
      deletedAt: null,
    }).returning()
    const pid = created!.id

    for (let i = 0; i < media.length; i += 20) {
      await tx.insert(tables.media).values(media.slice(i, i + 20).map(m => ({
        id: m.id,
        ownerId: userId,
        projectId: pid,
        mime: m.mime,
        data: m.data,
        thumb: m.thumb,
        width: m.width,
        height: m.height,
        size: m.data.length,
        createdAt: m.createdAt,
      })))
    }
    for (const key of Object.keys(BACKUP_TABLES) as BackupTable[]) {
      const list = rows[key]
      const size = key === 'sceneSnapshots' || key === 'sceneRevisions' ? 25 : 200
      for (let i = 0; i < list.length; i += size) {
        await tx.insert(BACKUP_TABLES[key] as any).values(list.slice(i, i + size).map(row => ({ ...row, projectId: pid })))
      }
    }
    return created!
  })
}
