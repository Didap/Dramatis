import type { ObjectCategory } from '#shared/types/domain'
import { ENEMY_CATEGORIES } from '#shared/utils/constants'

/**
 * The section where each category of objects is listed in a game with a bestiary (VRS-683): the key
 * is its page, its term and its icon (SECTION_ICONS). Without a bestiary every object is on the
 * objects page.
 */
export const OBJECT_SHELVES = {
  object: 'objects',
  equipment: 'equipment',
  ability: 'abilities',
  collectible: 'collectibles',
} as const satisfies Record<ObjectCategory, string>

/** The copy of a list of objects (i18n prefix): a bestiary category's own, or the objects' of the medium. */
export const objectCopy = (category: ObjectCategory | undefined, kind: string) =>
  (category && category !== 'object' ? `objects.shelf.${category}` : `objects.${kind}`)

/** A character fought rather than met: an enemy or a boss. */
export const isEnemy = (character: { category: string }) => (ENEMY_CATEGORIES as readonly string[]).includes(character.category)
