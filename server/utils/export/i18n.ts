import enCommon from '../../../i18n/locales/en/common.json'
import enExport from '../../../i18n/locales/en/export.json'
import enProfile from '../../../i18n/locales/en/profile.json'
import itCommon from '../../../i18n/locales/it/common.json'
import itExport from '../../../i18n/locales/it/export.json'
import itProfile from '../../../i18n/locales/it/profile.json'

/*
 * The words an export writes into the file itself (title page, headings of the project document,
 * "Continua" in Twee...). They come from the same translation files as the app, read on the server.
 */

export type ExportLang = 'it' | 'en'

type Messages = Record<string, unknown>

const MESSAGES: Record<ExportLang, Messages> = {
  it: { ...itCommon, ...itExport, ...itProfile },
  en: { ...enCommon, ...enExport, ...enProfile },
}

/**
 * The language of the copy written into a file: the language of the work when it is Italian or
 * English (an Italian author may write in English for the team), otherwise the author's own.
 */
export function exportLanguage(workLanguage: string | null | undefined, userLocale: string | null | undefined): ExportLang {
  const work = (workLanguage ?? '').toLowerCase()
  if (work.startsWith('it')) return 'it'
  if (work.startsWith('en')) return 'en'
  return userLocale === 'en' ? 'en' : 'it'
}

function lookup(messages: Messages, key: string): unknown {
  let node: unknown = messages
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

/** vue-i18n's default choice rule: "one | other" or "zero | one | other". */
function choose(message: string, count: number | undefined): string {
  const choices = message.split('|').map(c => c.trim())
  if (choices.length < 2 || count === undefined) return choices[0] ?? ''
  const n = Math.abs(count)
  if (choices.length === 2) return choices[n === 1 ? 0 : 1]!
  return choices[Math.min(n, 2)]!
}

export type ExportTranslator = (key: string, params?: Record<string, string | number>, count?: number) => string

/** A translator with the message format of the app: `{name}` placeholders and `|` plurals. */
export function exportTranslator(lang: ExportLang): ExportTranslator {
  const messages = MESSAGES[lang]
  return (key, params, count) => {
    const raw = lookup(messages, key) ?? lookup(MESSAGES.it, key)
    if (typeof raw !== 'string') return key
    const message = choose(raw, count ?? (typeof params?.n === 'number' ? params.n : undefined))
    return message.replace(/\{(\w+)\}/g, (match, name: string) => (params && name in params ? String(params[name]) : match))
  }
}

/** Numbers formatted for the language of the file ("1.240", "1,240"; grouped from four digits, as the spec writes them). */
export function exportNumber(lang: ExportLang, value: number): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'it-IT', { useGrouping: 'always' }).format(value)
}

/** A date formatted for the language of the file ("18 ottobre 2026"). */
export function exportDate(lang: ExportLang, value: Date | string, timeZone?: string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(date)
  }
  catch {
    return date.toISOString().slice(0, 10)
  }
}
