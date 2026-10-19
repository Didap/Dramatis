import { STRUCTURES } from '../../shared/content/structures'
import enStructures from '../../i18n/locales/en/structures.json'
import itStructures from '../../i18n/locales/it/structures.json'
import { ENTITY_COLORS } from '#shared/utils/constants'
import { docFromParagraphs } from '#shared/utils/richtext'

type ProjectRow = typeof tables.projects.$inferSelect

interface StructureCopy {
  name: string
  description: string
  parts: Record<string, string>
  chapters: Record<string, { title: string, reason: string }>
  strands: Record<string, { name: string, description: string }>
}

const COPY: Record<'it' | 'en', Record<string, StructureCopy>> = {
  it: (itStructures as { structures: Record<string, StructureCopy> }).structures,
  en: (enStructures as { structures: Record<string, StructureCopy> }).structures,
}

/**
 * Fills a new project with the parts, chapters (each with the reason of its beat) and strands
 * of a structure template, in the author's language.
 */
export async function applyStructure(tx: DbOrTx, project: ProjectRow, key: string, locale: 'it' | 'en') {
  const structure = STRUCTURES.find(s => s.key === key)
  if (!structure) throw createError({ statusCode: 400, message: `Unknown structure ${key}` })
  const copy = COPY[locale][key] ?? COPY.it[key]
  if (!copy) throw createError({ statusCode: 500, message: `Missing copy for structure ${key}` })

  for (const [partIndex, part] of structure.parts.entries()) {
    const [row] = await tx
      .insert(tables.parts)
      .values({ projectId: project.id, title: copy.parts[part.key] ?? part.key, position: partIndex })
      .returning({ id: tables.parts.id })
    for (const [chapterIndex, chapterKey] of part.chapters.entries()) {
      const chapter = copy.chapters[chapterKey]
      await tx.insert(tables.chapters).values({
        projectId: project.id,
        partId: row!.id,
        title: chapter?.title ?? chapterKey,
        reason: chapter?.reason ? docFromParagraphs([chapter.reason]) : null,
        position: chapterIndex,
      })
    }
  }

  for (const [index, strand] of structure.strands.entries()) {
    const text = copy.strands[strand.key]
    await tx.insert(tables.strands).values({
      projectId: project.id,
      name: text?.name ?? strand.key,
      kind: strand.kind,
      description: text?.description ? docFromParagraphs([text.description]) : null,
      quest: strand.kind === 'quest' || strand.kind === 'side_quest' ? { objectives: [], rewards: [] } : null,
      color: ENTITY_COLORS[(index * 5) % ENTITY_COLORS.length],
      position: index,
    })
  }
}
