import { eq } from 'drizzle-orm'
import { CODEX_DEFAULT_CATEGORIES } from '#shared/utils/constants'

const CODEX_NAMES: Record<'it' | 'en', Record<(typeof CODEX_DEFAULT_CATEGORIES)[number], string>> = {
  it: { history: 'Storia', peoples: 'Popoli', religions: 'Religioni', magic: 'Magia e tecnologia', bestiary: 'Bestiario', languages: 'Lingue', politics: 'Politica' },
  en: { history: 'History', peoples: 'Peoples', religions: 'Religions', magic: 'Magic and technology', bestiary: 'Bestiary', languages: 'Languages', politics: 'Politics' },
}

/** The seven default codex categories, in the author's language. */
export async function createDefaultCodex(projectId: string, locale: 'it' | 'en', db: DbOrTx) {
  for (const [position, key] of CODEX_DEFAULT_CATEGORIES.entries()) {
    await db.insert(tables.codexCategories).values({ projectId, name: CODEX_NAMES[locale][key], position })
  }
}

/** Creates the default codex categories when the project has none (the module was just switched on). */
export async function ensureDefaultCodex(projectId: string, locale: 'it' | 'en', db: DbOrTx) {
  const [existing] = await db.select({ id: tables.codexCategories.id }).from(tables.codexCategories).where(eq(tables.codexCategories.projectId, projectId)).limit(1)
  if (!existing) await createDefaultCodex(projectId, locale, db)
}

/** Default dialogue punctuation for the language of the work. */
export function defaultDialogueStyle(language: string): 'guillemets' | 'double_quotes' {
  return language.startsWith('it') || language.startsWith('fr') ? 'guillemets' : 'double_quotes'
}
