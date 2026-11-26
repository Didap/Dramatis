/**
 * Vocabulary that follows the medium of the open project (spec 2.1): Parte or Atto, Manoscritto or
 * Copione, Gruppi or Fazioni... A novel with game modules keeps the novel vocabulary.
 */
export type TermKey =
  | 'projectType' | 'overview' | 'goals' | 'architecture' | 'premise' | 'fabula' | 'setting'
  | 'strands' | 'strand' | 'notes' | 'world' | 'characters' | 'character' | 'groups' | 'group' | 'races' | 'race'
  | 'locations' | 'location' | 'placesSection' | 'objects' | 'object' | 'relations' | 'relationMap' | 'codex' | 'codexEntry'
  | 'manuscript' | 'part' | 'chapter' | 'scene' | 'synopsis' | 'chapterPurpose' | 'revision' | 'history'
  | 'timeline' | 'event' | 'analysis' | 'export' | 'trash' | 'settings' | 'audience' | 'firstDraft'
  | 'projectDocument' | 'flow' | 'variables' | 'variable' | 'ending'
  | 'enemies' | 'enemy' | 'equipment' | 'abilities' | 'collectibles' | 'placeMap'

export function useTerms() {
  const store = useProjectStore()
  const { t, te } = useI18n()
  /**
   * A medium-aware word; pass a count for the plural of countable terms (part, chapter, scene...).
   * A genre with its own sidebar (VRS-683) can rename a few sections (common.vocab.<layout>).
   */
  const term = (key: TermKey, count = 1) => {
    const layout = store.genre?.layout
    const own = layout && layout !== 'standard' ? `common.vocab.${layout}.${key}` : ''
    return t(own && te(own) ? own : `common.vocab.${store.kind}.${key}`, count)
  }
  return { term, medium: computed(() => store.kind) }
}
