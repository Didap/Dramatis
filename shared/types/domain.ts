import type {
  DURATION_UNITS,
  EXPORT_WHATS,
  IMAGE_OWNER_TYPES,
  SNAPSHOT_REASONS,
  CHARACTER_IMPORTANCES,
  CHARACTER_ROLES,
  COLLECTIONS,
  ENTITY_COLORS,
  EVENT_KINDS,
  FLOW_ROLES,
  GROUP_KINDS,
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
} from '../utils/constants'

export type ProjectKind = (typeof PROJECT_KINDS)[number]
export type SceneStatus = (typeof SCENE_STATUSES)[number]
export type PlanningStatus = (typeof PLANNING_STATUSES)[number]
export type CharacterImportance = (typeof CHARACTER_IMPORTANCES)[number]
export type CharacterRole = (typeof CHARACTER_ROLES)[number]
export type PointOfView = (typeof POINTS_OF_VIEW)[number]
export type StrandKind = (typeof STRAND_KINDS)[number]
export type RelationKind = (typeof RELATION_KINDS)[number]
export type GroupKind = (typeof GROUP_KINDS)[number]
export type SceneKind = (typeof SCENE_KINDS)[number]
export type FlowRole = (typeof FLOW_ROLES)[number]
export type VariableType = (typeof VARIABLE_TYPES)[number]
export type EventKind = (typeof EVENT_KINDS)[number]
export type WorldRefType = (typeof WORLD_REF_TYPES)[number]
export type RefType = (typeof REF_TYPES)[number]
export type Collection = (typeof COLLECTIONS)[number]
export type ProjectModule = (typeof PROJECT_MODULES)[number]
export type EntityColor = (typeof ENTITY_COLORS)[number]
export type DurationUnit = (typeof DURATION_UNITS)[number]
export type ImageOwnerType = (typeof IMAGE_OWNER_TYPES)[number]
export type SnapshotReason = (typeof SNAPSHOT_REASONS)[number]
export type ExportWhat = (typeof EXPORT_WHATS)[number]

/** A counter per long text field (premise, description...), for the conflict rule. */
export type FieldVersions = Record<string, number>

/** One tag of a scene: manual, and/or found in the text (mentions, dialogue lines spoken). */
export interface SceneTagInfo {
  manual?: boolean
  mentions?: number
  lines?: number
}

/** Tags of a scene keyed by "<type>:<id>" with type character, location or object. */
export type SceneTags = Record<string, SceneTagInfo>

/**
 * TipTap / ProseMirror JSON. Compatible with TipTap's JSONContent.
 * Node types in use: doc, paragraph, heading, blockquote, bulletList, orderedList, listItem,
 * horizontalRule, hardBreak, text, image, mention (attrs: id "<refType>:<uuid>", label = the text shown,
 * followsName = true when the label is the entity's name and follows renames),
 * dialogueLine (attrs: speakerId, speakerName = the speaker label, direction, lineId; inline content = the line),
 * sceneBreak (a centred separator between sections of a scene).
 * Paragraphs and headings may carry attrs.textAlign.
 * Marks in use: bold, italic, underline, strike, code, link.
 */
export interface RichNode {
  type?: string
  attrs?: Record<string, any>
  content?: RichNode[]
  marks?: { type: string, attrs?: Record<string, any> }[]
  text?: string
}
export type RichDoc = RichNode

/** A pointer to any item of a project. */
export interface EntityRef {
  type: RefType
  id: string
}

/** Qualities, flaws and contradictions of a character: short items. */
export interface CharacterTraits {
  qualities?: string[]
  flaws?: string[]
  contradictions?: string[]
}

export type ConditionOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_true' | 'is_false'

/** One clause of a choice condition: a state variable, an operator and (except is_true/is_false) a value. */
export interface ConditionClause {
  variableId: string
  op: ConditionOp
  value?: string
}

export interface LinkCondition {
  /** all = every clause must hold (AND), any = at least one (OR). */
  mode: 'all' | 'any'
  clauses: ConditionClause[]
}

export type EffectOp = 'set' | 'add' | 'subtract' | 'toggle'

/** What choosing a link does to one state variable. */
export interface LinkEffect {
  variableId: string
  op: EffectOp
  value?: string
}

export interface CharacterProfileSection {
  /** How the author prefers to fill this section. */
  mode?: 'interview' | 'free'
  /** Interview answers keyed by question key (see shared/content/profile.ts). */
  answers?: Record<string, string>
  /** Free text for the section. */
  free?: RichDoc | null
}

