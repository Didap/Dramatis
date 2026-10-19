/** Icon of a scene or planning status (lucide). Colours are the --status-<key> CSS variables. */
export function statusIcon(kind: 'scene' | 'planning', value: string): string {
  if (kind === 'scene') {
    return ({
      planned: 'i-lucide-circle-dashed',
      draft: 'i-lucide-pencil-line',
      revised: 'i-lucide-check',
      final: 'i-lucide-stamp',
    } as Record<string, string>)[value] ?? 'i-lucide-circle'
  }
  return ({
    todo: 'i-lucide-circle',
    progress: 'i-lucide-circle-dot',
    done: 'i-lucide-circle-check-big',
  } as Record<string, string>)[value] ?? 'i-lucide-circle'
}

/** Icon of an entity kind. */
export const REF_ICONS: Record<string, string> = {
  character: 'i-lucide-user-round',
  group: 'i-lucide-users-round',
  location: 'i-lucide-map-pin',
  object: 'i-lucide-gem',
  codex: 'i-lucide-library-big',
  strand: 'i-lucide-spline',
  chapter: 'i-lucide-book-open',
  scene: 'i-lucide-file-text',
  event: 'i-lucide-calendar-clock',
  note: 'i-lucide-sticky-note',
}

/** Icon of a scene kind (module scene_kinds). */
export const SCENE_KIND_ICONS: Record<string, string> = {
  scene: 'i-lucide-file-text',
  cutscene: 'i-lucide-clapperboard',
  dialogue: 'i-lucide-messages-square',
  gameplay: 'i-lucide-gamepad-2',
  exploration: 'i-lucide-compass',
  combat: 'i-lucide-swords',
  puzzle: 'i-lucide-puzzle',
}
