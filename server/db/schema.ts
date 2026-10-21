import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type {
  CharacterImportance,
  CharacterProfile,
  CharacterTraits,
  DurationUnit,
  EntityRef,
  EventKind,
  ExportWhat,
  FieldVersions,
  GroupKind,
  ImageOwnerType,
  LinkCondition,
  LinkEffect,
  MapNodes,
  MapSettings,
  PlanningStatus,
  PointOfView,
  ProjectKind,
  ProjectModules,
  ProjectSettings,
  QuestDetails,
  RelationKind,
  RelationStep,
  RaceDescription,
  Subrace,
  RichDoc,
  SceneKind,
  SceneStatus,
  SceneTags,
  SnapshotReason,
  StrandKind,
  UserPreferences,
  VariableType,
  WorldRefType,
} from '../../shared/types/domain'

/*
 * Conventions
 * - Every project-owned table has project_id with ON DELETE CASCADE: deleting a project deletes everything.
 * - Free text columns are NOT NULL DEFAULT '' so the UI never deals with null strings.
 * - Rich text is TipTap JSON (RichDoc) in jsonb, nullable (null = never written).
 * - deleted_at puts an item in the trash. Everything trashed by one action shares the same deleted_at
 *   (the trash batch) and is restored together. The bundle never returns trashed items.
 * - position orders siblings (chapters within a part, scenes within a chapter, characters within an importance...).
 * - versions holds a counter per long text field (premise, description...): a save based on an older
 *   version does not overwrite, the incoming text is kept as a conflict note (see server/utils/items.ts).
 * - meta is a free jsonb escape hatch for small feature-specific data that does not deserve a column.
 */

const bytea = customType<{ data: Buffer, driverData: Buffer }>({
  dataType: () => 'bytea',
})

const pk = () => uuid('id').primaryKey().defaultRandom()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
const deletedAt = () => timestamp('deleted_at', { withTimezone: true })
const position = () => integer('position').notNull().default(0)
const meta = () => jsonb('meta').$type<Record<string, unknown>>().notNull().default({})
const versions = () => jsonb('versions').$type<FieldVersions>().notNull().default({})
const planning = () => text('status').$type<PlanningStatus>().notNull().default('todo')
const projectRef = () =>
  uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' })
const uuids = (name: string) => uuid(name).array().notNull().default(sql`'{}'::uuid[]`)

