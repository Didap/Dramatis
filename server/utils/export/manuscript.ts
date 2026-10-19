import { z } from 'zod'
import type { RichDoc } from '#shared/types/domain'
import { exportNumber, type ExportLang, type ExportTranslator } from './i18n'
import type { ExportModel } from './model'

/*
 * The manuscript (or script) as the exports print it (appendix D.1 to D.3): which scenes, in which
 * parts and chapters, with which headings and separators. DOCX, EPUB, TXT and the print page all start here.
 */

/** Query strings carry booleans as text; JSON bodies as booleans. */
const zFlag = z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).transform(v => v === true || v === 'true' || v === '1')

export const manuscriptOptionsSchema = z.object({
  titlePage: zFlag.optional(),
  partTitles: zFlag.optional(),
  chapterTitles: zFlag.optional(),
  sceneTitles: zFlag.optional(),
  sceneCodes: zFlag.optional(),
  numbering: z.enum(['arabic', 'roman', 'words', 'none']).optional(),
  /** custom: the separator written in the project's settings. */
  separator: z.enum(['stars', 'hash', 'blank', 'custom']).optional(),
  /** text: every scene with text; revised: only revised and final; final: only final. */
  scenes: z.enum(['text', 'revised', 'final']).optional(),
  layout: z.enum(['manuscript', 'book']).optional(),
})

export type ManuscriptOptionsInput = z.output<typeof manuscriptOptionsSchema>

export interface ManuscriptOptions {
  titlePage: boolean
  partTitles: boolean
  chapterTitles: boolean
  sceneTitles: boolean
  sceneCodes: boolean
  numbering: 'arabic' | 'roman' | 'words' | 'none'
  separator: 'stars' | 'hash' | 'blank' | 'custom'
  scenes: 'text' | 'revised' | 'final'
  layout: 'manuscript' | 'book'
}

export interface MsScene {
  id: string
  code: string
  /** Null when scene titles are off (or the scene has neither title nor code to show). */
  heading: string | null
  content: RichDoc | null
  words: number
  /** A separator comes before this scene (not the first of its chapter, and no heading of its own). */
  separatorBefore: boolean
}

export interface MsChapter {
  id: string
  /** Printed above the chapter; null when chapter titles are off. */
  heading: string | null
  /** Always set: the heading, or "Capitolo 3", for tables of contents. */
  label: string
  scenes: MsScene[]
}

export interface MsPart {
  /** Null for the chapters outside any part (and for every chapter when the project has no parts). */
  id: string | null
  /** Printed on its own page; null when part titles are off or for chapters outside any part. */
  heading: string | null
  chapters: MsChapter[]
}

export interface Manuscript {
  title: string
  subtitle: string
  author: string
  /** "circa 38.400 parole" in the language of the file. */
  wordsLabel: string
  words: number
  sceneCount: number
  lang: ExportLang
  /** BCP 47 language of the work, for lang attributes and spell check. */
  language: string
  kind: 'novel' | 'game'
  options: ManuscriptOptions
  /** "***", "#" or "" for a blank line. */
  separator: string
  parts: MsPart[]
  /** Current names by "<type>:<id>", for mentions and speakers. */
  names: Map<string, string>
}

/** The options of a request, completed with the project's settings and the medium's defaults. */
export function resolveManuscriptOptions(model: ExportModel, input: ManuscriptOptionsInput): ManuscriptOptions {
  const settings = model.project.settings
  const custom = settings.sceneSeparator?.trim()
  return {
    titlePage: input.titlePage ?? true,
    partTitles: input.partTitles ?? true,
    chapterTitles: input.chapterTitles ?? true,
    sceneTitles: input.sceneTitles ?? model.isGame,
    sceneCodes: input.sceneCodes ?? model.isGame,
    numbering: input.numbering ?? settings.chapterNumbering ?? 'arabic',
    separator: input.separator ?? (custom ? 'custom' : 'stars'),
    scenes: input.scenes ?? 'text',
    layout: input.layout ?? 'manuscript',
  }
}

const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]

export function exportRoman(n: number): string {
  let rest = n
  let out = ''
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph
      rest -= value
    }
  }
  return out
}

const IT_UNITS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove']
const IT_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta']
const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function italianWords(n: number): string {
  if (n < 20) return IT_UNITS[n]!
  if (n < 100) {
    const unit = n % 10
    let tens = IT_TENS[Math.floor(n / 10)]!
    // Ventuno, ventotto: the tens lose their vowel before uno and otto; ventitré takes the accent.
    if (unit === 1 || unit === 8) tens = tens.slice(0, -1)
    return unit === 0 ? tens : `${tens}${unit === 3 ? 'tré' : IT_UNITS[unit]}`
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100)
    const rest = n % 100
    const head = hundreds === 1 ? 'cento' : `${IT_UNITS[hundreds]}cento`
    if (!rest) return head
    // Centotto, centottanta.
    const tail = italianWords(rest)
    return tail.startsWith('ott') ? `${head.slice(0, -1)}${tail}` : `${head}${tail}`
  }
  return String(n)
}

