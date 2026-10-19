import { parseStoryTime } from '#shared/utils/time'
/** Locale-aware formatting of counts and dates. */
export function useFormat() {
  const { t, locale } = useI18n()
  const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'it-IT'))

  // Italian does not group four-digit numbers by default ("3638"): always group, as in "3.638 parole".
  const number = (value: number) => new Intl.NumberFormat(tag.value, { useGrouping: 'always' } as Intl.NumberFormatOptions).format(value)
  /** "1.240 parole" / "1,240 words". */
  const words = (count: number) => t('common.units.words', { n: number(count) }, count)
  const scenes = (count: number) => t('common.units.scenes', { n: number(count) }, count)
  const chapters = (count: number) => t('common.units.chapters', { n: number(count) }, count)
  const percent = (ratio: number) => new Intl.NumberFormat(tag.value, { style: 'percent', maximumFractionDigits: 0 }).format(ratio)

  const date = (value: string | Date, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) =>
    new Intl.DateTimeFormat(tag.value, options).format(typeof value === 'string' ? new Date(value) : value)
  const time = (value: string | Date) =>
    new Intl.DateTimeFormat(tag.value, { hour: '2-digit', minute: '2-digit' }).format(typeof value === 'string' ? new Date(value) : value)

  /** "3 minuti fa", "ieri", "il 12 marzo". */
  const relative = (value: string | Date) => {
    const then = typeof value === 'string' ? new Date(value) : value
    const seconds = Math.round((then.getTime() - Date.now()) / 1000)
    const rtf = new Intl.RelativeTimeFormat(tag.value, { numeric: 'auto' })
    const abs = Math.abs(seconds)
    if (abs < 45) return t('common.time.justNow')
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
    if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour')
    if (abs < 7 * 86_400) return rtf.format(Math.round(seconds / 86_400), 'day')
    return date(then, { day: 'numeric', month: 'short', year: then.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
  }

  /** An in-story time ("12 giugno 1957, 08:30"); falls back to the raw value or label. */
  const storyTime = (value: string | null | undefined, label?: string) => {
    const parts = parseStoryTime(value)
    if (!parts) return label ?? ''
    const { year, month, day, hour, minute } = parts
    let text: string
    if (year < 1 || year > 9999) text = month && day ? `${day}/${month}/${year}` : String(year)
    else if (day && month) text = date(new Date(year, month - 1, day), { day: 'numeric', month: 'long', year: 'numeric' })
    else if (month) text = new Intl.DateTimeFormat(tag.value, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
    else text = String(year)
    if (hour !== undefined) text += `, ${String(hour).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}`
    return label ? `${text} (${label})` : text
  }

  return { number, words, scenes, chapters, percent, date, time, relative, storyTime, localeTag: tag }
}