export const users = pgTable('users', {
  id: pk(),
  /** Stored lowercased: unique case-insensitively. */
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  locale: text('locale').notNull().default('it'),
  /** IANA time zone; the writing log counts days in it. */
  timezone: text('timezone').notNull().default('Europe/Rome'),
  preferences: jsonb('preferences').$type<UserPreferences>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const projects = pgTable(
  'projects',
  {
    id: pk(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ProjectKind>().notNull().default('novel'),
    title: text('title').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    /** Author name printed in exports. */
    authorName: text('author_name').notNull().default(''),
    /** Language of the work itself (BCP 47), not of the UI. */
    language: text('language').notNull().default('it'),
    genre: text('genre').notNull().default(''),
    logline: text('logline').notNull().default(''),
    color: text('color').notNull().default(''),
    premise: jsonb('premise').$type<RichDoc | null>(),
    premiseStatus: text('premise_status').$type<PlanningStatus>().notNull().default('todo'),
    fabula: jsonb('fabula').$type<RichDoc | null>(),
    fabulaStatus: text('fabula_status').$type<PlanningStatus>().notNull().default('todo'),
    setting: jsonb('setting').$type<RichDoc | null>(),
    settingStatus: text('setting_status').$type<PlanningStatus>().notNull().default('todo'),
    wordGoal: integer('word_goal'),
    dailyWordGoal: integer('daily_word_goal'),
    /** YYYY-MM-DD */
    deadline: date('deadline', { mode: 'string' }),
    /** Optional modules switched on or off; defaults depend on kind (see shared/utils/modules.ts). */
    modules: jsonb('modules').$type<ProjectModules>().notNull().default({}),
    settings: jsonb('settings').$type<ProjectSettings>().notNull().default({}),
    /** Branching: the scene the story starts from. */
    startSceneId: uuid('start_scene_id'),
    /** Last scene number handed out: scene codes (S001...) are never reused. */
    sceneCounter: integer('scene_counter').notNull().default(0),
    versions: versions(),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** In the trash ("Eliminati"), restorable until deleted forever. */
    deletedAt: deletedAt(),
  },
  t => [index('projects_owner_idx').on(t.ownerId)],
)

export const characters = pgTable(
  'characters',
  {
    id: pk(),
    projectId: projectRef(),
    name: text('name').notNull(),
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    importance: text('importance').$type<CharacterImportance>().notNull().default('secondary'),
    /** A key of CHARACTER_ROLES, or '' when not set. */
    role: text('role').notNull().default(''),
    /** One-line description (up to 140 characters). */
    tagline: text('tagline').notNull().default(''),
    color: text('color').notNull().default(''),
    /** For secondary and minor characters (kept for main ones). */
    description: jsonb('description').$type<RichDoc | null>(),
    /** Profile sections (interview answers and free text), keyed by section. */
    profile: jsonb('profile').$type<CharacterProfile>().notNull().default({}),
    /** Qualities, flaws, contradictions: three ordered lists of short texts. */
    traits: jsonb('traits').$type<CharacterTraits>().notNull().default({}),
    /** Game projects: the player can control this character. */
    playable: boolean('playable').notNull().default(false),
    notes: jsonb('notes').$type<RichDoc | null>(),
    /** Free labels for filtering and grouping. */
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    status: planning(),
    position: position(),
    versions: versions(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('characters_project_idx').on(t.projectId)],
)

export const groups = pgTable(
  'groups',
  {
    id: pk(),
    projectId: projectRef(),
    name: text('name').notNull(),
    kind: text('kind').$type<GroupKind>().notNull().default('other'),
    color: text('color').notNull().default(''),
    description: jsonb('description').$type<RichDoc | null>(),
    language: jsonb('language').$type<RichDoc | null>(),
    traditions: jsonb('traditions').$type<RichDoc | null>(),
    powers: jsonb('powers').$type<RichDoc | null>(),
    notes: jsonb('notes').$type<RichDoc | null>(),
    /** Races: described freely (description and subraces) or guided (language, traditions, powers...). */
    describe: text('describe').$type<RaceDescription>().notNull().default('free'),
    /** Races: their branches, each with a name and a description. */
    subraces: jsonb('subraces').$type<Subrace[]>().notNull().default([]),
    status: planning(),
    position: position(),
    versions: versions(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('groups_project_idx').on(t.projectId)],
)

export const locations = pgTable(
  'locations',
  {
    id: pk(),
    projectId: projectRef(),
    /** Containing location (P2 nested locations; kept for data, not offered in the UI yet). */
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    /** Free kind such as city, house, room, region, level, hub. */
    kind: text('kind').notNull().default(''),
    nation: text('nation').notNull().default(''),
    region: text('region').notNull().default(''),
    city: text('city').notNull().default(''),
    color: text('color').notNull().default(''),
    description: jsonb('description').$type<RichDoc | null>(),
    notes: jsonb('notes').$type<RichDoc | null>(),
    status: planning(),
    position: position(),
    versions: versions(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('locations_project_idx').on(t.projectId)],
)

export const objects = pgTable(
  'objects',
  {
    id: pk(),
    projectId: projectRef(),
    name: text('name').notNull(),
    /** Free kind such as letter, weapon, key item. */
    kind: text('kind').notNull().default(''),
    color: text('color').notNull().default(''),
    description: jsonb('description').$type<RichDoc | null>(),
    notes: jsonb('notes').$type<RichDoc | null>(),
    status: planning(),
    position: position(),
    versions: versions(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('objects_project_idx').on(t.projectId)],
)

/** Images of characters, groups, locations, objects and codex entries. The first by position is the primary. */
export const images = pgTable(
  'images',
  {
    id: pk(),
    projectId: projectRef(),
    ownerType: text('owner_type').$type<ImageOwnerType>().notNull(),
    ownerId: uuid('owner_id').notNull(),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    caption: text('caption').notNull().default(''),
    /** Alternative text; defaults to the caption when empty. */
    alt: text('alt').notNull().default(''),
    position: position(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('images_owner_idx').on(t.projectId, t.ownerType, t.ownerId)],
)

export const strands = pgTable(
  'strands',
  {
    id: pk(),
    projectId: projectRef(),
    name: text('name').notNull(),
    kind: text('kind').$type<StrandKind>().notNull().default('plot'),
    color: text('color').notNull().default(''),
    description: jsonb('description').$type<RichDoc | null>(),
    /** Kind arc: the character whose arc this is. */
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    /** Kinds quest and side_quest (kept when the kind changes). */
    quest: jsonb('quest').$type<QuestDetails | null>(),
    status: planning(),
    position: position(),
    versions: versions(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('strands_project_idx').on(t.projectId)],
)

export const parts = pgTable(
  'parts',
  {
    id: pk(),
    projectId: projectRef(),
    title: text('title').notNull(),
    description: jsonb('description').$type<RichDoc | null>(),
    position: position(),
    versions: versions(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('parts_project_idx').on(t.projectId)],
)

export const chapters = pgTable(
  'chapters',
  {
    id: pk(),
    projectId: projectRef(),
    /** Set when the project uses parts, null otherwise. Position is relative to siblings with the same part. */
    partId: uuid('part_id').references(() => parts.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    /** Purpose of the chapter (bibisco's "reason"). */
    reason: jsonb('reason').$type<RichDoc | null>(),
    notes: jsonb('notes').$type<RichDoc | null>(),
    wordGoal: integer('word_goal'),
    position: position(),
    versions: versions(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('chapters_project_idx').on(t.projectId)],
)

export const scenes = pgTable(
  'scenes',
  {
    id: pk(),
    projectId: projectRef(),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    /** Stable code for the team (S001, S002...), given at creation, never changed nor reused. */
    code: text('code').notNull().default(''),
    title: text('title').notNull(),
    /** Plain text, up to 500 characters. */
    synopsis: text('synopsis').notNull().default(''),
    notes: jsonb('notes').$type<RichDoc | null>(),
    status: text('status').$type<SceneStatus>().notNull().default('planned'),
    kind: text('kind').$type<SceneKind>().notNull().default('scene'),
    pov: text('pov').$type<PointOfView | null>(),
    povCharacterId: uuid('pov_character_id').references(() => characters.id, { onDelete: 'set null' }),
    /** Story start: '1953', '1953-11', '1953-11-14', '1953-11-14T22:10' (years -9999 to 9999). */
    storyAt: text('story_at'),
    /** Shown instead of the formatted date ("Terza luna dell'anno 312"). */
    storyTimeLabel: text('story_time_label').notNull().default(''),
    durationValue: integer('duration_value'),
    durationUnit: text('duration_unit').$type<DurationUnit | null>(),
    /** Every tag of the scene, keyed by "<type>:<id>": manual flag, mentions and lines counts. */
    tags: jsonb('tags').$type<SceneTags>().notNull().default({}),
    /** Derived from tags (kept in sync by the server), for simple filtering. */
    characterIds: uuids('character_ids'),
    locationIds: uuids('location_ids'),
    objectIds: uuids('object_ids'),
    /** Strands the scene belongs to (manual). */
    strandIds: uuids('strand_ids'),
    /** Branching: this scene ends the story. */
    ending: boolean('ending').notNull().default(false),
    endingLabel: text('ending_label').notNull().default(''),
    /** Position on the flow graph, when the author moved it. */
    flowPosition: jsonb('flow_position').$type<{ x: number, y: number } | null>(),
    /** Last dialogue line number handed out in this scene (line ids S014-L003). */
    lineCounter: integer('line_counter').notNull().default(0),
    /** Of the active revision, kept in sync on every content save. */
    wordCount: integer('word_count').notNull().default(0),
    charCount: integer('char_count').notNull().default(0),
    charCountNoSpaces: integer('char_count_no_spaces').notNull().default(0),
    currentRevisionId: uuid('current_revision_id'),
    /** Last time the text was saved ("Riprendi"). */
    editedAt: timestamp('edited_at', { withTimezone: true }),
    position: position(),
    versions: versions(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [
    index('scenes_project_idx').on(t.projectId),
    index('scenes_chapter_idx').on(t.chapterId),
    uniqueIndex('scenes_project_code_idx').on(t.projectId, t.code),
  ],
)

export const sceneRevisions = pgTable(
  'scene_revisions',
  {
    id: pk(),
    projectId: projectRef(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    /** 1, 2, 3... in creation order within the scene. */
    number: integer('number').notNull(),
    label: text('label').notNull().default(''),
    content: jsonb('content').$type<RichDoc | null>(),
    /** Plain text of content, for search and export. */
    contentText: text('content_text').notNull().default(''),
    wordCount: integer('word_count').notNull().default(0),
    charCount: integer('char_count').notNull().default(0),
    charCountNoSpaces: integer('char_count_no_spaces').notNull().default(0),
    /** Incremented on every save; a save based on an older version becomes a conflict revision. */
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('scene_revisions_scene_idx').on(t.sceneId)],
)

/** The history of a revision (Cronologia): earlier states kept automatically. */
export const sceneSnapshots = pgTable(
  'scene_snapshots',
  {
    id: pk(),
    projectId: projectRef(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => sceneRevisions.id, { onDelete: 'cascade' }),
    content: jsonb('content').$type<RichDoc | null>(),
    wordCount: integer('word_count').notNull().default(0),
    reason: text('reason').$type<SnapshotReason>().notNull().default('auto'),
    createdAt: createdAt(),
  },
  t => [index('scene_snapshots_revision_idx').on(t.revisionId, t.createdAt)],
)

/** A choice (branch) from one scene to another, with an optional condition and effects on state variables. */
export const sceneLinks = pgTable(
  'scene_links',
  {
    id: pk(),
    projectId: projectRef(),
    fromSceneId: uuid('from_scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    toSceneId: uuid('to_scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    /** The text the player sees (up to 300 characters); empty = a plain continuation. */
    label: text('label').notNull().default(''),
    /** When the choice is available. No clauses = always. */
    conditions: jsonb('conditions').$type<LinkCondition>().notNull().default({ mode: 'all', clauses: [] }),
    /** What choosing it does to the state variables, in order. */
    effects: jsonb('effects').$type<LinkEffect[]>().notNull().default([]),
    position: position(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('scene_links_project_idx').on(t.projectId), index('scene_links_from_idx').on(t.fromSceneId)],
)

/** Game state variables referenced (by id) by choice conditions and effects. */
export const variables = pgTable(
  'variables',
  {
    id: pk(),
    projectId: projectRef(),
    /** Lowercase letters, digits and underscores, starting with a letter, up to 40 characters. */
    name: text('name').notNull(),
    type: text('type').$type<VariableType>().notNull().default('boolean'),
    defaultValue: text('default_value').notNull().default(''),
    description: text('description').notNull().default(''),
    position: position(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [uniqueIndex('variables_project_name_idx').on(t.projectId, t.name).where(sql`${t.deletedAt} is null`)],
)

/** A relationship between two entities (character, group, location, object). Group membership is one of them. */
export const relations = pgTable(
  'relations',
  {
    id: pk(),
    projectId: projectRef(),
    sourceType: text('source_type').$type<WorldRefType>().notNull(),
    sourceId: uuid('source_id').notNull(),
    targetType: text('target_type').$type<WorldRefType>().notNull(),
    targetId: uuid('target_id').notNull(),
    kind: text('kind').$type<RelationKind>().notNull().default('other'),
    /** What the source is to the target ("padre"). */
    label: text('label').notNull().default(''),
    /** What the target is to the source ("figlia"). */
    reverseLabel: text('reverse_label').notNull().default(''),
    description: text('description').notNull().default(''),
    /** true when the relationship reads one way (source towards target). */
    directed: boolean('directed').notNull().default(false),
    /** From 1 to 10: how strong it is, as the source feels it. */
    intensity: smallint('intensity').notNull().default(5),
    /** The same, as the target feels it. */
    reverseIntensity: smallint('reverse_intensity').notNull().default(5),
    /** How the relationship changes along the story, chapter by chapter, from each side's point of view. */
    evolution: jsonb('evolution').$type<RelationStep[]>().notNull().default([]),
    /** A character's membership in a race: the branch of the race (one of its `subraces`), or null. */
    subraceId: text('subrace_id'),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('relations_project_idx').on(t.projectId)],
)

/** A relation map: a named set of nodes with positions. Edges are the relationships among its nodes. */
export const maps = pgTable(
  'maps',
  {
    id: pk(),
    projectId: projectRef(),
    name: text('name').notNull(),
    /** Positions keyed by "<type>:<id>"; the keys are the map's nodes. */
    nodes: jsonb('nodes').$type<MapNodes>().notNull().default({}),
    settings: jsonb('settings').$type<MapSettings>().notNull().default({}),
    position: position(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('maps_project_idx').on(t.projectId)],
)

/** Timeline events that are not scenes: backstory, history of the world, real historical events. */
export const events = pgTable(
  'events',
  {
    id: pk(),
    projectId: projectRef(),
    title: text('title').notNull(),
    description: jsonb('description').$type<RichDoc | null>(),
    kind: text('kind').$type<EventKind>().notNull().default('story'),
    /** Same format as a scene's story start; null = undated. */
    at: text('at'),
    timeLabel: text('time_label').notNull().default(''),
    durationValue: integer('duration_value'),
    durationUnit: text('duration_unit').$type<DurationUnit | null>(),
    color: text('color').notNull().default(''),
    /** Linked characters, locations, objects and groups. */
    refs: jsonb('refs').$type<EntityRef[]>().notNull().default([]),
    position: position(),
    versions: versions(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('events_project_idx').on(t.projectId)],
)

/** The author's notebook: ideas, research, things to remember (and conflict copies of long texts). */
export const notes = pgTable(
  'notes',
  {
    id: pk(),
    projectId: projectRef(),
    title: text('title').notNull(),
    content: jsonb('content').$type<RichDoc | null>(),
    color: text('color').notNull().default(''),
    pinned: boolean('pinned').notNull().default(false),
    refs: jsonb('refs').$type<EntityRef[]>().notNull().default([]),
    position: position(),
    versions: versions(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('notes_project_idx').on(t.projectId)],
)

/** Codex (lore compendium) categories. Trashing a category trashes its entries in the same batch. */
export const codexCategories = pgTable(
  'codex_categories',
  {
    id: pk(),
    projectId: projectRef(),
    name: text('name').notNull(),
    position: position(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('codex_categories_project_idx').on(t.projectId)],
)

export const codexEntries = pgTable(
  'codex_entries',
  {
    id: pk(),
    projectId: projectRef(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => codexCategories.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: jsonb('body').$type<RichDoc | null>(),
    position: position(),
    versions: versions(),
    meta: meta(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  t => [index('codex_entries_project_idx').on(t.projectId)],
)

/** Uploaded image files (resized on the client before upload), with a thumbnail. */
export const media = pgTable(
  'media',
  {
    id: pk(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    mime: text('mime').notNull(),
    data: bytea('data').notNull(),
    thumb: bytea('thumb'),
    width: integer('width').notNull().default(0),
    height: integer('height').notNull().default(0),
    size: integer('size').notNull().default(0),
    createdAt: createdAt(),
  },
  t => [index('media_owner_idx').on(t.ownerId)],
)

/** Words written and removed per project and per day of the author (account time zone). */
export const writingLog = pgTable(
  'writing_log',
  {
    projectId: projectRef(),
    /** YYYY-MM-DD in the author's time zone at the time of the save. */
    day: date('day', { mode: 'string' }).notNull(),
    /** Sum of the positive word deltas of the day's editor saves. */
    added: integer('added').notNull().default(0),
    /** Sum of the negative word deltas, as a positive number. */
    removed: integer('removed').notNull().default(0),
    /** Total words of the project at the last save of the day. */
    total: integer('total').notNull().default(0),
    updatedAt: updatedAt(),
  },
  t => [primaryKey({ columns: [t.projectId, t.day] })],
)

/** Exports made, for the path ("a manuscript was exported while every scene was final"). The file is not kept. */
export const exportLog = pgTable(
  'export_log',
  {
    id: pk(),
    projectId: projectRef(),
    what: text('what').$type<ExportWhat>().notNull(),
    format: text('format').notNull(),
    /** Every scene was final at the time of the export. */
    allFinal: boolean('all_final').notNull().default(false),
    /** Game projects: the flow checks were clean. */
    flowClean: boolean('flow_clean').notNull().default(false),
    createdAt: createdAt(),
  },
  t => [index('export_log_project_idx').on(t.projectId)],
)