/** Keyed by profile section key (personal, physical, behavior, ...). */
export type CharacterProfile = Partial<Record<string, CharacterProfileSection>>

export interface QuestObjective {
  id: string
  text: string
  optional?: boolean
  /** The scene where the objective is completed; it counts as done when that scene is at least a draft. */
  sceneId?: string | null
}

export interface QuestReward {
  id: string
  text: string
  /** The object (item) given as reward, if any. */
  objectId?: string | null
}

export interface QuestDetails {
  giverId?: string | null
  locationId?: string | null
  objectives?: QuestObjective[]
  rewards?: QuestReward[]
  prerequisites?: string
}

/** How strong a relationship is, as one side feels it: 1 weak, 2 normal, 3 strong. */
export type RelationIntensity = 1 | 2 | 3

/** Whose point of view: the relationship's source or its target. */
export type RelationSide = 'source' | 'target'

/** A change in a relationship from one side's point of view: from this chapter on, this intensity. */
export interface RelationStep {
  id: string
  side: RelationSide
  /** null when the chapter is not chosen (or was deleted for good). */
  chapterId: string | null
  intensity: RelationIntensity
  /** How it changes, in a few words. */
  note: string
}

/** Mind map node positions keyed by "<refType>:<uuid>". */
export type MapNodes = Record<string, { x: number, y: number }>

export interface MapSettings {
  /** Entity kinds shown on the map. */
  include?: Partial<Record<WorldRefType, boolean>>
  /** Relation kinds shown; empty or missing = all. */
  kinds?: RelationKind[]
  /** Only these refs, when the map is a curated selection; missing = every entity of the included kinds. */
  refs?: string[]
  viewport?: { x: number, y: number, zoom: number }
}

export type ProjectModules = Partial<Record<ProjectModule, boolean>>

export type DialogueStyle = 'guillemets' | 'double_quotes' | 'dash'

export interface ProjectSettings {
  /** How chapter titles are numbered in the manuscript and in exports. */
  chapterNumbering?: 'arabic' | 'roman' | 'words' | 'none'
  /** Separator printed between scenes of the same chapter in exports. */
  sceneSeparator?: string
  /** Punctuation inserted by the dialogue buttons of the editor (default from the work's language). */
  dialogueStyle?: DialogueStyle
  /** Smart quotes in the project's style, -- to an em dash, ... to an ellipsis. Default true. */
  smartTypography?: boolean
  /** Show the path and the guidance (explanations, hints, teaching paragraphs). Default true. */
  guidance?: boolean
  /** Use parts (acts) in the manuscript. Default: games yes, novels no. */
  parts?: boolean
  /** Extra interview questions added by the author, per profile section. */
  customQuestions?: Record<string, { key: string, label: string }[]>
  /** The project is a copy of a demo (shows the demo banner on the overview). */
  demo?: boolean
  /** Key of the structure template the project was created from (shared/content/structures.ts). */
  template?: string
  /** Words the spell check accepts in this project ("Aggiungi al dizionario"), as written the first time. */
  dictionary?: string[]
}

export interface EditorPreferences {
  font?: 'serif' | 'sans'
  /** Font size in px for the manuscript, 14 to 24 (default 18). */
  size?: number
  /** 1.4 to 2.0 (default 1.6). */
  lineHeight?: number
  /** narrow 60ch, medium 70ch (default), wide 80ch. */
  width?: 'narrow' | 'medium' | 'wide'
  typewriter?: boolean
  focusParagraph?: boolean
  /** The chapter's reading view: font size in px, 13 to 22 (default 16 on a desktop, 17 on a phone). */
  readingSize?: number
  /** Width of the reading page: book 40rem (default), wide 50rem, full the whole page. */
  readingWidth?: 'book' | 'wide' | 'full'
  /** Justified lines with hyphenation, as in a printed book. Default true. */
  readingJustify?: boolean
  /** Spell check in the editor, in the work's language when there is a dictionary for it. Default true. */
  spellcheck?: boolean
}

export interface UserPreferences {
  editor?: EditorPreferences
  /** Guidance on in new blank and template projects. Default true. */
  guidance?: boolean
  theme?: 'light' | 'dark' | 'system'
  /** The project opened last: sign-in goes back to it. */
  lastProjectId?: string
  /** When the password last changed (ISO): sessions signed in before it are refused. */
  passwordChangedAt?: string
}
