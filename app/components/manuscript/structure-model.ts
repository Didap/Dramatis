/*
 * The rules of the manuscript structure that need no store: where one step up or down takes a part,
 * a chapter or a scene, and how numbers are written in position lines. Structure.vue applies them to
 * the open project; tests/unit/manuscript-structure.test.ts checks them.
 */

export type StructureKind = 'part' | 'chapter' | 'scene'

/** The manuscript as the outline shows it. */
export interface StructureShape {
  usesParts: boolean
  /** Live parts, in order. */
  parts: readonly string[]
  /** Chapters in reading order, each with its live part (null: outside any part, or parts off). */
  chapters: readonly { id: string, partId: string | null }[]
  /** The scenes of a chapter, in order. */
  scenesOf: (chapterId: string) => readonly string[]
  /** The chapter a scene is in. */
  chapterOf: (sceneId: string) => string | undefined
}

/** Where a step takes an item: its container and its index there (no index: at the end). */
export type StepTarget =
  | { kind: 'scene', chapterId: string, index?: number }
  | { kind: 'chapter', partId: string | null, index?: number }
  | { kind: 'part', index: number }

export interface StepOptions {
  /** A scene at the edge of its chapter crosses into the chapter before or after (default true). */
  crossChapters?: boolean
}

/**
 * One step up (-1) or down (+1), or null at the very start or end. A scene at the edge of its chapter
 * crosses into the neighbouring chapter (at its end going up, at its start going down); a chapter at
 * the edge of its part crosses into the neighbouring part, and the chapters outside any part sit above
 * the first one. Parts off, chapters move among all of them.
 */
export function planStep(shape: StructureShape, kind: StructureKind, id: string, delta: -1 | 1, options: StepOptions = {}): StepTarget | null {
  if (kind === 'scene') {
    const chapterId = shape.chapterOf(id)
    if (!chapterId) return null
    const siblings = shape.scenesOf(chapterId)
    const target = siblings.indexOf(id) + delta
    if (target >= 0 && target < siblings.length) return { kind, chapterId, index: target }
    if (options.crossChapters === false) return null
    const neighbour = shape.chapters[shape.chapters.findIndex(c => c.id === chapterId) + delta]
    return neighbour ? { kind, chapterId: neighbour.id, index: delta < 0 ? undefined : 0 } : null
  }
  if (kind === 'chapter') {
    const chapter = shape.chapters.find(c => c.id === id)
    if (!chapter) return null
    const part = shape.usesParts ? chapter.partId : null
    const siblings = shape.usesParts ? shape.chapters.filter(c => c.partId === part) : shape.chapters
    const target = siblings.findIndex(c => c.id === id) + delta
    if (target >= 0 && target < siblings.length) return { kind, partId: part, index: target }
    if (!shape.usesParts) return null
    const neighbour = part ? shape.parts[shape.parts.indexOf(part) + delta] : (delta > 0 ? shape.parts[0] : undefined)
    return neighbour ? { kind, partId: neighbour, index: delta < 0 ? undefined : 0 } : null
  }
  const target = shape.parts.indexOf(id) + delta
  return target >= 0 && target < shape.parts.length ? { kind, index: target } : null
}

/** The new order of a list once `id` sits at `index` (no index: at the end). */
export function placeAt(ids: readonly string[], id: string, index?: number): string[] {
  const rest = ids.filter(x => x !== id)
  rest.splice(index ?? rest.length, 0, id)
  return rest
}

// ---------------------------------------------------------------- numbers

const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]

/** Roman numerals, as acts are numbered ("Atto II"). */
export function roman(n: number): string {
  let rest = Math.max(1, Math.floor(n))
  let out = ''
  for (const [value, digits] of ROMAN) {
    while (rest >= value) {
      out += digits
      rest -= value
    }
  }
  return out
}

const IT_UNITS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove']
const IT_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta']
const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** A number in words, as the manuscript export writes chapter numbers ("ventitré", "twenty-three"). */
export function numberWords(n: number, locale: string): string {
  if (n < 0 || n >= 1000 || !Number.isInteger(n)) return String(n)
  if (locale.startsWith('en')) {
    if (n < 20) return EN_UNITS[n]!
    if (n < 100) return n % 10 ? `${EN_TENS[Math.floor(n / 10)]}-${EN_UNITS[n % 10]}` : EN_TENS[n / 10]!
    return n % 100 ? `${EN_UNITS[Math.floor(n / 100)]} hundred and ${numberWords(n % 100, locale)}` : `${EN_UNITS[n / 100]} hundred`
  }
  if (n < 20) return IT_UNITS[n]!
  if (n < 100) {
    const unit = n % 10
    // Ventuno, ventotto: the tens lose their vowel before uno and otto; ventitré takes the accent.
    const tens = unit === 1 || unit === 8 ? IT_TENS[Math.floor(n / 10)]!.slice(0, -1) : IT_TENS[Math.floor(n / 10)]!
    return unit === 0 ? tens : `${tens}${unit === 3 ? 'tré' : IT_UNITS[unit]}`
  }
  const head = Math.floor(n / 100) === 1 ? 'cento' : `${IT_UNITS[Math.floor(n / 100)]}cento`
  if (!(n % 100)) return head
  const tail = numberWords(n % 100, locale)
  return tail.startsWith('ott') ? `${head.slice(0, -1)}${tail}` : `${head}${tail}`
}

export type ChapterNumbering = 'arabic' | 'roman' | 'words' | 'none'

/** A chapter number as the project's numbering writes it ("3", "III", "tre"); '' for none. */
export function chapterNumberText(n: number, numbering: ChapterNumbering | undefined, locale: string): string {
  if (numbering === 'none') return ''
  if (numbering === 'roman') return roman(n)
  if (numbering === 'words') return numberWords(n, locale)
  return String(n)
}

// Nuxt registers every file of a components folder; this one is a module, not a component.
export default { planStep, placeAt, roman, numberWords, chapterNumberText }
