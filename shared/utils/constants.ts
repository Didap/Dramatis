import type { CharacterRole, Collection, EntityColor, RefType, RelationKind, StrandKind } from '../types/domain'

/*
 * Fixed enumerations shared by the app and the server.
 * Keys are stored in the database: never rename one without a migration.
 * Labels live in i18n/locales/<locale>/common.json under common.enums.<enum>.<key>.
 */

export const PROJECT_KINDS = ['novel', 'game'] as const

export const SCENE_STATUSES = ['planned', 'draft', 'revised', 'final'] as const

export const PLANNING_STATUSES = ['todo', 'progress', 'done'] as const

export const CHARACTER_IMPORTANCES = ['main', 'secondary', 'minor'] as const

export const CHARACTER_ROLES = [
  'protagonist',
  'antagonist',
  'deuteragonist',
  'mentor',
  'ally',
  'love_interest',
  'confidant',
  'foil',
  'trickster',
  'narrator',
  'player_character',
  'companion',
  'boss',
  'quest_giver',
  'merchant',
  'npc',
  'other',
] as const

/** Roles that only make sense in game projects (hidden in novels unless already set). */
export const GAME_ONLY_ROLES: readonly CharacterRole[] = ['player_character', 'companion', 'boss', 'quest_giver', 'merchant', 'npc']

export const POINTS_OF_VIEW = ['first', 'second', 'third_limited', 'third_omniscient', 'third_objective', 'multiple'] as const

export const STRAND_KINDS = ['plot', 'subplot', 'arc', 'quest', 'side_quest'] as const

/** Strand kinds that need the quests module. */
export const QUEST_KINDS: readonly StrandKind[] = ['quest', 'side_quest']

export const RELATION_KINDS = [
  'family',
  'romance',
  'friendship',
  'alliance',
  'rivalry',
  'enmity',
  'mentorship',
  'professional',
  'ownership',
  'place',
  'membership',
  'other',
] as const

export const GROUP_KINDS = ['family', 'faction', 'organization', 'culture', 'other'] as const

export const SCENE_KINDS = ['scene', 'cutscene', 'dialogue', 'gameplay', 'exploration', 'combat', 'puzzle'] as const

export const FLOW_ROLES = ['start', 'ending'] as const

export const VARIABLE_TYPES = ['boolean', 'number', 'string'] as const

export const EVENT_KINDS = ['story', 'historical'] as const

export const DURATION_UNITS = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'] as const

export const IMAGE_OWNER_TYPES = ['character', 'group', 'location', 'object', 'codex'] as const

/** Why a stored version of a revision exists (the Cronologia). */
export const SNAPSHOT_REASONS = ['auto', 'before_bulk', 'conflict', 'restore'] as const

export const EXPORT_WHATS = ['manuscript', 'document', 'json', 'twee', 'ink', 'vo_csv', 'backup'] as const

/** Entity kinds that can be grouped, related, mentioned and placed on a mind map. */
export const WORLD_REF_TYPES = ['character', 'group', 'location', 'object'] as const

/** Every kind of item an EntityRef can point to ("codex" = a codex entry). */
export const REF_TYPES = ['character', 'group', 'location', 'object', 'strand', 'chapter', 'scene', 'event', 'note', 'codex'] as const

/** Kinds that can be mentioned with @ in the text. */
export const MENTION_TYPES = ['character', 'group', 'location', 'object', 'codex'] as const

/** Project-owned collections exposed by the generic API (/api/projects/:projectId/:collection). */
export const COLLECTIONS = [
  'characters',
  'groups',
  'locations',
  'objects',
  'images',
  'strands',
  'parts',
  'chapters',
  'scenes',
  'links',
  'variables',
  'relations',
  'maps',
  'events',
  'notes',
  'codexCategories',
  'codexEntries',
] as const

/** Everything deletable goes to the trash first (revisions too, through their own endpoints). */
export const TRASHABLE_COLLECTIONS = COLLECTIONS

export const REF_TO_COLLECTION = {
  character: 'characters',
  group: 'groups',
  location: 'locations',
  object: 'objects',
  strand: 'strands',
  chapter: 'chapters',
  scene: 'scenes',
  event: 'events',
  note: 'notes',
  codex: 'codexEntries',
} as const satisfies Record<RefType, Collection>

