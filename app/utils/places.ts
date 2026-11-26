import type { PlaceQuestion, RichDoc } from '#shared/types/domain'
import type { StoryLocation } from '#shared/types/entities'
import { PLACE_QUESTIONS } from '#shared/utils/constants'
import { isEmptyDoc } from '#shared/utils/richtext'

/**
 * What a place says of itself, as its sheet shows it: the description, or its answers (in order)
 * when it is described guided (VRS-683). Empty texts are left out.
 */
export function placeTexts(place: StoryLocation): { key: 'description' | PlaceQuestion, doc: RichDoc }[] {
  const keys = place.describe === 'guided' ? PLACE_QUESTIONS : (['description'] as const)
  return keys.flatMap((key) => {
    const doc = place[key]
    return doc && !isEmptyDoc(doc) ? [{ key, doc }] : []
  })
}
