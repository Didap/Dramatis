import { describe, expect, it } from 'vitest'
import { GENRES, genreOf, hasBestiary } from '../../shared/content/genres'
import { STRUCTURES } from '../../shared/content/structures'
import { GAME_GENRES } from '../../shared/utils/constants'
import itCommon from '../../i18n/locales/it/common.json'
import enCommon from '../../i18n/locales/en/common.json'
import itStructures from '../../i18n/locales/it/structures.json'
import enStructures from '../../i18n/locales/en/structures.json'

const LOCALES = [
  { name: 'it', common: itCommon.common, structures: itStructures.structures as Record<string, { name: string, chapters: Record<string, unknown> }> },
  { name: 'en', common: enCommon.common, structures: enStructures.structures as Record<string, { name: string, chapters: Record<string, unknown> }> },
]

describe('game genres (VRS-682)', () => {
  it('every genre starts from a game structure with its copy and its label in both languages', () => {
    expect(GENRES.map(g => g.key)).toEqual([...GAME_GENRES])
    for (const genre of GENRES) {
      const structure = STRUCTURES.find(s => s.key === genre.structure)
      expect(structure, genre.key).toBeDefined()
      expect(structure!.media as readonly string[]).toContain('game')
      for (const locale of LOCALES) {
        const copy = locale.structures[genre.structure]
        expect(copy?.name, `${locale.name} ${genre.structure}`).toBeTruthy()
        for (const part of structure!.parts) {
          for (const chapter of part.chapters) expect(copy!.chapters[chapter], `${locale.name} ${chapter}`).toBeDefined()
        }
        expect((locale.common.enums as Record<string, Record<string, string>>).gameGenre?.[genre.key], `${locale.name} label ${genre.key}`).toBeTruthy()
      }
    }
  })

  it('a genre belongs to games only, and only Metroidvania has a bestiary so far', () => {
    expect(genreOf('novel', 'metroidvania')).toBeNull()
    expect(genreOf('game', '')).toBeNull()
    expect(genreOf('game', 'not-a-genre')).toBeNull()
    expect(genreOf('game', 'metroidvania')?.layout).toBe('metroidvania')
    expect(GENRES.filter(g => hasBestiary(g)).map(g => g.key)).toEqual(['metroidvania'])
    expect(hasBestiary(null)).toBe(false)
  })
})
