import type { DurationUnit, EventKind } from '#shared/types/domain'
import type { Scene, StoryEvent } from '#shared/types/entities'
import { parseStoryTime, storyTimeKey } from '#shared/utils/time'
import type { StoryTimeParts } from '#shared/utils/time'
import { precisionOf, spansOverlap, storySpan } from './story-calendar'
import type { StoryPrecision } from './story-calendar'

/*
 * The timeline (spec 4.5): dated scenes and events in story order, grouped by year, month and day as
 * density requires; the undated ones wait in a tray. Pure functions: the page feeds them the store.
 */

export type TimelineKind = 'scene' | EventKind

/** What the inline editor changes on a scene. */
export type SceneDatePatch = Partial<Pick<Scene, 'storyAt' | 'storyTimeLabel' | 'durationValue' | 'durationUnit'>>

export const TIMELINE_KINDS: readonly TimelineKind[] = ['scene', 'story', 'historical']

export interface TimelineEntry {
  /** "scene:<id>" or "event:<id>". */
  key: string
  type: 'scene' | 'event'
  id: string
  kind: TimelineKind
  title: string
  at: string | null
  parts: StoryTimeParts | null
  precision: StoryPrecision | null
  sortKey: number | null
  /** The date as written in the story. */
  label: string
  durationValue: number | null
  durationUnit: DurationUnit | null
  povCharacterId: string | null
  /** The POV character first. */
  characterIds: string[]
  locationIds: string[]
  objectIds: string[]
  groupIds: string[]
  strandIds: string[]
  /** Position in reading order for scenes, -1 for events. */
  reading: number
  scene?: Scene
  event?: StoryEvent
}

function dated(at: string | null) {
  const parts = parseStoryTime(at)
  return { at: parts ? at : null, parts, precision: parts ? precisionOf(parts) : null, sortKey: parts ? storyTimeKey(at) : null }
}

export function sceneEntry(scene: Scene, reading: number): TimelineEntry {
  const pov = scene.povCharacterId
  return {
    key: `scene:${scene.id}`,
    type: 'scene',
    id: scene.id,
    kind: 'scene',
    title: scene.title,
    ...dated(scene.storyAt),
    label: scene.storyTimeLabel,
    durationValue: scene.durationValue,
    durationUnit: scene.durationUnit,
    povCharacterId: pov,
    characterIds: pov ? [pov, ...scene.characterIds.filter(id => id !== pov)] : [...scene.characterIds],
    locationIds: scene.locationIds,
    objectIds: scene.objectIds,
    groupIds: [],
    strandIds: scene.strandIds,
    reading,
    scene,
  }
}

export function eventEntry(event: StoryEvent): TimelineEntry {
  const ids = (type: string) => event.refs.filter(r => r.type === type).map(r => r.id)
  return {
    key: `event:${event.id}`,
    type: 'event',
    id: event.id,
    kind: event.kind,
    title: event.title,
    ...dated(event.at),
    label: event.timeLabel,
    durationValue: event.durationValue,
    durationUnit: event.durationUnit,
    povCharacterId: null,
    characterIds: ids('character'),
    locationIds: ids('location'),
    objectIds: ids('object'),
    groupIds: ids('group'),
    strandIds: [],
    reading: -1,
    event,
  }
}

export interface TimelineFilters {
  characters: string[]
  locations: string[]
  objects: string[]
  strands: string[]
  kinds: TimelineKind[]
}

export const emptyFilters = (): TimelineFilters => ({ characters: [], locations: [], objects: [], strands: [], kinds: [] })

export function activeFilters(filters: TimelineFilters): number {
  return filters.characters.length + filters.locations.length + filters.objects.length + filters.strands.length + filters.kinds.length
}

/** Every chosen dimension must match; within one, any of the chosen items. Events have no strands. */
export function matchesFilters(entry: TimelineEntry, filters: TimelineFilters): boolean {
  const any = (chosen: string[], ids: string[]) => !chosen.length || chosen.some(id => ids.includes(id))
  return (!filters.kinds.length || filters.kinds.includes(entry.kind))
    && any(filters.characters, entry.characterIds)
    && any(filters.locations, entry.locationIds)
    && any(filters.objects, entry.objectIds)
    && any(filters.strands, entry.strandIds)
}

/** Story order; at the same moment events come first, then scenes in reading order. */
export function compareEntries(a: TimelineEntry, b: TimelineEntry): number {
  return (a.sortKey ?? 0) - (b.sortKey ?? 0)
    || (a.type === b.type ? 0 : a.type === 'event' ? -1 : 1)
    || a.reading - b.reading
    || a.title.localeCompare(b.title)
}

