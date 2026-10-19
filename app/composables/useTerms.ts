/**
 * Vocabulary that follows the medium of the open project (spec 2.1): Parte or Atto, Manoscritto or
 * Copione, Gruppi or Fazioni... A novel with game modules keeps the novel vocabulary.
 */
export type TermKey =
  | 'projectType' | 'overview' | 'goals' | 'architecture' | 'premise' | 'fabula' | 'setting'
  | 'strands' | 'strand' | 'notes' | 'world' | 'characters' | 'character' | 'groups' | 'group' | 'races' | 'race'
  | 'locations' | 'location' | 'objects' | 'object' | 'relations' | 'relationMap' | 'codex' | 'codexEntry'
  | 'manuscript' | 'part' | 'chapter' | 'scene' | 'synopsis' | 'chapterPurpose' | 'revision' | 'history'
  | 'timeline' | 'event' | 'analysis' | 'export' | 'trash' | 'settings' | 'audience' | 'firstDraft'
  | 'projectDocument' | 'flow' | 'variables' | 'variable' | 'ending'

export function useTerms() {
  const store = useProjectStore()
  const { t } = useI18n()
  /** A medium-aware word; pass a count for the plural of countable terms (part, chapter, scene...). */
  const term = (key: TermKey, count = 1) => t(`common.vocab.${store.kind}.${key}`, count)
  return { term, medium: computed(() => store.kind) }
}
