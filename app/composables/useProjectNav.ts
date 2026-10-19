import type { TermKey } from './useTerms'

export interface NavItem {
  key: string
  label: string
  icon: string
  to: string
  /** Match only the exact path (the overview). */
  exact?: boolean
  badge?: number
  /** Accessible text of the badge ("2 problemi nel flusso"). */
  badgeLabel?: string
}

export interface NavGroup {
  key: 'top' | 'story' | 'world' | 'work' | 'review' | 'footer'
  label?: string
  items: NavItem[]
}

/** Icons of the workspace sections (lucide). */
export const SECTION_ICONS = {
  overview: 'i-lucide-house',
  goals: 'i-lucide-target',
  architecture: 'i-lucide-drafting-compass',
  strands: 'i-lucide-spline',
  notes: 'i-lucide-notebook-pen',
  world: 'i-lucide-globe',
  characters: 'i-lucide-user-round',
  groups: 'i-lucide-users-round',
  races: 'i-lucide-dna',
  locations: 'i-lucide-map-pin',
  objects: 'i-lucide-gem',
  relations: 'i-lucide-network',
  codex: 'i-lucide-library-big',
  manuscript: 'i-lucide-book-open',
  script: 'i-lucide-scroll-text',
  flow: 'i-lucide-split',
  variables: 'i-lucide-variable',
  timeline: 'i-lucide-calendar-range',
  analysis: 'i-lucide-chart-column',
  export: 'i-lucide-file-down',
  trash: 'i-lucide-trash-2',
  settings: 'i-lucide-settings-2',
  search: 'i-lucide-search',
  add: 'i-lucide-plus',
  more: 'i-lucide-ellipsis',
} as const

/** The sections of the open project (spec 1.2 and 1.3): a hidden module removes its entry. */
export function useProjectNav() {
  const store = useProjectStore()
  const { term } = useTerms()
  const { t } = useI18n()
  const { problems } = useFlow()

  const groups = computed<NavGroup[]>(() => {
    const base = `/p/${store.projectId}`
    const item = (key: string, label: TermKey, path: string, extra: Partial<NavItem> = {}): NavItem => ({
      key,
      label: term(label, 2),
      icon: SECTION_ICONS[key as keyof typeof SECTION_ICONS],
      to: path ? `${base}/${path}` : base,
      ...extra,
    })
    const flowProblems = problems.value
    return [
      { key: 'top', items: [item('overview', 'overview', '', { exact: true }), item('goals', 'goals', 'goals')] },
      { key: 'story', label: t('common.nav.story'), items: [item('architecture', 'architecture', 'architecture'), item('strands', 'strands', 'strands'), item('notes', 'notes', 'notes')] },
      {
        key: 'world',
        label: t('common.nav.world'),
        items: [
          item('characters', 'characters', 'characters'),
          ...(store.modules.races ? [item('races', 'races', 'races')] : []),
          item('groups', 'groups', 'groups'),
          item('locations', 'locations', 'locations'),
          item('objects', 'objects', 'objects'),
          item('relations', 'relations', 'relations'),
          ...(store.modules.codex ? [item('codex', 'codex', 'codex')] : []),
        ],
      },
      {
        key: 'work',
        label: t('common.nav.work'),
        items: [
          { ...item('manuscript', 'manuscript', 'manuscript'), icon: store.isGame ? SECTION_ICONS.script : SECTION_ICONS.manuscript },
          ...(store.modules.branching
            ? [item('flow', 'flow', 'flow', flowProblems ? { badge: flowProblems, badgeLabel: t('common.nav.flowProblems', { n: flowProblems }, flowProblems) } : {})]
            : []),
          ...(store.modules.variables ? [item('variables', 'variables', 'variables')] : []),
          item('timeline', 'timeline', 'timeline'),
        ],
      },
      { key: 'review', label: t('common.nav.review'), items: [item('analysis', 'analysis', 'analysis'), item('export', 'export', 'export')] },
      {
        key: 'footer',
        items: [
          item('trash', 'trash', 'trash', store.trashCount ? { badge: store.trashCount, badgeLabel: t('common.nav.trashCount', { n: store.trashCount }, store.trashCount) } : {}),
          item('settings', 'settings', 'settings'),
        ],
      },
    ]
  })

  return { groups }
}
