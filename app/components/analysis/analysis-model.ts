import type { Chapter, Part, Scene } from '#shared/types/entities'

/*
 * The analysis (spec 4.6): how characters, places, objects, strands, points of view and statuses are
 * spread across the chapters. Pure functions over the store's rows, in reading order.
 */

export interface ChapterColumn {
  id: string
  /** 1-based, in reading order. */
  number: number
  title: string
  partId: string | null
}

/** Columns grouped under their part (act), when the project uses parts. */
export interface ColumnGroup {
  id: string
  title: string
  span: number
}

export interface MatrixRow {
  id: string
  label: string
  /** An entity colour: characters and strands tint their cells. */
  color?: string | null
  icon?: string
  /** Colour of the icon (statuses). */
  iconColor?: string
  /** Heading of the block the row belongs to (characters by importance). */
  section?: string
  /** The sheet the name leads to. */
  to?: string
  /** Scenes of each chapter where the row applies, by chapter id. */
  cells: Map<string, Scene[]>
  /** Distinct scenes in the whole work. */
  total: number
}

export function chapterColumns(chapters: Chapter[]): ChapterColumn[] {
  return chapters.map((chapter, i) => ({ id: chapter.id, number: i + 1, title: chapter.title, partId: chapter.partId }))
}

/** The parts above the chapter columns; null when no chapter belongs to a part. */
export function columnGroups(columns: ChapterColumn[], parts: Part[], untitled: string): ColumnGroup[] | null {
  if (!columns.some(c => c.partId)) return null
  const groups: ColumnGroup[] = []
  for (const column of columns) {
    const last = groups.at(-1)
    const id = column.partId ?? ''
    if (last && last.id === id) last.span++
    else groups.push({ id, title: id ? (parts.find(p => p.id === id)?.title || untitled) : '', span: 1 })
  }
  return groups
}

/**
 * Spreads scenes over rows and columns: `keysOf` says which rows a scene counts for (the characters
 * in it, its point of view, its status...), `columnOf` which column (its chapter, or its act).
 */
export function distribute(
  scenes: Scene[],
  keysOf: (scene: Scene) => readonly string[],
  columnOf: (scene: Scene) => string = scene => scene.chapterId,
): Map<string, Map<string, Scene[]>> {
  const result = new Map<string, Map<string, Scene[]>>()
  for (const scene of scenes) {
    const column = columnOf(scene)
    for (const key of new Set(keysOf(scene))) {
      let row = result.get(key)
      if (!row) result.set(key, (row = new Map()))
      const cell = row.get(column)
      if (cell) cell.push(scene)
      else row.set(column, [scene])
    }
  }
  return result
}

export function rowTotal(cells: Map<string, Scene[]> | undefined): number {
  if (!cells) return 0
  return [...cells.values()].reduce((n, list) => n + list.length, 0)
}

/** The scenes a character appears in: tagged (by hand, mentioned, speaking) or as point of view. */
export function sceneCharacters(scene: Scene): string[] {
  return scene.povCharacterId ? [...scene.characterIds, scene.povCharacterId] : scene.characterIds
}

export interface ChapterLength {
  chapter: ChapterColumn
  words: number
  scenes: Scene[]
}

export interface LengthSummary {
  chapters: ChapterLength[]
  totalWords: number
  sceneCount: number
  averagePerChapter: number
  averagePerScene: number
  longestChapter: ChapterLength | null
  shortestChapter: ChapterLength | null
  longestScene: Scene | null
  shortestScene: Scene | null
  maxChapterWords: number
}

export function lengths(columns: ChapterColumn[], scenesOf: (chapterId: string) => Scene[]): LengthSummary {
  const chapters = columns.map(chapter => {
    const scenes = scenesOf(chapter.id)
    return { chapter, scenes, words: scenes.reduce((n, s) => n + s.wordCount, 0) }
  })
  const scenes = chapters.flatMap(c => c.scenes)
  const totalWords = chapters.reduce((n, c) => n + c.words, 0)
  const pick = <T>(list: T[], better: (a: T, b: T) => boolean) => list.reduce<T | null>((best, item) => (best === null || better(item, best) ? item : best), null)
  return {
    chapters,
    totalWords,
    sceneCount: scenes.length,
    averagePerChapter: chapters.length ? Math.round(totalWords / chapters.length) : 0,
    averagePerScene: scenes.length ? Math.round(totalWords / scenes.length) : 0,
    longestChapter: pick(chapters, (a, b) => a.words > b.words),
    shortestChapter: pick(chapters, (a, b) => a.words < b.words),
    longestScene: pick(scenes, (a, b) => a.wordCount > b.wordCount),
    shortestScene: pick(scenes, (a, b) => a.wordCount < b.wordCount),
    maxChapterWords: Math.max(0, ...chapters.map(c => c.words)),
  }
}

// Nuxt registers every file of components/ as a component: a default export keeps its generated types valid.
export default { distribute, lengths, chapterColumns }