function englishWords(n: number): string {
  if (n < 20) return EN_UNITS[n]!
  if (n < 100) return n % 10 ? `${EN_TENS[Math.floor(n / 10)]}-${EN_UNITS[n % 10]}` : EN_TENS[n / 10]!
  if (n < 1000) return n % 100 ? `${EN_UNITS[Math.floor(n / 100)]} hundred and ${englishWords(n % 100)}` : `${EN_UNITS[n / 100]} hundred`
  return String(n)
}

/** A chapter number as the numbering setting writes it: "3", "III", "Tre". */
export function exportChapterNumber(n: number, numbering: ManuscriptOptions['numbering'], lang: ExportLang): string {
  if (numbering === 'roman') return exportRoman(n)
  if (numbering === 'words') {
    const words = lang === 'en' ? englishWords(n) : italianWords(n)
    return words.charAt(0).toLocaleUpperCase() + words.slice(1)
  }
  if (numbering === 'none') return ''
  return String(n)
}

/** "circa 38.400 parole": the count rounded to the hundred (exact below a hundred). */
export function exportWordsLabel(t: ExportTranslator, lang: ExportLang, words: number): string {
  if (words < 100) return t('export.out.words', { n: exportNumber(lang, words) }, words)
  const rounded = Math.round(words / 100) * 100
  return t('export.out.aboutWords', { n: exportNumber(lang, rounded) }, rounded)
}

/** Scenes included by the "which scenes" option: always with text, then by status. */
export function exportSceneFilter(rule: ManuscriptOptions['scenes']) {
  return (scene: { status: string, wordCount: number }) => {
    if (scene.wordCount <= 0) return false
    if (rule === 'final') return scene.status === 'final'
    if (rule === 'revised') return scene.status === 'revised' || scene.status === 'final'
    return true
  }
}

/** Builds the manuscript of a model loaded with its scene texts. */
export function buildManuscript(model: ExportModel, input: ManuscriptOptionsInput): Manuscript {
  const options = resolveManuscriptOptions(model, input)
  const { t, lang } = model
  const include = exportSceneFilter(options.scenes)
  const kind = model.project.kind
  const partWord = (n: number) => t(`common.vocab.${kind}.part`, {}, 1) + ` ${n}`

  const groups: MsPart[] = []
  const partIndex = new Map(model.parts.map((p, i) => [p.id, i]))
  let words = 0
  let sceneCount = 0

  for (const [position, chapter] of model.chapters.entries()) {
    const scenes = (model.scenesByChapter.get(chapter.id) ?? []).filter(include)
    if (!scenes.length) continue
    // The chapter keeps the number of the outline (and of the project document), whatever the selection leaves out.
    const chapterNumber = position + 1

    const index = chapter.partId ? partIndex.get(chapter.partId) : undefined
    const partId = model.usesParts && index !== undefined ? chapter.partId : null
    let group = groups.at(-1)
    if (!group || group.id !== partId) {
      const part = partId ? model.parts[index!]! : null
      group = {
        id: partId,
        heading: part && options.partTitles ? part.title.trim() || partWord(index! + 1) : null,
        chapters: [],
      }
      groups.push(group)
    }

    const number = exportChapterNumber(chapterNumber, options.numbering, lang)
    const title = chapter.title.trim()
    const label = number && title ? `${number}. ${title}` : title || number || t('export.out.chapterNumber', { n: chapterNumber })
    const heading = options.chapterTitles ? label : null

    const msScenes: MsScene[] = scenes.map((scene, i) => {
      const parts = [options.sceneCodes ? scene.code : '', scene.title.trim()].filter(Boolean)
      const sceneHeading = options.sceneTitles && parts.length ? parts.join(' ') : null
      words += scene.wordCount
      sceneCount++
      return {
        id: scene.id,
        code: scene.code,
        heading: sceneHeading,
        content: model.content.get(scene.id) ?? null,
        words: scene.wordCount,
        separatorBefore: i > 0 && !sceneHeading,
      }
    })
    group.chapters.push({ id: chapter.id, heading, label, scenes: msScenes })
  }

  return {
    title: model.project.title,
    subtitle: model.project.subtitle,
    author: model.project.authorName,
    wordsLabel: exportWordsLabel(t, lang, words),
    words,
    sceneCount,
    lang,
    language: model.project.language || lang,
    kind,
    options,
    separator: options.separator === 'hash' ? '#' : options.separator === 'blank' ? '' : options.separator === 'custom' ? model.project.settings.sceneSeparator?.trim() || '***' : '***',
    parts: groups,
    names: model.names,
  }
}
