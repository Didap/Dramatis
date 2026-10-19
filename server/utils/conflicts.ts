import type { Collection, FieldVersions, RichDoc } from '../../shared/types/domain'
import { LONG_TEXT_FIELDS } from '#shared/utils/constants'

const FIELD_LABELS: Record<'it' | 'en', Record<string, string>> = {
  it: {
    premise: 'Premessa',
    fabula: 'Fabula',
    setting: 'Ambientazione',
    description: 'descrizione',
    notes: 'note',
    language: 'lingua',
    traditions: 'tradizioni',
    powers: 'poteri',
    reason: 'scopo del capitolo',
    content: 'testo',
    body: 'testo',
    profile: 'profilo',
  },
  en: {
    premise: 'Premise',
    fabula: 'Fabula',
    setting: 'Setting',
    description: 'description',
    notes: 'notes',
    language: 'language',
    traditions: 'traditions',
    powers: 'powers',
    reason: 'purpose of the chapter',
    content: 'text',
    body: 'text',
    profile: 'profile',
  },
}

export interface ConflictNote {
  field: string
  note: Record<string, unknown>
}

export interface ConflictContext {
  projectId: string
  locale: string
  timeZone: string
  /** Name of the item the text belongs to ("Anna"); empty for the project's own fields. */
  itemName: string
}

function conflictTitle(ctx: ConflictContext, field: string): string {
  const locale = ctx.locale === 'en' ? 'en' : 'it'
  const [root, section] = field.split('.')
  const label = FIELD_LABELS[locale][root!] ?? root!
  const what = section ? `${label} (${section})` : label
  const when = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'it-IT', {
    timeZone: ctx.timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
  const prefix = locale === 'en' ? 'Conflict' : 'Conflitto'
  return ctx.itemName ? `${prefix}: ${ctx.itemName}, ${what}, ${when}` : `${prefix}: ${what}, ${when}`
}

async function keepAsNote(ctx: ConflictContext, field: string, doc: RichDoc | null, db: DbOrTx): Promise<ConflictNote> {
  const [note] = await db
    .insert(tables.notes)
    .values({ projectId: ctx.projectId, title: conflictTitle(ctx, field), content: doc, position: await nextPosition(ctx.projectId, 'notes', {}, db) })
    .returning()
  return { field, note: JSON.parse(JSON.stringify(note)) }
}

/**
 * The conflict rule for long texts (spec 5.11): a save of a long text field carries, in `$base`, the
 * version it was based on. If the server holds a newer one, nothing is overwritten: the incoming text
 * becomes a note "Conflitto: ..." and the field is left out of the update. Applied fields get version + 1.
 * Profile free texts are versioned per section ("profile.<section>").
 */
export async function applyLongTextRule(
  collection: Collection | 'project',
  existing: { versions: FieldVersions },
  patch: Record<string, any>,
  ctx: ConflictContext,
  db: DbOrTx,
): Promise<{ patch: Record<string, any>, conflicts: ConflictNote[] }> {
  const base: Record<string, number> = patch.$base ?? {}
  const next: Record<string, any> = { ...patch }
  delete next.$base
  const versions: FieldVersions = { ...existing.versions }
  const conflicts: ConflictNote[] = []
  let bumped = false

  for (const field of LONG_TEXT_FIELDS[collection]) {
    if (!(field in next)) continue
    const current = versions[field] ?? 0
    if (field in base && base[field]! < current) {
      conflicts.push(await keepAsNote(ctx, field, next[field] ?? null, db))
      delete next[field]
    }
    else {
      versions[field] = current + 1
      bumped = true
    }
  }

  if (collection === 'characters' && next.profile) {
    for (const [section, value] of Object.entries(next.profile as Record<string, { free?: RichDoc | null }>)) {
      if (!value || !('free' in value)) continue
      const key = `profile.${section}`
      const current = versions[key] ?? 0
      if (key in base && base[key]! < current) {
        conflicts.push(await keepAsNote(ctx, key, value.free ?? null, db))
        delete value.free
      }
      else {
        versions[key] = current + 1
        bumped = true
      }
    }
  }

  if (bumped) next.versions = versions
  return { patch: next, conflicts }
}