export const COLLECTION_TO_REF = {
  characters: 'character',
  groups: 'group',
  locations: 'location',
  objects: 'object',
  strands: 'strand',
  chapters: 'chapter',
  scenes: 'scene',
  events: 'event',
  notes: 'note',
  codexEntries: 'codex',
} as const satisfies Partial<Record<Collection, RefType>>

/**
 * Optional modules of a project. Novels start with all of them off, games with all of them on.
 * branching: choices, start scene, endings, flow view and checks. variables: state variables, conditions
 * and effects (switching it on also switches on branching). quests: strand kinds quest and side_quest.
 * codex: the lore codex. script: dialogue lines in scenes and the voice-over CSV. scene_kinds: the scene kind field.
 */
export const PROJECT_MODULES = ['branching', 'variables', 'quests', 'codex', 'script', 'scene_kinds'] as const

export const CONDITION_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_true', 'is_false'] as const
export const EFFECT_OPS = ['set', 'add', 'subtract', 'toggle'] as const
export const DIALOGUE_STYLES = ['guillemets', 'double_quotes', 'dash'] as const

/**
 * The entity palette: twelve named hues for characters, strands, groups, notes and relation kinds.
 * The actual colours are CSS variables (--entity-<key>) defined in app/assets/css/main.css for both themes.
 * A colour is never shown alone: its name (common.colors.<key>) or the entity's name is always next to it.
 */
export const ENTITY_COLORS = ['brick', 'amber', 'ochre', 'olive', 'green', 'teal', 'blue', 'indigo', 'plum', 'slate'] as const

/** Order in which new entities take the least used colour, so neighbours differ (DESIGN.md). */
export const ENTITY_COLOR_ORDER: readonly EntityColor[] = ['brick', 'teal', 'olive', 'plum', 'amber', 'blue', 'green', 'indigo', 'ochre', 'slate']

/** Default colour of each relation kind on the map (every edge also carries its kind's name). */
export const RELATION_KIND_COLORS: Record<RelationKind, EntityColor> = {
  family: 'ochre',
  romance: 'plum',
  friendship: 'green',
  alliance: 'blue',
  rivalry: 'amber',
  enmity: 'brick',
  mentorship: 'indigo',
  professional: 'teal',
  ownership: 'olive',
  place: 'teal',
  membership: 'slate',
  other: 'slate',
}

/** Dash pattern of each relation kind on the map: the family of the bond, readable without colour. */
export const RELATION_KIND_DASH: Record<RelationKind, string | undefined> = {
  family: undefined,
  romance: undefined,
  friendship: undefined,
  alliance: '6 4',
  mentorship: '6 4',
  professional: '6 4',
  rivalry: '3 3',
  enmity: '3 3',
  ownership: '1 3',
  place: '1 3',
  membership: '1 3',
  other: undefined,
}

/**
 * Long text fields per collection (and 'project'): their saves carry the version they were based on,
 * and a save based on an older version is kept as a conflict note instead of overwriting.
 */
export const LONG_TEXT_FIELDS: Record<Collection | 'project', readonly string[]> = {
  project: ['premise', 'fabula', 'setting'],
  characters: ['description', 'notes'],
  groups: ['description', 'language', 'traditions', 'powers', 'notes'],
  locations: ['description', 'notes'],
  objects: ['description', 'notes'],
  images: [],
  strands: ['description'],
  parts: ['description'],
  chapters: ['reason', 'notes'],
  scenes: ['notes'],
  links: [],
  variables: [],
  relations: [],
  maps: [],
  events: ['description'],
  notes: ['content'],
  codexCategories: [],
  codexEntries: ['body'],
}

/** The seven default codex categories (spec 6, Codex): created with a game project or when the module is switched on. */
export const CODEX_DEFAULT_CATEGORIES = ['history', 'peoples', 'religions', 'magic', 'bestiary', 'languages', 'politics'] as const

/** Characters a mention id is made of: "<refType>:<uuid>". */
export const MENTION_ID_SEPARATOR = ':'

/** Uploads are resized on the client; this is the ceiling of what the server accepts. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Longest side of stored images and of their thumbnails. */
export const IMAGE_MAX_SIDE = 2400
export const THUMB_MAX_SIDE = 320