export interface TimelineSection {
  id: string
  level: 'year' | 'month' | 'day'
  year: number
  month?: number
  day?: number
  /** Items written directly under this heading (the vaguer ones come before the sub-headings). */
  entries: TimelineEntry[]
  sections: TimelineSection[]
  count: number
}

/** Beyond this many items a period gets sub-headings, when they would hold more than one item on average. */
const DENSE = 6

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function worthSplitting(total: number, groups: number) {
  return total > DENSE && groups >= 2 && groups <= total / 1.5
}

function daySection(year: number, month: number, day: number, entries: TimelineEntry[]): TimelineSection {
  return { id: `y${year}-m${month}-d${day}`, level: 'day', year, month, day, entries, sections: [], count: entries.length }
}

function byDay(year: number, month: number, list: TimelineEntry[]) {
  const daily = list.filter(e => e.parts!.day !== undefined)
  const days = distinct(daily.map(e => e.parts!.day!))
  if (!worthSplitting(list.length, days.length)) return null
  return {
    entries: list.filter(e => e.parts!.day === undefined),
    sections: days.map(day => daySection(year, month, day, daily.filter(e => e.parts!.day === day))),
  }
}

function monthSection(year: number, month: number, list: TimelineEntry[]): TimelineSection {
  const split = byDay(year, month, list)
  return { id: `y${year}-m${month}`, level: 'month', year, month, entries: split?.entries ?? list, sections: split?.sections ?? [], count: list.length }
}

function yearSection(year: number, list: TimelineEntry[]): TimelineSection {
  const section: TimelineSection = { id: `y${year}`, level: 'year', year, entries: list, sections: [], count: list.length }
  const monthly = list.filter(e => e.parts!.month !== undefined)
  const months = distinct(monthly.map(e => e.parts!.month!))
  if (worthSplitting(list.length, months.length)) {
    section.entries = list.filter(e => e.parts!.month === undefined)
    section.sections = months.map(month => monthSection(year, month, monthly.filter(e => e.parts!.month === month)))
  }
  else if (months.length === 1) {
    // A single month: the days may still need headings of their own.
    const split = byDay(year, months[0]!, monthly)
    if (split) {
      section.entries = [...list.filter(e => e.parts!.month === undefined), ...split.entries]
      section.sections = split.sections
    }
  }
  return section
}

/** Groups dated entries (already in story order) by year, then month and day where they are dense. */
export function groupEntries(sorted: TimelineEntry[]): TimelineSection[] {
  const years = distinct(sorted.map(e => e.parts!.year))
  return years.map(year => yearSection(year, sorted.filter(e => e.parts!.year === year)))
}

export interface Overlap {
  /** The other scene or event ("scene:<id>", "event:<id>"). */
  key: string
  /** The characters who would be in both places. */
  characterIds: string[]
}

/**
 * A character in two different places at overlapping times (spec 6, timeline P1), across scenes and
 * events. Only times that can be compared count (see storySpan), and only when both name their places.
 * `exclusive` tells two scenes that cannot both happen (alternative branches of a game).
 */
export function findOverlaps(entries: TimelineEntry[], exclusive: (a: string, b: string) => boolean = () => false): Map<string, Overlap[]> {
  const spans = entries
    .map(entry => ({ entry, span: storySpan(entry.at, entry.durationValue, entry.durationUnit) }))
    .filter((s): s is { entry: TimelineEntry, span: { start: number, end: number } } => !!s.span && s.entry.locationIds.length > 0)
    .sort((a, b) => a.span.start - b.span.start)
  const result = new Map<string, Overlap[]>()
  const add = (id: string, overlap: Overlap) => result.set(id, [...(result.get(id) ?? []), overlap])

  for (let i = 0; i < spans.length; i++) {
    const a = spans[i]!
    for (let j = i + 1; j < spans.length; j++) {
      const b = spans[j]!
      if (b.span.start > a.span.end) break
      if (!spansOverlap(a.span, b.span)) continue
      if (a.entry.locationIds.some(id => b.entry.locationIds.includes(id))) continue
      const shared = a.entry.characterIds.filter(id => b.entry.characterIds.includes(id))
      if (!shared.length) continue
      if (a.entry.type === 'scene' && b.entry.type === 'scene' && exclusive(a.entry.id, b.entry.id)) continue
      add(a.entry.key, { key: b.entry.key, characterIds: shared })
      add(b.entry.key, { key: a.entry.key, characterIds: shared })
    }
  }
  return result
}

const PRECISIONS: readonly StoryPrecision[] = ['year', 'month', 'day', 'minute']

