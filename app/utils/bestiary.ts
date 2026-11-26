import type { ObjectCategory } from '#shared/types/domain'
import type { TermKey } from '~/composables/useTerms'
import { SECTION_ICONS } from '~/composables/useProjectNav'

/**
 * Where each category of objects is listed in a game with a bestiary (VRS-683): its page, its name
 * and its icon. Without a bestiary every object is on the objects page.
 */
export const OBJECT_SHELVES: Record<ObjectCategory, { path: string, term: TermKey, icon: string }> = {
  object: { path: 'objects', term: 'objects', icon: SECTION_ICONS.objects },
  equipment: { path: 'equipment', term: 'equipment', icon: SECTION_ICONS.equipment },
  ability: { path: 'abilities', term: 'abilities', icon: SECTION_ICONS.abilities },
  collectible: { path: 'collectibles', term: 'collectibles', icon: SECTION_ICONS.collectibles },
}
