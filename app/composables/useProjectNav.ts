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
  /** Set when the path alone cannot tell (an enemy's sheet lives under /characters). */
  active?: boolean
}

export interface NavGroup {
  key: 'top' | 'story' | 'world' | 'bestiary' | 'map' | 'work' | 'review' | 'footer'
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
  enemies: 'i-lucide-skull',
  equipment: 'i-lucide-shield',
  abilities: 'i-lucide-zap',
  collectibles: 'i-lucide-star',
  placeMap: 'i-lucide-map',
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

/** The sections of the open project (spec 1.2 and 1.3): a hidden module removes its entry, and a game's genre can have its own sidebar (VRS-683). */
export function useProjectNav() {
  const store = useProjectStore()
  const { term } = useTerms()
  const { t } = useI18n()
  const route = useRoute()
  const { problems } = useFlow()

  /** In a game with a bestiary, the category of the character or object open, which picks the section to light up. */
  const openCategory = computed(() => {
    if (!store.bestiary) return null
    const { characterId, objectId } = route.params
    if (characterId) return store.get('characters', String(characterId))?.category ?? null
    if (objectId) return store.get('objects', String(objectId))?.category ?? null
    return null
  })

  const groups = computed<NavGroup[]>(() => {
    const base = `/p/${store.projectId}`
    const item = (key: string, label: TermKey, path: string, extra: Partial<NavItem> = {}): NavItem => ({
      key,
      label: term(label, 2),
      icon: SECTION_ICONS[key as keyof typeof SECTION_ICONS],
      to: path ? `${base}/${path}` : base,
      ...extra,
    })
    /** A bestiary section: lit on its list and on the sheets of its categories. */
    const shelf = (key: string, label: TermKey, path: string, sheets: 'characters' | 'objects', categories: readonly string[]): NavItem => {
      const under = route.path.startsWith(`${base}/${sheets}/`)
      return item(key, label, path, { active: route.path === `${base}/${path}` || (under && categories.includes(openCategory.value ?? '')) })
    }
    const flowProblems = problems.value
    const top: NavGroup = { key: 'top', items: [item('overview', 'overview', '', { exact: true }), item('goals', 'goals', 'goals')] }
    const work: NavGroup = {
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
    }
    const review: NavGroup = { key: 'review', label: t('common.nav.review'), items: [item('analysis', 'analysis', 'analysis'), item('export', 'export', 'export')] }
    const footer: NavGroup = {
      key: 'footer',
      items: [
        item('trash', 'trash', 'trash', store.trashCount ? { badge: store.trashCount, badgeLabel: t('common.nav.trashCount', { n: store.trashCount }, store.trashCount) } : {}),
        item('settings', 'settings', 'settings'),
      ],
    }

    if (store.genre?.layout === 'metroidvania') {
      // The sections the genre leaves out still show while they hold something, so a change of genre hides nothing.
      const rows = store.rows
      const races = rows.groups.filter(g => store.isRace(g.id)).length
      return [
        top,
        {
          key: 'story',
          label: t('common.nav.story'),
          items: [
            item('architecture', 'architecture', 'architecture'),
            item('strands', 'strands', 'strands'),
            item('notes', 'notes', 'notes'),
            ...(store.modules.codex ? [item('codex', 'codex', 'codex')] : []),
          ],
        },
        {
          key: 'bestiary',
          label: t('common.nav.bestiary'),
          items: [
            shelf('characters', 'characters', 'characters', 'characters', ['person']),
            shelf('enemies', 'enemies', 'enemies', 'characters', ['enemy', 'boss']),
            shelf('equipment', 'equipment', 'equipment', 'objects', ['equipment']),
            shelf('abilities', 'abilities', 'abilities', 'objects', ['ability']),
            shelf('collectibles', 'collectibles', 'collectibles', 'objects', ['collectible']),
            ...(rows.objects.some(o => o.category === 'object') ? [shelf('objects', 'objects', 'objects', 'objects', ['object'])] : []),
            ...(races ? [item('races', 'races', 'races')] : []),
            ...(rows.groups.length > races ? [item('groups', 'groups', 'groups')] : []),
            ...(rows.relations.length || store.relationMaps.length ? [item('relations', 'relations', 'relations')] : []),
          ],
        },
        {
          key: 'map',
          label: t('common.nav.map'),
          items: [item('placeMap', 'placeMap', 'map'), item('locations', 'placesSection', 'locations')],
        },
        work,
        review,
        footer,
      ]
    }

    return [
      top,
      { key: 'story', label: t('common.nav.story'), items: [item('architecture', 'architecture', 'architecture'), item('strands', 'strands', 'strands'), item('notes', 'notes', 'notes')] },
      {
        key: 'world',
        label: t('common.nav.world'),
        items: [
          item('characters', 'characters', 'characters'),
          ...(store.modules.races ? [item('races', 'races', 'races')] : []),
          item('groups', 'groups', 'groups'),
          item('locations', 'placesSection', 'locations'),
          item('objects', 'objects', 'objects'),
          item('relations', 'relations', 'relations'),
          ...(store.modules.codex ? [item('codex', 'codex', 'codex')] : []),
        ],
      },
      work,
      review,
      footer,
    ]
  })

  return { groups }
}
