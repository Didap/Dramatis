import type * as schema from '../../server/db/schema'
import type { Collection, EntityColor, WorldRefType } from './domain'

/** Rows as they travel over JSON: Date becomes an ISO string. */
type Serialize<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K]
}

export type Project = Serialize<typeof schema.projects.$inferSelect>
export type Character = Serialize<typeof schema.characters.$inferSelect>
export type Group = Serialize<typeof schema.groups.$inferSelect>
export type StoryLocation = Serialize<typeof schema.locations.$inferSelect>
export type StoryObject = Serialize<typeof schema.objects.$inferSelect>
export type Strand = Serialize<typeof schema.strands.$inferSelect>
export type Part = Serialize<typeof schema.parts.$inferSelect>
export type Chapter = Serialize<typeof schema.chapters.$inferSelect>
export type Scene = Serialize<typeof schema.scenes.$inferSelect>
export type SceneLink = Serialize<typeof schema.sceneLinks.$inferSelect>
export type Variable = Serialize<typeof schema.variables.$inferSelect>
export type Relation = Serialize<typeof schema.relations.$inferSelect>
export type StoryMap = Serialize<typeof schema.maps.$inferSelect>
export type StoryEvent = Serialize<typeof schema.events.$inferSelect>
export type Note = Serialize<typeof schema.notes.$inferSelect>
export type EntityImageRow = Serialize<typeof schema.images.$inferSelect>
export type CodexCategory = Serialize<typeof schema.codexCategories.$inferSelect>
export type CodexEntry = Serialize<typeof schema.codexEntries.$inferSelect>
export type SceneSnapshot = Serialize<typeof schema.sceneSnapshots.$inferSelect>
export type SceneRevision = Serialize<typeof schema.sceneRevisions.$inferSelect>
export type User = Omit<Serialize<typeof schema.users.$inferSelect>, 'passwordHash'>

/** Revision metadata, without the (possibly large) content. */
export type SceneRevisionInfo = Omit<SceneRevision, 'content' | 'contentText'>

/** The row type of every generic collection. */
export interface CollectionMap {
  characters: Character
  groups: Group
  locations: StoryLocation
  objects: StoryObject
  images: EntityImageRow
  strands: Strand
  parts: Part
  chapters: Chapter
  scenes: Scene
  links: SceneLink
  variables: Variable
  relations: Relation
  maps: StoryMap
  events: StoryEvent
  notes: Note
  codexCategories: CodexCategory
  codexEntries: CodexEntry
}

export type CollectionItem<C extends Collection> = CollectionMap[C]

/** Fields set by the server, never sent by the client. */
type ServerFields = 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'versions'

/** What the client may send when creating an item (the server fills defaults). */
export type CreateInput<C extends Collection> = Partial<Omit<CollectionMap[C], ServerFields>>

/** What the client may send when updating an item. */
export type UpdateInput<C extends Collection> = Partial<Omit<CollectionMap[C], ServerFields>>

/** Manual tags of a scene, as sent to the server (the full list; mentions and lines are computed). */
export interface ManualTag {
  type: 'character' | 'location' | 'object'
  id: string
}

/** Everything the workspace needs, loaded once when a project opens. Scene text is loaded on demand. */
export interface ProjectBundle {
  project: Project
  characters: Character[]
  groups: Group[]
  locations: StoryLocation[]
  objects: StoryObject[]
  images: EntityImageRow[]
  strands: Strand[]
  parts: Part[]
  chapters: Chapter[]
  scenes: Scene[]
  links: SceneLink[]
  variables: Variable[]
  relations: Relation[]
  maps: StoryMap[]
  events: StoryEvent[]
  notes: Note[]
  codexCategories: CodexCategory[]
  codexEntries: CodexEntry[]
  /** Items in the trash (for the sidebar badge). */
  trashCount: number
}

/** A project in the projects list, with a few numbers. */
export interface ProjectSummary {
  id: string
  kind: Project['kind']
  title: string
  subtitle: string
  genre: string
  color: string
  wordGoal: number | null
  deadline: string | null
  openedAt: string | null
  /** In the trash when set. */
  deletedAt: string | null
  settings: Project['settings']
  createdAt: string
  updatedAt: string
  words: number
  scenes: number
  chapters: number
  characters: number
}

/** Any world entity, for pickers, mentions and the mind map. */
export interface WorldEntity {
  type: WorldRefType
  id: string
  name: string
  color: EntityColor | ''
  /** Media id of the primary image (first by position). */
  imageId: string | null
}

export interface SceneContent {
  sceneId: string
  revisionId: string
  content: import('./domain').RichDoc | null
  wordCount: number
  charCount: number
  charCountNoSpaces: number
  /** The revision version this content is: send it back as `version` when saving. */
  version: number
  updatedAt: string
}

export interface WritingDay {
  /** YYYY-MM-DD in the account time zone. */
  day: string
  /** Words written (sum of positive deltas). */
  added: number
  /** Words removed (sum of negative deltas, positive number). */
  removed: number
  /** Total words of the project at the last save of the day. */
  total: number
}

export interface WritingStats {
  /** Today in the account time zone. */
  today: string
  /** Days with any activity in the requested span (default 365), oldest first. */
  days: WritingDay[]
  todayAdded: number
  todayRemoved: number
  /** Consecutive days up to today (or yesterday) with words written. */
  streak: number
  totalWords: number
  /** Average words written per writing day over the last 30 days. */
  average30: number
}

export interface SearchHit {
  type: import('./domain').RefType
  id: string
  title: string
  /** Short context with the match, plain text. */
  snippet: string
  /** For scenes: the chapter it belongs to. */
  chapterId?: string
}
