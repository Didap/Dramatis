import type { TimelineEntry } from './timeline-model'

/**
 * How a scene or an event of the timeline shows what it is, the same on the spine and in the tray:
 * its icon (the scene kind in games), its kind in words and, for the team, its scene code.
 */
export function useEntryLook() {
  const store = useProjectStore()
  const { term } = useTerms()
  const { label } = useEnums()

  function icon(entry: TimelineEntry): string {
    if (entry.kind === 'historical') return 'i-lucide-landmark'
    if (entry.kind === 'story') return REF_ICONS.event!
    return (store.modules.scene_kinds && SCENE_KIND_ICONS[entry.scene?.kind ?? 'scene']) || REF_ICONS.scene!
  }

  /** "Evento storico", "Cinematica"; a scene of a novel is just a scene. */
  function kindLabel(entry: TimelineEntry): string {
    if (entry.type === 'event') return label('eventKind', entry.kind)
    return store.modules.scene_kinds ? label('sceneKind', entry.scene?.kind ?? 'scene') : term('scene')
  }

  /** Events say their kind next to the title; scenes too when the project uses scene kinds. */
  const showsKind = (entry: TimelineEntry) => entry.type === 'event' || store.modules.scene_kinds

  /** "S014", when the team works with codes (branching or dialogue lines). */
  const code = (entry: TimelineEntry) => (entry.scene?.code && (store.modules.branching || store.modules.script) ? entry.scene.code : '')

  return { icon, kindLabel, showsKind, code }
}

// Nuxt registers every file of components/ as a component: a default export keeps its generated types valid.
export default { useEntryLook }
