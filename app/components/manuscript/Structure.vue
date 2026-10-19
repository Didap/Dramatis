<script lang="ts">
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { SceneStatus } from '#shared/types/domain'
import type { Chapter, Part, Scene } from '#shared/types/entities'
import { chapterNumberText, placeAt, planStep, roman, type StructureKind, type StructureShape } from './structure-model'

/*
 * The structure of the manuscript (spec 4.5, 7.15, 7.16): parts (acts) when the project uses them,
 * chapters, scenes. Moving items (drag, Alt+Up/Down, "Sposta in..."), creating them with the automatic
 * first part and chapter, renaming, trashing, and the sentences that tell a screen reader where an
 * item went. Shared by the outline and the chapter page, which import these helpers from here.
 * The component itself is the page's live region: <ManuscriptStructure /> reads out the last move.
 */

export type { StructureKind } from './structure-model'
export { roman } from './structure-model'

const COLLECTION = { part: 'parts', chapter: 'chapters', scene: 'scenes' } as const

/** Facts every row of a view needs, computed once per page instead of once per row. */
export interface OutlineContext {
  /** Outgoing choices per scene (module branching). */
  choices: ComputedRef<Map<string, number>>
  /** Scenes the flow cannot reach from the start scene (module branching). */
  unreachable: ComputedRef<Set<string>>
  /** Columns shown in the scene rows, so the numbers line up from row to row. */
  columns: ComputedRef<{ pov: boolean, choices: boolean }>
  /** Show the one-line synopsis under scene titles. */
  showSynopsis: Ref<boolean>
  /** Collapsed parts and chapters (ids). */
  collapsed: Ref<string[]>
  /** Scenes selected for a bulk action (status, move, trash). */
  selected: Ref<string[]>
  /** Ticks or unticks a scene; with `range`, every visible scene from the last one ticked to this one. */
  select: (id: string, options?: { range?: boolean }) => void
  /** Filters are on: dragging is paused, rows outside the filter are hidden. */
  filtering: ComputedRef<boolean>
  /** Whether a scene is shown (it passes the outline filters, it is in the chapter of the page). */
  visible: (scene: Scene) => boolean
  /** The view shows one chapter (the chapter page): one step up or down never takes a scene out of it. */
  singleChapter: boolean
}

export const OUTLINE_CONTEXT: InjectionKey<OutlineContext> = Symbol('manuscript-outline')

/** The outline filters (kept in the query string, so a reload or the back button keeps them). */
export interface OutlineFilters {
  status: string[]
  /** Scene kind (module scene_kinds): every cutscene, every dialogue... */
  kind: string[]
  character: string[]
  location: string[]
  strand: string[]
}

export const FILTER_KEYS = ['status', 'kind', 'character', 'location', 'strand'] as const

export const NO_FILTERS: OutlineFilters = { status: [], kind: [], character: [], location: [], strand: [] }

/** Whether a scene passes the filters: any of the values within a filter, every filter at once. */
export function passes(scene: Scene, filters: OutlineFilters): boolean {
  return (!filters.status.length || filters.status.includes(scene.status))
    && (!filters.kind.length || filters.kind.includes(scene.kind))
    && (!filters.character.length || filters.character.some(id => scene.characterIds.includes(id) || scene.povCharacterId === id))
    && (!filters.location.length || filters.location.some(id => scene.locationIds.includes(id)))
    && (!filters.strand.length || filters.strand.some(id => scene.strandIds.includes(id)))
}

type ContextOptions = Partial<Pick<OutlineContext, 'showSynopsis' | 'collapsed' | 'selected' | 'filtering' | 'visible' | 'singleChapter'>>

/** Creates the facts of a view and makes them available to its rows. */
export function provideOutlineContext(options: ContextOptions = {}) {
  const context = createOutlineContext(options)
  provide(OUTLINE_CONTEXT, context)
  return context
}

/** The facts of the nearest view; a row shown on its own gets a quiet default (no filters, no selection). */
export function useOutlineContext(): OutlineContext {
  return inject(OUTLINE_CONTEXT, null) ?? createOutlineContext()
}

