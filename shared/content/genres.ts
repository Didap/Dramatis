/**
 * Game genres (VRS-682): what each one brings to a new game. A genre with a sidebar of its own
 * (VRS-683, Metroidvania) also splits characters into characters, enemies and bosses, and objects
 * into objects, equipment, abilities and collectibles: its bestiary. The other genres keep the
 * standard game sidebar until their own is designed.
 *
 * Labels live in i18n/locales/<locale>/common.json (common.enums.gameGenre).
 */

import { GAME_GENRES } from '../utils/constants'
import type { GameGenre, ProjectModules } from '../types/domain'

/** The sidebars a game can have: the standard one, or a genre's own. */
export type NavLayout = 'standard' | 'metroidvania'

export interface GenreDef {
  key: GameGenre
  /** The structure laid out by "Da una struttura" (shared/content/structures.ts). */
  structure: string
  layout: NavLayout
  /** Characters split into characters, enemies and bosses, objects by category (VRS-683). */
  bestiary?: boolean
  /** The maps of places have a page of their own (the Metroidvania "Planimetria"), not the places page. */
  mapPage?: boolean
  /** Modules a new game of the genre starts with, over the game defaults. */
  modules?: ProjectModules
}

const DEFS: Record<GameGenre, Omit<GenreDef, 'key'>> = {
  action: { structure: 'game_three_acts', layout: 'standard' },
  adventure: { structure: 'branching_endings', layout: 'standard' },
  rpg: { structure: 'hub_and_quests', layout: 'standard' },
  // Its sidebar has no codex (VRS-683): it starts off, and shows once switched on in Settings.
  metroidvania: { structure: 'metroidvania', layout: 'metroidvania', bestiary: true, mapPage: true, modules: { codex: false } },
  soulslike: { structure: 'heros_journey', layout: 'standard' },
  shooter: { structure: 'game_three_acts', layout: 'standard' },
  strategy: { structure: 'hub_and_quests', layout: 'standard' },
  platformer: { structure: 'game_three_acts', layout: 'standard' },
  fighting: { structure: 'game_three_acts', layout: 'standard' },
  puzzle: { structure: 'game_three_acts', layout: 'standard' },
  roguelike: { structure: 'hub_and_quests', layout: 'standard' },
}

export const GENRES: readonly GenreDef[] = GAME_GENRES.map(key => ({ key, ...DEFS[key] }))

/** The genre of a project, or null for a novel and for a game without one. */
export function genreOf(kind: string, gameGenre: string | null | undefined): GenreDef | null {
  if (kind !== 'game' || !gameGenre) return null
  return GENRES.find(g => g.key === gameGenre) ?? null
}

/** Whether the genre splits characters and objects by category (its bestiary). */
export const hasBestiary = (genre: GenreDef | null) => !!genre?.bestiary