/** Compares two story times at the coarser of their precisions: "1956" is neither before nor after "1956-06". */
export function compareCoarse(a: StoryTimeParts, b: StoryTimeParts): number {
  const level = Math.min(PRECISIONS.indexOf(precisionOf(a)), PRECISIONS.indexOf(precisionOf(b)))
  const minutes = (p: StoryTimeParts) => (p.hour ?? 0) * 60 + (p.minute ?? 0)
  return a.year - b.year
    || (level >= 1 ? (a.month ?? 0) - (b.month ?? 0) : 0)
    || (level >= 2 ? (a.day ?? 0) - (b.day ?? 0) : 0)
    || (level >= 3 ? minutes(a) - minutes(b) : 0)
}

/** The flow a reader or a player follows: choices and continuations, from the start scene when there is one. */
export interface TellingFlow {
  edges: readonly { from: string, to: string }[]
  startId?: string | null
}

/**
 * Edges that close a loop (back to a hub, to a scene already played), found by a depth-first walk from
 * the start scene and then from every scene in reading order.
 */
function loopEdges(order: string[], next: Map<string, string[]>, startId?: string | null): Set<string> {
  const loops = new Set<string>()
  const state = new Map<string, 'open' | 'done'>()
  for (const root of startId ? [startId, ...order] : order) {
    if (state.has(root)) continue
    state.set(root, 'open')
    const stack = [{ id: root, at: 0 }]
    while (stack.length) {
      const top = stack.at(-1)!
      const targets = next.get(top.id) ?? []
      if (top.at < targets.length) {
        const to = targets[top.at++]!
        const seen = state.get(to)
        if (seen === 'open') loops.add(`${top.id}>${to}`)
        else if (!seen) {
          state.set(to, 'open')
          stack.push({ id: to, at: 0 })
        }
      }
      else {
        state.set(top.id, 'done')
        stack.pop()
      }
    }
  }
  return loops
}

/**
 * Scenes that go back in time (spec 4.5, "Ordine del racconto"): told right after a scene that happens
 * later in the story. The scene told before is the previous one in reading order or, in a branching
 * story, any scene that leads to it in the flow (alternative branches written one after the other
 * never follow each other, and a loop back to a hub is not going back). Undated scenes are passed
 * through; two dates compare at the coarser of their precisions.
 */
export function findFlashbacks(scenesInReadingOrder: TimelineEntry[], flow?: TellingFlow): Set<string> {
  const order = scenesInReadingOrder.map(entry => entry.id)
  const edges = flow?.edges ?? order.slice(1).map((id, i) => ({ from: order[i]!, to: id }))
  const next = new Map<string, string[]>()
  for (const { from, to } of edges) next.set(from, [...(next.get(from) ?? []), to])
  const loops = loopEdges(order, next, flow?.startId)
  const before = new Map<string, string[]>()
  for (const { from, to } of edges) {
    if (!loops.has(`${from}>${to}`)) before.set(to, [...(before.get(to) ?? []), from])
  }

  const parts = new Map(scenesInReadingOrder.map(entry => [entry.id, entry.parts]))
  const flashbacks = new Set<string>()
  for (const entry of scenesInReadingOrder) {
    const when = entry.parts
    if (!when) continue
    // The nearest dated scenes told before this one, looking through the undated ones.
    const seen = new Set([entry.id])
    const queue = [...(before.get(entry.id) ?? [])]
    while (queue.length) {
      const id = queue.shift()!
      if (seen.has(id)) continue
      seen.add(id)
      const at = parts.get(id)
      if (!at) queue.push(...(before.get(id) ?? []))
      else if (compareCoarse(when, at) < 0) {
        flashbacks.add(entry.id)
        break
      }
    }
  }
  return flashbacks
}

/**
 * In a branching story two scenes can both happen only when one leads to the other. Builds the test
 * from the flow edges (choices and the implicit continuation); reachability is computed on demand.
 */
export function exclusiveScenes(edges: { from: string, to: string }[]): (a: string, b: string) => boolean {
  const next = new Map<string, string[]>()
  for (const edge of edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to])
  const reach = new Map<string, Set<string>>()
  const reachable = (from: string) => {
    let seen = reach.get(from)
    if (seen) return seen
    seen = new Set<string>()
    const queue = [from]
    while (queue.length) {
      for (const to of next.get(queue.shift()!) ?? []) {
        if (!seen.has(to)) {
          seen.add(to)
          queue.push(to)
        }
      }
    }
    reach.set(from, seen)
    return seen
  }
  return (a, b) => !reachable(a).has(b) && !reachable(b).has(a)
}

// Nuxt registers every file of components/ as a component: a default export keeps its generated types valid.
export default { groupEntries, matchesFilters, findOverlaps, findFlashbacks }