function createOutlineContext(options: ContextOptions = {}): OutlineContext {
  const store = useProjectStore()
  const { analysis } = useFlow()
  const choices = computed(() => {
    const map = new Map<string, number>()
    if (!store.modules.branching) return map
    for (const link of store.rows.links) map.set(link.fromSceneId, (map.get(link.fromSceneId) ?? 0) + 1)
    return map
  })
  const unreachable = computed(() => new Set(analysis.value?.unreachable ?? []))
  const visible = options.visible ?? (() => true)
  // The point of view earns a column when it changes from scene to scene (one narrator says nothing);
  // the choices earn one when a scene of the view has some.
  const columns = computed(() => {
    const shown = store.rows.scenes.filter(visible)
    const povs = new Set(shown.map(s => s.povCharacterId).filter(id => id && store.get('characters', id)))
    return { pov: povs.size > 1, choices: store.modules.branching && shown.some(s => choices.value.has(s.id)) }
  })
  const selected = options.selected ?? ref<string[]>([])
  let anchor: string | null = null
  function select(id: string, { range = false } = {}) {
    const on = !selected.value.includes(id)
    if (range && anchor && anchor !== id) {
      const order = store.orderedScenes.filter(visible).map(s => s.id)
      const from = order.indexOf(anchor)
      const to = order.indexOf(id)
      if (from >= 0 && to >= 0) {
        const span = order.slice(Math.min(from, to), Math.max(from, to) + 1)
        selected.value = on ? [...new Set([...selected.value, ...span])] : selected.value.filter(x => !span.includes(x))
        anchor = id
        return
      }
    }
    selected.value = on ? [...selected.value, id] : selected.value.filter(x => x !== id)
    anchor = id
  }
  const context: OutlineContext = {
    choices,
    unreachable,
    columns,
    showSynopsis: options.showSynopsis ?? ref(false),
    collapsed: options.collapsed ?? ref([]),
    selected,
    select,
    filtering: options.filtering ?? computed(() => false),
    visible,
    singleChapter: options.singleChapter ?? false,
  }
  return context
}

/** The part or chapter or scene being renamed in place, shared by every row of the page. */
export function useRenaming() {
  return useState<string | null>('manuscript:renaming', () => null)
}

/**
 * The item being dragged. A drop between two lists makes both emit a new order; only the list that
 * now holds the dragged item is the destination.
 */
export function useDragging() {
  return useState<{ kind: StructureKind, id: string } | null>('manuscript:dragging', () => null)
}

/** An action of a row menu: a dropdown on desktop, a drawer on phones (DESIGN.md "menus become drawers"). */
export interface RowAction {
  key: string
  label: string
  icon?: string
  color?: 'error'
  kbds?: string[]
  disabled?: boolean
  /** Shown as a ticked option (statuses). */
  checked?: boolean
  /** Colour class of the icon (statuses). */
  iconClass?: string
  onSelect: () => void
}

export interface RowActionGroup {
  key: string
  actions: RowAction[]
  /** On desktop the group is a submenu with this label; on phones a labelled section. */
  submenu?: { label: string, icon?: string }
}

/** Colour of each scene status icon, as literal classes Tailwind can see. */
export const STATUS_TEXT: Record<string, string> = {
  planned: 'text-(--status-planned)',
  draft: 'text-(--status-draft)',
  revised: 'text-(--status-revised)',
  final: 'text-(--status-final)',
}

/** Sortable options shared by the lists of the outline; the handle tells each level apart. */
export function sortableOptions(level: StructureKind, enabled = true) {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return {
    handle: `[data-drag-handle="${level}"]`,
    animation: reduced ? 0 : 150,
    disabled: !enabled,
    ghostClass: 'manuscript-drag-ghost',
    chosenClass: 'manuscript-drag-chosen',
    dragClass: 'manuscript-drag-moving',
    // A long press on the handle starts the drag on touch screens; the page still scrolls.
    delay: 180,
    delayOnTouchOnly: true,
    emptyInsertThreshold: 24,
    scrollSensitivity: 80,
  }
}

/** The sentence read out by the page's live region after a move. */
export function useAnnouncement() {
  return useState('manuscript:live', () => '')
}

// ---------------------------------------------------------------- keyboard focus

/** The visible keyboard stops of the rows, in page order (a row may carry one for phones and one for wide screens). */
function rowStops(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-row]')].filter(el => el.offsetParent !== null)
}

/**
 * Where the keyboard focus goes when rows leave the page (trash, a move to a chapter the page does
 * not show): the row after the first of them, else the one before it, which may be its chapter or
 * part. Read before they go. A part or chapter leaves with everything inside it.
 */
