import type { DurationUnit } from '#shared/types/domain'
import { parseStoryTime } from '#shared/utils/time'
import type { StoryTimeParts } from '#shared/utils/time'

/*
 * In-story dates (spec 7.16): '1953', '1953-11', '1953-11-14' or '1953-11-14T22:10', years -9999 to 9999,
 * proleptic Gregorian. Helpers to edit them field by field, to place them on a real time axis and to
 * write them in the UI language.
 */

export type StoryPrecision = 'year' | 'month' | 'day' | 'minute'

export function precisionOf(parts: StoryTimeParts): StoryPrecision {
  if (parts.hour !== undefined) return 'minute'
  if (parts.day !== undefined) return 'day'
  if (parts.month !== undefined) return 'month'
  return 'year'
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** What the date fields hold while the author edits them. `none` = no date. */
export interface StoryTimeDraft {
  precision: StoryPrecision | 'none'
  /** Number inputs give numbers back, or '' when empty. */
  year: string | number
  month: number | null
  day: string | number
  /** HH:MM */
  time: string
}

export type StoryTimeError = 'year' | 'yearRange' | 'month' | 'day' | 'dayRange' | 'time'

export function draftOf(value: string | null | undefined): StoryTimeDraft {
  const parts = parseStoryTime(value)
  if (!parts) return { precision: 'none', year: '', month: null, day: '', time: '' }
  return {
    precision: precisionOf(parts),
    year: String(parts.year),
    month: parts.month ?? null,
    day: parts.day !== undefined ? String(parts.day) : '',
    time: parts.hour !== undefined ? `${String(parts.hour).padStart(2, '0')}:${String(parts.minute ?? 0).padStart(2, '0')}` : '',
  }
}

/**
 * The stored value of a draft. `value` is null with an error when a field is missing or impossible;
 * precision `none` gives null without error.
 */
export function composeStoryTime(draft: StoryTimeDraft): { value: string | null, error: StoryTimeError | null } {
  if (draft.precision === 'none') return { value: null, error: null }
  const yearText = String(draft.year ?? '').trim()
  if (!/^-?\d{1,4}$/.test(yearText)) return { value: null, error: yearText ? 'yearRange' : 'year' }
  const year = Number(yearText)
  let value = String(year)
  if (draft.precision === 'year') return { value, error: null }

  if (!draft.month || draft.month < 1 || draft.month > 12) return { value: null, error: 'month' }
  value += `-${String(draft.month).padStart(2, '0')}`
  if (draft.precision === 'month') return { value, error: null }

  const dayText = String(draft.day ?? '').trim()
  if (!/^\d{1,2}$/.test(dayText)) return { value: null, error: 'day' }
  const day = Number(dayText)
  if (day < 1 || day > daysInMonth(year, draft.month)) return { value: null, error: 'dayRange' }
  value += `-${String(day).padStart(2, '0')}`
  if (draft.precision === 'day') return { value, error: null }

  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((draft.time ?? '').trim())
  if (!time) return { value: null, error: 'time' }
  return { value: `${value}T${time[1]}:${time[2]}`, error: null }
}

const MINUTE = 60_000
const UNIT_MINUTES: Partial<Record<DurationUnit, number>> = { minutes: 1, hours: 60, days: 1440, weeks: 10_080 }

/** Start of a story time on a real axis (UTC milliseconds), at the beginning of its precision. */
export function storyStart(parts: StoryTimeParts): number {
  const date = new Date(0)
  date.setUTCFullYear(parts.year, (parts.month ?? 1) - 1, parts.day ?? 1)
  date.setUTCHours(parts.hour ?? 0, parts.minute ?? 0, 0, 0)
  return date.getTime()
}

/** Adds a duration to an instant, by calendar for months and years. */
function addDuration(start: number, value: number, unit: DurationUnit): number {
  const minutes = UNIT_MINUTES[unit]
  if (minutes !== undefined) return start + value * minutes * MINUTE
  const date = new Date(start)
  if (unit === 'months') date.setUTCMonth(date.getUTCMonth() + value)
  else date.setUTCFullYear(date.getUTCFullYear() + value)
  return date.getTime()
}

/**
 * When something happens, as a span of real time, or null when the date is too vague to compare
 * (a day without an hour and without a duration in days could be any moment of that day).
 * A precise moment without a duration is an instant (start = end).
 */
export function storySpan(at: string | null | undefined, durationValue: number | null | undefined, durationUnit: DurationUnit | null | undefined): { start: number, end: number } | null {
  const parts = parseStoryTime(at)
  if (!parts) return null
  const precision = precisionOf(parts)
  const start = storyStart(parts)
  const hasDuration = !!durationUnit && durationValue !== null && durationValue !== undefined && durationValue > 0
  if (precision === 'minute') return { start, end: hasDuration ? addDuration(start, durationValue!, durationUnit!) : start }
  // Coarser dates only compare when the duration says how much of the period they take.
  const coarse = { day: ['days', 'weeks', 'months', 'years'], month: ['months', 'years'], year: ['years'] }[precision]
  if (!hasDuration || !coarse.includes(durationUnit!)) return null
  return { start, end: addDuration(start, durationValue!, durationUnit!) }
}

/** true when two spans share some time (two instants overlap only when they are the same moment). */
export function spansOverlap(a: { start: number, end: number }, b: { start: number, end: number }): boolean {
  if (a.start === a.end && b.start === b.end) return a.start === b.start
  if (a.start === a.end) return a.start >= b.start && a.start < b.end
  if (b.start === b.end) return b.start >= a.start && b.start < a.end
  return a.start < b.end && b.start < a.end
}

/** The heading a date is written under. */
export type DateContext = 'year' | 'month' | 'day'

/** Story dates in the UI language. */
export function useStoryCalendar() {
  const { t } = useI18n()
  const { localeTag } = useFormat()

  // A fixed leap year gives month and day names for any year, BC included.
  const reference = (month = 1, day = 1) => new Date(Date.UTC(2000, month - 1, day, 12))
  const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase(localeTag.value) + text.slice(1)

  const yearText = (year: number) => (year < 0 ? t('timeline.date.bc', { year: -year }) : String(year))

  const monthName = (month: number, style: 'long' | 'short' = 'long') =>
    new Intl.DateTimeFormat(localeTag.value, { month: style, timeZone: 'UTC' }).format(reference(month))

  const monthOptions = computed(() => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: capitalize(monthName(i + 1)) })))

  /** The weekday of a real date ("lunedì", "lun"); empty before year 1. */
  const weekday = (year: number, month: number, day: number, style: 'long' | 'short') => {
    if (year < 1) return ''
    const date = new Date(storyStart({ year, month, day }) + 12 * 3_600_000)
    return new Intl.DateTimeFormat(localeTag.value, { weekday: style, timeZone: 'UTC' }).format(date)
  }

  /** "12 marzo", "12 mar"; with the weekday for real years ("lunedì 12 marzo"). */
  const dayMonth = (year: number, month: number, day: number, options: { style?: 'long' | 'short', weekday?: boolean } = {}) => {
    const style = options.style ?? 'long'
    const text = new Intl.DateTimeFormat(localeTag.value, { day: 'numeric', month: style, timeZone: 'UTC' }).format(reference(month, day))
    const name = options.weekday ? weekday(year, month, day, style) : ''
    return name ? `${name} ${text}` : text
  }

  const clock = (parts: StoryTimeParts) => `${String(parts.hour ?? 0).padStart(2, '0')}:${String(parts.minute ?? 0).padStart(2, '0')}`

  /** The complete date: "1953", "novembre 1953", "14 novembre 1953", "14 novembre 1953, 22:10". */
  function fullDate(value: string | null | undefined, options: { style?: 'long' | 'short', weekday?: boolean } = {}): string {
    const parts = parseStoryTime(value)
    if (!parts) return ''
    const year = yearText(parts.year)
    if (parts.month === undefined) return year
    if (parts.day === undefined) return `${monthName(parts.month, options.style ?? 'long')} ${year}`
    const day = `${dayMonth(parts.year, parts.month, parts.day, options)} ${year}`
    return parts.hour === undefined ? day : t('timeline.date.withTime', { date: day, time: clock(parts) })
  }

  /**
   * The part of a date not already said by the heading above it, on up to two lines
   * (under "Agosto 1956": "mer 8" and "20:30"). Empty when the heading says it all.
   */
  function dateUnder(parts: StoryTimeParts, context: DateContext): { main: string, time: string } {
    const time = parts.hour !== undefined ? clock(parts) : ''
    if (context === 'day') return { main: '', time }
    if (parts.month === undefined) return { main: '', time: '' }
    if (parts.day === undefined) return { main: context === 'year' ? capitalize(monthName(parts.month)) : '', time: '' }
    if (context === 'month') return { main: [weekday(parts.year, parts.month, parts.day, 'short'), parts.day].filter(Boolean).join(' '), time }
    return { main: dayMonth(parts.year, parts.month, parts.day, { style: 'short' }), time }
  }

  /**
   * Headings of the timeline sections. A day says its weekday unless told not to: under dates written
   * in an invented calendar, the weekday of the real one would be wrong.
   */
  function heading(section: { level: 'year' | 'month' | 'day', year: number, month?: number, day?: number }, options: { weekday?: boolean } = {}): string {
    if (section.level === 'year') return yearText(section.year)
    if (section.level === 'month') return capitalize(monthName(section.month!))
    return capitalize(dayMonth(section.year, section.month!, section.day!, { weekday: options.weekday ?? true }))
  }

  /** "40 minuti", "3 giorni". */
  function durationText(value: number | null | undefined, unit: DurationUnit | null | undefined): string {
    if (value === null || value === undefined || !unit) return ''
    return t(`timeline.duration.${unit}`, { n: new Intl.NumberFormat(localeTag.value).format(value) }, value)
  }

  return { yearText, monthOptions, fullDate, dateUnder, heading, durationText }
}

// Nuxt registers every file of components/ as a component: a default export keeps its generated types valid.
export default { draftOf, composeStoryTime, storySpan }
