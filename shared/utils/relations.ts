import type { RelationKind, WorldRefType } from '../types/domain'

/** Relationship kinds offered for each ordered pair of entity kinds (spec 7.12). */
const KINDS: Partial<Record<`${WorldRefType}>${WorldRefType}`, readonly RelationKind[]>> = {
  'character>character': ['family', 'romance', 'friendship', 'alliance', 'rivalry', 'enmity', 'mentorship', 'professional', 'other'],
  'character>location': ['place', 'ownership', 'other'],
  'character>object': ['ownership', 'other'],
  'character>group': ['membership', 'alliance', 'rivalry', 'enmity', 'professional', 'other'],
  'location>group': ['membership', 'other'],
  'object>group': ['membership', 'other'],
  'group>group': ['alliance', 'rivalry', 'enmity', 'other'],
  'group>location': ['place', 'ownership', 'other'],
  'group>object': ['ownership', 'other'],
  'location>location': ['place', 'other'],
  'object>location': ['place', 'other'],
  'object>object': ['other'],
}

/** Kinds that read one way by default: mentor to pupil, owner to thing, who or what to the place, member to group. */
export const DIRECTED_KINDS: readonly RelationKind[] = ['mentorship', 'ownership', 'place', 'membership']

/**
 * The kinds valid from `from` to `to`. When the pair is only listed the other way round
 * (a location to a character), `swap` is true: create the relationship from `to` to `from`.
 */
export function relationKindsFor(from: WorldRefType, to: WorldRefType): { kinds: readonly RelationKind[], swap: boolean } {
  const direct = KINDS[`${from}>${to}`]
  if (direct) return { kinds: direct, swap: false }
  const reverse = KINDS[`${to}>${from}`]
  if (reverse) return { kinds: reverse, swap: true }
  return { kinds: ['other'], swap: false }
}

/** true when `kind` is allowed between the two kinds, in this direction. */
export function isValidRelation(from: WorldRefType, to: WorldRefType, kind: RelationKind): boolean {
  const direct = KINDS[`${from}>${to}`]
  return (direct ?? (from === to ? ['other'] : [])).includes(kind) || (!direct && !KINDS[`${to}>${from}`] && kind === 'other')
}

export function isDirectedByDefault(kind: RelationKind): boolean {
  return DIRECTED_KINDS.includes(kind)
}