export function neighbourRow(keys: readonly string[]): string | null {
  const leaving = new Set(keys)
  const stops = rowStops()
  const blocks = stops.filter(el => leaving.has(el.dataset.row ?? '')).map(el => el.closest<HTMLElement>('[data-id]') ?? el)
  const first = blocks[0]
  if (!first) return null
  const staying = stops.filter(el => !leaving.has(el.dataset.row ?? '') && !blocks.some(block => block.contains(el)))
  const after = staying.find(el => first.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
  const before = staying.filter(el => first.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING).at(-1)
  return (after ?? before)?.dataset.row ?? null
}

/**
 * Puts the keyboard focus on a row ("scene:<id>") after a change, or on `fallback` when the row is no
 * longer on the page. The row may be re-created, or rendered a moment later (after a navigation).
 */
export function focusRowKey(key: string, fallback?: string | null) {
  let tries = 0
  const attempt = () => {
    const stops = rowStops()
    const row = stops.find(el => el.dataset.row === key) ?? (fallback ? stops.find(el => el.dataset.row === fallback) : undefined)
    if (!row) {
      if (++tries < 30) requestAnimationFrame(attempt)
      return
    }
    row.focus({ preventScroll: true })
    row.scrollIntoView({ block: 'nearest' })
  }
  void nextTick(() => requestAnimationFrame(attempt))
}

export function useManuscriptStructure() {
  const store = useProjectStore()
  const { t, locale } = useI18n()
  const live = useAnnouncement()
  const renaming = useRenaming()
  const context = inject(OUTLINE_CONTEXT, null)

  /** Parts (acts) on: the setting, or by default games yes and novels no. */
  const usesParts = computed(() => store.project?.settings.parts ?? store.isGame)

  // ---------------------------------------------------------------- names and numbers

  const sceneTitle = (scene: Pick<Scene, 'title'> | undefined) => scene?.title.trim() || t('common.untitled.scene')
  const chapterTitle = (chapter: Pick<Chapter, 'title'> | undefined) => chapter?.title.trim() || t('common.untitled.chapter')
  const partTitle = (part: Pick<Part, 'title'> | undefined) => part?.title.trim() || t(`manuscript.untitledPart.${store.kind}`)

  function titleOf(kind: StructureKind, id: string): string {
    if (kind === 'scene') return sceneTitle(store.get('scenes', id))
    if (kind === 'chapter') return chapterTitle(store.get('chapters', id))
    return partTitle(store.get('parts', id))
  }

  /** The default title of the n-th part: "Parte prima", "Atto II". */
  function defaultPartTitle(n: number): string {
    if (store.isGame) return t('manuscript.defaults.gamePart', { n: roman(n) })
    const key = `manuscript.defaults.novelPartOrdinal.${n}`
    return n <= 10 ? t(key) : t('manuscript.defaults.novelPart', { n })
  }

  const partNumber = (id: string) => store.orderedParts.findIndex(p => p.id === id) + 1
  /** Acts are numbered as their default titles are, in Roman numerals ("Atto II"); parts in figures. */
  const partNumeral = (n: number) => (store.isGame ? roman(n) : String(n))
  /** The n-th part in the position line: "Parte 2", "Atto II". */
  const partPosition = (n: number) => t(`manuscript.position.part.${store.kind}`, { n: partNumeral(n) })

  /** The title says no more than the position ("Atto II" second, "Parte prima" first): the position line can go. */
  function partTitleIsPosition(part: Pick<Part, 'title'>, n: number): boolean {
    const title = part.title.trim().toLocaleLowerCase()
    return title === defaultPartTitle(n).toLocaleLowerCase() || title === partPosition(n).toLocaleLowerCase()
  }

  /** A part where it is listed among others: "Atto II · Il mercato", or just "Atto II". */
  function partLabel(part: Part, n = partNumber(part.id)): string {
    return partTitleIsPosition(part, n) ? partTitle(part) : `${partPosition(n)} · ${partTitle(part)}`
  }

  /**
   * The n-th chapter in the position line of the manuscript as it reads (chapter page, reading view),
   * numbered as the project numbers its chapters in exports: "Capitolo 3", "Capitolo III", "Capitolo
   * tre"; '' when chapters carry no number. The outline keeps plain figures, to find one's way.
   */
  function chapterPosition(n: number): string {
    const text = chapterNumberText(n, store.project?.settings.chapterNumbering, locale.value)
    return text ? t('manuscript.position.chapter', { n: text }) : ''
  }

  /** The live part a chapter belongs to, or null (no part, or a part that is gone). */
  function partOf(chapter: Pick<Chapter, 'partId'>): string | null {
    return chapter.partId && store.get('parts', chapter.partId) ? chapter.partId : null
  }

  /** The chapters of a part in order; null gives the chapters outside any part. */
  function chaptersOf(partId: string | null): Chapter[] {
    return store.orderedChapters.filter(c => partOf(c) === partId)
  }

  /** The chapters a chapter is ordered among: its part's, or all of them when parts are off. */
  function chapterSiblings(chapter: Chapter): Chapter[] {
    return usesParts.value ? chaptersOf(partOf(chapter)) : store.orderedChapters
  }

  /** Whether an item comes first among its siblings (its menu then offers to create before it). */
  function isFirst(kind: StructureKind, id: string): boolean {
    if (kind === 'scene') {
      const scene = store.get('scenes', id)
      return !!scene && store.chapterScenes(scene.chapterId)[0]?.id === id
    }
    if (kind === 'chapter') {
      const chapter = store.get('chapters', id)
      return !!chapter && chapterSiblings(chapter)[0]?.id === id
    }
    return store.orderedParts[0]?.id === id
  }

  /**
   * The chapters a scene can go to, grouped by part, for "Sposta in" (searchable). `here` is the
   * chapter it is in now, shown as such and not offered.
   */
  function chapterTargets(pick: (chapterId: string) => void, here?: string | null): CommandPaletteGroup<CommandPaletteItem>[] {
    const item = (c: Chapter): CommandPaletteItem => ({
      id: c.id,
      prefix: String(store.chapterNumber(c.id)),
      label: chapterTitle(c),
      suffix: c.id === here ? t('manuscript.actions.here') : undefined,
      disabled: c.id === here,
      onSelect: () => pick(c.id),
    })
    if (!usesParts.value) return [{ id: 'chapters', items: store.orderedChapters.map(item) }]
    const loose = chaptersOf(null)
    return [
      ...(loose.length ? [{ id: 'loose', label: t(`manuscript.outline.loose.${store.kind}`), items: loose.map(item) }] : []),
      ...store.orderedParts.map((part, index) => ({
        id: part.id,
        label: partLabel(part, index + 1),
        items: chaptersOf(part.id).map(item),
      })),
    ]
  }

  const partScenes = (partId: string) => chaptersOf(partId).flatMap(c => store.chapterScenes(c.id))
  const partWords = (partId: string) => partScenes(partId).reduce((n, s) => n + s.wordCount, 0)

  // ---------------------------------------------------------------- announcements and focus

  function announce(message: string) {
    live.value = ''
    void nextTick(() => { live.value = message })
  }

  /** Opens the chapter and part that now hold an item, so the moved row can be seen and focused. */
  function reveal(kind: StructureKind, id: string) {
    if (!context?.collapsed.value.length) return
    const scene = kind === 'scene' ? store.get('scenes', id) : undefined
    const chapter = kind === 'chapter' ? store.get('chapters', id) : store.get('chapters', scene?.chapterId)
    const containers = [scene?.chapterId, chapter?.partId].filter((x): x is string => !!x)
    if (containers.some(x => context.collapsed.value.includes(x))) {
      context.collapsed.value = context.collapsed.value.filter(x => !containers.includes(x))
    }
  }

  /** Puts the keyboard focus back on a row after it moved; on `fallback` when it left the page. */
  function focusRow(kind: StructureKind, id: string, fallback?: string | null) {
    focusRowKey(`${kind}:${id}`, fallback)
  }

  function announcePosition(kind: StructureKind, id: string) {
    const title = titleOf(kind, id)
    if (kind === 'scene') {
      const scene = store.get('scenes', id)
      if (!scene) return
      const siblings = store.chapterScenes(scene.chapterId)
      announce(t('manuscript.live.moved', { title, n: siblings.findIndex(s => s.id === id) + 1, total: siblings.length, container: chapterTitle(store.get('chapters', scene.chapterId)) }))
    }
    else if (kind === 'chapter') {
      const chapter = store.get('chapters', id)
      if (!chapter) return
      const siblings = chapterSiblings(chapter)
      const n = siblings.findIndex(c => c.id === id) + 1
      const part = partOf(chapter)
      if (usesParts.value && part) announce(t('manuscript.live.moved', { title, n, total: siblings.length, container: partTitle(store.get('parts', part)) }))
      else announce(t('manuscript.live.movedTop', { title, n, total: siblings.length }))
    }
    else {
      announce(t('manuscript.live.movedTop', { title, n: partNumber(id), total: store.orderedParts.length }))
    }
  }

  // ---------------------------------------------------------------- moving

  /** Puts a scene into a chapter at an index (default: at the end). */
  async function moveSceneTo(sceneId: string, chapterId: string, index?: number) {
    const ids = placeAt(store.chapterScenes(chapterId).map(s => s.id), sceneId, index)
    await store.reorder('scenes', ids, { chapterId }).catch(() => {})
  }

  /** Puts a chapter into a part at an index (default: at the end). Parts off: among all chapters. */
  async function moveChapterTo(chapterId: string, partId: string | null, index?: number) {
    const list = usesParts.value ? chaptersOf(partId) : store.orderedChapters
    const ids = placeAt(list.map(c => c.id), chapterId, index)
    await store.reorder('chapters', ids, { partId: usesParts.value ? partId : null }).catch(() => {})
  }

  async function movePartTo(partId: string, index: number) {
    await store.reorder('parts', placeAt(store.orderedParts.map(p => p.id), partId, index)).catch(() => {})
  }

  /** The outline as the planner sees it (structure-model.ts). */
  function shape(): StructureShape {
    return {
      usesParts: usesParts.value,
      parts: store.orderedParts.map(p => p.id),
      chapters: store.orderedChapters.map(c => ({ id: c.id, partId: usesParts.value ? partOf(c) : null })),
      scenesOf: chapterId => store.chapterScenes(chapterId).map(s => s.id),
      chapterOf: sceneId => store.get('scenes', sceneId)?.chapterId,
    }
  }

  /** The move one step up or down would make, or null at the very start or end. */
  function plan(kind: StructureKind, id: string, delta: -1 | 1): (() => Promise<void>) | null {
    // On the chapter page a step never takes a scene away: "Sposta in" does that, on purpose.
    const target = planStep(shape(), kind, id, delta, { crossChapters: !context?.singleChapter })
    if (!target) return null
    if (target.kind === 'scene') return () => moveSceneTo(id, target.chapterId, target.index)
    if (target.kind === 'chapter') return () => moveChapterTo(id, target.partId, target.index)
    return () => movePartTo(id, target.index)
  }

  /**
   * One step up or down (Alt+Up/Down, "Sposta su"). A scene at the edge of its chapter crosses into
   * the chapter before or after; a chapter at the edge of its part crosses into the next part.
   * The change shows at once (the store is optimistic): the focus and the announcement do not wait
   * for the server.
   */
  async function step(kind: StructureKind, id: string, delta: -1 | 1) {
    const move = plan(kind, id, delta)
    if (!move) return announce(t(delta < 0 ? 'manuscript.live.atStart' : 'manuscript.live.atEnd', { title: titleOf(kind, id) }))
    const fallback = neighbourRow([`${kind}:${id}`])
    const done = move()
    reveal(kind, id)
    announcePosition(kind, id)
    focusRow(kind, id, fallback)
    await done
  }

  /** Whether one step up or down is possible (to disable "Sposta su" at the very top). */
  const canStep = (kind: StructureKind, id: string, delta: -1 | 1) => plan(kind, id, delta) !== null

  /** "Sposta in...": a scene to the end of a chapter, a chapter to the end of a part. */
  async function moveInto(kind: 'scene' | 'chapter', id: string, containerId: string) {
    // A scene sent to another chapter leaves the chapter page: the focus goes to its neighbour.
    const fallback = neighbourRow([`${kind}:${id}`])
    const done = kind === 'scene' ? moveSceneTo(id, containerId) : moveChapterTo(id, containerId)
    reveal(kind, id)
    announcePosition(kind, id)
    focusRow(kind, id, fallback)
    await done
  }

  // ---------------------------------------------------------------- creating

  /** The index for a new item next to an anchor (before or after it), or the end. */
  function slot(ids: readonly string[], options: { before?: string, after?: string }): number {
    const anchor = options.before ?? options.after
    const at = anchor ? ids.indexOf(anchor) : -1
    if (at < 0) return ids.length
    return options.before ? at : at + 1
  }

  /** The part new chapters go to: the last one, or "Parte prima" ("Atto I") created on the spot. */
  async function ensurePart(): Promise<string | null> {
    if (!usesParts.value) return null
    const last = store.orderedParts.at(-1)
    if (last) return last.id
    const part = await store.create('parts', { title: defaultPartTitle(1) })
    return part.id
  }

  /** The chapter a new scene goes to: the last one, or "Capitolo 1" created on the spot (spec 5.1). */
  async function ensureChapter(): Promise<string> {
    const last = store.orderedChapters.at(-1)
    if (last) return last.id
    const chapter = await createChapter()
    return chapter.id
  }

  async function createPart(options: { title?: string, after?: string, before?: string } = {}) {
    const order = store.orderedParts.map(p => p.id)
    const index = slot(order, options)
    const part = await store.create('parts', { title: options.title?.trim() || defaultPartTitle(index + 1) })
    if (index < order.length) await movePartTo(part.id, index)
    return part
  }

  async function createChapter(options: { partId?: string | null, title?: string, after?: string, before?: string } = {}) {
    // Next to a chapter: in its part, or with it outside the parts.
    const anchor = store.get('chapters', options.before ?? options.after)
    const partId = usesParts.value ? (anchor ? partOf(anchor) : options.partId ?? await ensurePart()) : null
    const siblings = usesParts.value ? chaptersOf(partId) : store.orderedChapters
    const index = slot(siblings.map(c => c.id), options)
    // The default title carries the number the chapter will have in reading order.
    const previous = siblings[index - 1] ?? (usesParts.value ? chaptersBefore(partId).at(-1) : undefined)
    const number = previous ? store.chapterNumber(previous.id) + 1 : 1
    const chapter = await store.create('chapters', { partId, title: options.title?.trim() || t('manuscript.defaults.chapter', { n: number }) })
    if (index < siblings.length) await moveChapterTo(chapter.id, partId, index)
    return chapter
  }

  /** The chapters that come before a part in reading order. */
  function chaptersBefore(partId: string | null): Chapter[] {
    if (!partId) return []
    const order = store.orderedParts.map(p => p.id)
    const index = order.indexOf(partId)
    return store.orderedChapters.filter((c) => {
      const p = partOf(c)
      return p === null || order.indexOf(p) < index
    })
  }

  async function createScene(options: { chapterId?: string, title?: string, synopsis?: string, after?: string, before?: string } = {}) {
    const anchor = store.get('scenes', options.before ?? options.after)
    const chapterId = anchor?.chapterId ?? options.chapterId ?? await ensureChapter()
    const scene = await store.create('scenes', {
      chapterId,
      title: options.title?.trim() ?? '',
      ...(options.synopsis?.trim() ? { synopsis: options.synopsis.trim().slice(0, 500) } : {}),
    })
    if (anchor) {
      const ids = store.chapterScenes(chapterId).map(s => s.id).filter(id => id !== scene.id)
      ids.splice(slot(ids, options.before ? { before: anchor.id } : { after: anchor.id }), 0, scene.id)
      await store.reorder('scenes', ids, { chapterId }).catch(() => {})
    }
    // In a game, the first scene ever written is where the story starts (spec 5.1).
    if (store.modules.branching && !store.project?.startSceneId && store.rows.scenes.length === 1) {
      await store.updateProject({ startSceneId: scene.id }).catch(() => {})
    }
    return scene
  }

  /**
   * "Inizia a scrivere" on a chapter: the sheet where its text goes. An empty chapter gets its first
   * scene, untitled, so the author never has to know what a scene is to start; otherwise the
   * chapter's last scene, where the writing carries on.
   */
  async function writeIn(chapterId: string) {
    const last = store.chapterScenes(chapterId).at(-1)
    const scene = last ?? await createScene({ chapterId }).catch(() => null)
    if (scene) await navigateTo(store.refPath({ type: 'scene', id: scene.id }))
  }

  // ---------------------------------------------------------------- editing

  async function rename(kind: StructureKind, id: string, title: string) {
    const current = store.get(COLLECTION[kind], id)
    if (!current || current.title === title.trim()) return
    await store.update(COLLECTION[kind], id, { title: title.trim() }).catch(() => {})
  }

  async function setStatus(sceneId: string, status: SceneStatus) {
    const scene = store.get('scenes', sceneId)
    if (!scene || scene.status === status) return
    await store.update('scenes', sceneId, { status }).catch(() => {})
  }

  /**
   * To the trash, with what belongs to it (a chapter's scenes, a part's chapters); the toast can undo.
   * The keyboard focus moves to the next row, so it is not lost with the row.
   */
  async function trash(kind: StructureKind, id: string) {
    if (renaming.value === id) renaming.value = null
    const fallback = neighbourRow([`${kind}:${id}`])
    const done = store.remove(COLLECTION[kind], id).catch(() => {})
    focusRow(kind, id, fallback)
    await done
  }

  /** A copy of a scene right after it, with its text (dialogue lines get new ids); starts in rename. */
  async function duplicateScene(id: string) {
    const original = store.get('scenes', id)
    if (!original) return null
    try {
      const copy = await $fetch<Scene>(`/api/projects/${store.projectId}/manuscript/duplicate`, { method: 'POST', body: { sceneId: id } })
      for (const sibling of store.chapterScenes(original.chapterId)) {
        if (sibling.position > original.position) store.patchLocal('scenes', sibling.id, { position: sibling.position + 1 })
      }
      store.upsertLocal('scenes', copy)
      useToast().add({ title: t('manuscript.scene.duplicated', { title: sceneTitle(copy) }), icon: 'i-lucide-copy' })
      return copy
    }
    catch (error) {
      notifyError(error)
      return null
    }
  }

  // ---------------------------------------------------------------- several scenes at once

  /** The scenes in reading order, whatever order they were picked in. */
  const inReadingOrder = (ids: readonly string[]) => {
    const wanted = new Set(ids)
    return store.orderedScenes.filter(s => wanted.has(s.id)).map(s => s.id)
  }

  /** Moves scenes to the end of a chapter, keeping their reading order, in one request. */
  async function moveScenesInto(ids: readonly string[], chapterId: string) {
    const moving = inReadingOrder(ids)
    if (!moving.length) return
    const staying = store.chapterScenes(chapterId).map(s => s.id).filter(id => !moving.includes(id))
    const done = store.reorder('scenes', [...staying, ...moving], { chapterId }).catch(() => {})
    // The chapter that now holds them opens, so they stay in sight with their ticks.
    reveal('scene', moving[0]!)
    announce(t('manuscript.live.movedMany', { n: moving.length, container: chapterTitle(store.get('chapters', chapterId)) }, moving.length))
    await done
  }

  async function setStatusMany(ids: readonly string[], status: SceneStatus) {
    await Promise.all(ids.map(id => setStatus(id, status)))
    announce(t('manuscript.live.statusMany', { n: ids.length, status: t(`common.enums.sceneStatus.${status}`) }, ids.length))
  }

  /** Several scenes to the trash; one toast brings them all back. */
  async function trashMany(ids: readonly string[]) {
    const gone: string[] = []
    await Promise.all(ids.map(id => store.remove('scenes', id, { undo: false }).then(() => { gone.push(id) }).catch(() => {})))
    if (!gone.length) return
    useToast().add({
      title: t('common.trash.moved'),
      icon: 'i-lucide-trash-2',
      actions: [{
        label: t('common.actions.undo'),
        onClick: async () => {
          await Promise.all(gone.map(id => $fetch(`/api/projects/${store.projectId}/trash/restore`, { method: 'POST', body: { collection: 'scenes', id } }).catch(notifyError)))
          await store.reload()
        },
      }],
    })
  }

  return {
    usesParts,
    sceneTitle,
    chapterTitle,
    partTitle,
    titleOf,
    defaultPartTitle,
    partNumber,
    partNumeral,
    partPosition,
    partTitleIsPosition,
    partLabel,
    chapterPosition,
    partOf,
    chaptersOf,
    chapterSiblings,
    isFirst,
    chapterTargets,
    partScenes,
    partWords,
    announce,
    focusRow,
    moveSceneTo,
    moveChapterTo,
    movePartTo,
    step,
    canStep,
    moveInto,
    ensureChapter,
    createPart,
    createChapter,
    createScene,
    writeIn,
    rename,
    setStatus,
    trash,
    duplicateScene,
    moveScenesInto,
    setStatusMany,
    trashMany,
  }
}

export type ManuscriptStructure = ReturnType<typeof useManuscriptStructure>
</script>

<script setup lang="ts">
const live = useAnnouncement()
</script>

<template>
  <p class="sr-only" role="status" aria-live="polite">{{ live }}</p>
</template>
