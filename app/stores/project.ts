import { defineStore } from 'pinia'
import type { Collection, EntityRef, RefType, WorldRefType } from '#shared/types/domain'
import { COLLECTIONS, COLLECTION_TO_REF, LONG_TEXT_FIELDS, REF_TO_COLLECTION, WORLD_REF_TYPES } from '#shared/utils/constants'
import { resolveModules } from '#shared/utils/modules'
import { parseMentionId } from '#shared/utils/richtext'
import type {
  Chapter,
  CollectionMap,
  CreateInput,
  Project,
  ProjectBundle,
  Scene,
  UpdateInput,
  WorldEntity,
} from '#shared/types/entities'

type Rows = { [C in Collection]: CollectionMap[C][] }

interface DeleteResult {
  id: string
  trashed: boolean
  deletedAt?: string
  /** What left together with the item (the trash batch). */
  cascade: Partial<Record<Collection, string[]>>
}

/** Items the server could not save because a newer version existed: kept as notes. */
interface ConflictNote {
  field: string
  note: CollectionMap['notes']
}

const emptyRows = (): Rows => ({
  characters: [],
  groups: [],
  locations: [],
  objects: [],
  images: [],
  strands: [],
  parts: [],
  chapters: [],
  scenes: [],
  links: [],
  variables: [],
  relations: [],
  maps: [],
  events: [],
  notes: [],
  codexCategories: [],
  codexEntries: [],
})

const byPosition = (a: { position?: number, createdAt: string }, b: { position?: number, createdAt: string }) =>
  (a.position ?? 0) - (b.position ?? 0) || a.createdAt.localeCompare(b.createdAt)

/**
 * The open project, loaded once as a bundle and kept in memory.
 * Every mutation is optimistic: the change shows at once, the server confirms it,
 * and a failure rolls it back with a toast. Scene text is not here (see useSceneContent).
 */
export const useProjectStore = defineStore('project', () => {
  const project = ref<Project | null>(null)
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const loadError = ref<unknown>(null)
  const rows = reactive<Rows>(emptyRows())
  /** Mutations in flight, for the save indicator. */
  const pending = ref(0)
  /** Changes waiting for their debounce to reach the server. */
  const queued = ref(0)
  const lastSavedAt = ref<string | null>(null)
  const failed = ref(false)
  /** The last failure was refused by the server (not retried): the save state must not say "retrying". */
  const refused = ref(false)
  /** Items in the trash, for the sidebar badge (approximate between reloads). */
  const trashCount = ref(0)

  const projectId = computed(() => project.value?.id ?? '')
  const kind = computed(() => project.value?.kind ?? 'novel')
  const modules = computed(() => resolveModules(kind.value, project.value?.modules))
  const isGame = computed(() => kind.value === 'game')
  const saving = computed(() => pending.value > 0 || queued.value > 0)

  // ---------------------------------------------------------------- loading

  async function load(id: string, options: { force?: boolean } = {}) {
    if (!options.force && project.value?.id === id && status.value === 'ready') return
    if (project.value?.id !== id) {
      status.value = 'loading'
      project.value = null
      Object.assign(rows, emptyRows())
    }
    loadError.value = null
    try {
      const bundle = await $fetch<ProjectBundle>(`/api/projects/${id}`)
      apply(bundle)
      status.value = 'ready'
      resumePending()
    }
    catch (error) {
      loadError.value = error
      status.value = 'error'
    }
  }

  function apply(bundle: ProjectBundle) {
    project.value = bundle.project
    trashCount.value = bundle.trashCount ?? 0
    for (const collection of COLLECTIONS) {
      ;(rows[collection] as unknown[]) = [...(bundle[collection] as unknown[])]
    }
  }

  async function reload() {
    if (project.value) await load(project.value.id, { force: true })
  }

  function reset() {
    project.value = null
    status.value = 'idle'
    Object.assign(rows, emptyRows())
  }

  // ---------------------------------------------------------------- lookups

  const index = computed(() => {
    const maps = {} as { [C in Collection]: Map<string, CollectionMap[C]> }
    for (const collection of COLLECTIONS) {
      ;(maps as Record<string, Map<string, unknown>>)[collection] = new Map(rows[collection].map(row => [row.id, row]))
    }
    return maps
  })

  function get<C extends Collection>(collection: C, id: string | null | undefined): CollectionMap[C] | undefined {
    if (!id) return undefined
    return index.value[collection].get(id) as CollectionMap[C] | undefined
  }

  function getRef(ref: EntityRef | null | undefined) {
    if (!ref) return undefined
    const collection = REF_TO_COLLECTION[ref.type]
    return collection ? get(collection, ref.id) : undefined
  }

  /** Display name of any referenced item ('' when it no longer exists). */
  function refLabel(ref: EntityRef | null | undefined): string {
    const item = getRef(ref) as { name?: string, title?: string } | undefined
    return item?.name ?? item?.title ?? ''
  }

  /** A group that is a race of the world, with its own page (module races). */
  function isRace(groupId: string | null | undefined): boolean {
    return modules.value.races && get('groups', groupId)?.kind === 'race'
  }

  /** "<type>:<id>" of an entity that can be a node of a relationship map: races are not (they show on the character sheet). */
  function mappable(key: string): boolean {
    const ref = parseMentionId(key)
    return !!ref && (WORLD_REF_TYPES as readonly string[]).includes(ref.type) && !(ref.type === 'group' && isRace(ref.id))
  }

  /** Route of the page that shows an item. */
  function refPath(ref: EntityRef): string {
    const base = `/p/${projectId.value}`
    switch (ref.type) {
      case 'character': return `${base}/characters/${ref.id}`
      case 'group': return isRace(ref.id) ? `${base}/races/${ref.id}` : `${base}/groups/${ref.id}`
      case 'location': return `${base}/locations/${ref.id}`
      case 'object': return `${base}/objects/${ref.id}`
      case 'strand': return `${base}/strands/${ref.id}`
      case 'chapter': return `${base}/manuscript/chapters/${ref.id}`
      case 'scene': return `${base}/manuscript/scenes/${ref.id}`
      case 'event': return `${base}/timeline?event=${ref.id}`
      case 'note': return `${base}/notes/${ref.id}`
      case 'codex': return `${base}/codex/${ref.id}`
    }
    return base
  }

  /** Images by owner ("character:<id>"), in order: the first is the primary image. */
  const imagesByOwner = computed(() => {
    const map = new Map<string, CollectionMap['images'][]>()
    for (const image of [...rows.images].sort(byPosition)) {
      const key = `${image.ownerType}:${image.ownerId}`
      const list = map.get(key)
      if (list) list.push(image)
      else map.set(key, [image])
    }
    return map
  })

  function imagesOf(type: string, id: string) {
    return imagesByOwner.value.get(`${type}:${id}`) ?? []
  }

  /** Media id of an entity's primary image, or null. */
  function primaryImage(type: string, id: string): string | null {
    return imagesOf(type, id)[0]?.mediaId ?? null
  }

  /** Characters, groups, locations and objects, for pickers, mentions and the mind map. */
  const worldEntities = computed<WorldEntity[]>(() => [
    ...rows.characters.map(c => ({ type: 'character' as const, id: c.id, name: c.name, color: c.color as WorldEntity['color'], imageId: primaryImage('character', c.id) })),
    ...rows.groups.map(g => ({ type: 'group' as const, id: g.id, name: g.name, color: g.color as WorldEntity['color'], imageId: primaryImage('group', g.id) })),
    ...rows.locations.map(l => ({ type: 'location' as const, id: l.id, name: l.name, color: l.color as WorldEntity['color'], imageId: primaryImage('location', l.id) })),
    ...rows.objects.map(o => ({ type: 'object' as const, id: o.id, name: o.name, color: o.color as WorldEntity['color'], imageId: primaryImage('object', o.id) })),
  ])

  function worldEntitiesOf(type: WorldRefType) {
    return worldEntities.value.filter(e => e.type === type)
  }

  // ---------------------------------------------------------------- manuscript order

  const orderedParts = computed(() => [...rows.parts].sort(byPosition))

  /** Chapters in reading order: those outside any part first, then part by part. */
  const orderedChapters = computed<Chapter[]>(() => {
    const partOrder = new Map(orderedParts.value.map((p, i) => [p.id, i]))
    return [...rows.chapters].sort((a, b) => {
      const pa = a.partId ? (partOrder.get(a.partId) ?? -1) : -1
      const pb = b.partId ? (partOrder.get(b.partId) ?? -1) : -1
      return pa - pb || byPosition(a, b)
    })
  })

  const scenesByChapter = computed(() => {
    const map = new Map<string, Scene[]>()
    for (const scene of rows.scenes) {
      const list = map.get(scene.chapterId)
      if (list) list.push(scene)
      else map.set(scene.chapterId, [scene])
    }
    for (const list of map.values()) list.sort(byPosition)
    return map
  })

  /** Every scene in reading order. */
  const orderedScenes = computed<Scene[]>(() =>
    orderedChapters.value.flatMap(chapter => scenesByChapter.value.get(chapter.id) ?? []),
  )

  function chapterScenes(chapterId: string): Scene[] {
    return scenesByChapter.value.get(chapterId) ?? []
  }

  /** 1-based number of a chapter in reading order (0 if unknown). */
  function chapterNumber(chapterId: string): number {
    return orderedChapters.value.findIndex(c => c.id === chapterId) + 1
  }

  function chapterWords(chapterId: string): number {
    return chapterScenes(chapterId).reduce((n, s) => n + s.wordCount, 0)
  }

  const totalWords = computed(() => rows.scenes.reduce((n, s) => n + s.wordCount, 0))

  // ---------------------------------------------------------------- mutations

  // Captured once: after an await the component context is gone (toasts, i18n, navigation).
  const nuxtApp = useNuxtApp()
  const toast = useToast()
  const tr = (key: string, named?: Record<string, unknown>) => nuxtApp.$i18n.t(key, named ?? {})

  const versions = new Map<string, number>()
  const bump = (key: string) => {
    const v = (versions.get(key) ?? 0) + 1
    versions.set(key, v)
    return v
  }

  function base() {
    if (!project.value) throw new Error('No project loaded')
    return `/api/projects/${project.value.id}`
  }

  function sort(collection: Collection) {
    const list = rows[collection] as { position?: number, createdAt: string }[]
    if (list.length && 'position' in list[0]!) list.sort(byPosition)
  }

  /** Fields the server merges instead of replacing; the store mirrors that (character profile and traits). */
  const DEEP: Partial<Record<Collection, readonly string[]>> = { characters: ['profile', 'traits'] }

  type Loose = Record<string, any>

  function mergeProfile(before: Loose | undefined, change: Loose | undefined): Loose {
    const merged: Loose = { ...before }
    for (const [section, value] of Object.entries(change ?? {})) {
      const prev = merged[section] ?? {}
      merged[section] = { ...prev, ...value, answers: { ...prev.answers, ...value?.answers } }
    }
    return merged
  }

  /** Two patches of the same item as one, with the deep fields merged. */
  function mergePatches(collection: Collection, first: Loose, second: Loose): Loose {
    const merged: Loose = { ...first, ...second }
    for (const field of DEEP[collection] ?? []) {
      if (first[field] && second[field]) {
        merged[field] = field === 'profile' ? mergeProfile(first[field], second[field]) : { ...first[field], ...second[field] }
      }
    }
    return merged
  }

  /** Applies a patch to the local item, merging deep fields as the server does. */
  function applyLocal(collection: Collection, target: Loose, patch: Loose) {
    for (const [field, value] of Object.entries(patch)) {
      if ((DEEP[collection] ?? []).includes(field) && value && typeof value === 'object') {
        target[field] = field === 'profile' ? mergeProfile(target[field], value) : { ...target[field], ...value }
      }
      else {
        target[field] = value
      }
    }
  }

  /**
   * The versions a patch of long text fields is based on (spec 5.11): the server keeps a newer text
   * instead of overwriting it, and answers with a conflict note.
   */
  function baseOf(scope: Collection | 'project', current: { versions?: Record<string, number> } | null | undefined, patch: Loose) {
    const fields = LONG_TEXT_FIELDS[scope].filter(f => f in patch)
    const basis: Record<string, number> = {}
    for (const field of fields) basis[field] = current?.versions?.[field] ?? 0
    if (scope === 'characters' && patch.profile && typeof patch.profile === 'object') {
      for (const [section, value] of Object.entries(patch.profile as Record<string, { free?: unknown }>)) {
        if (value && 'free' in value) basis[`profile.${section}`] = current?.versions?.[`profile.${section}`] ?? 0
      }
    }
    return basis
  }

  /**
   * After a save of long texts succeeded, text queued meanwhile continues the saved text: its base
   * versions move to the new ones, so it does not come back as a false conflict.
   */
  function advanceQueuedBase(key: string, sent: Record<string, number>, saved: Record<string, number> | undefined) {
    if (!saved) return
    const queued = key === 'project' ? projectTimer.base : timers.get(key)?.base
    if (!queued) return
    for (const field of Object.keys(sent)) {
      if (field in queued && saved[field] !== undefined) queued[field] = saved[field]
    }
  }

  /** Shows conflict notes returned by the server and adds them to the notes. */
  function handleConflicts(response: { $conflicts?: ConflictNote[] } | null | undefined) {
    const conflicts = response?.$conflicts
    if (!conflicts?.length) return
    for (const conflict of conflicts) {
      upsertLocal('notes', conflict.note)
      toast.add({
        title: tr('common.conflict.title'),
        description: tr('common.conflict.longText', { note: conflict.note.title }),
        color: 'warning',
        icon: 'i-lucide-git-fork',
        duration: 0,
        actions: [{ label: tr('common.conflict.openNote'), onClick: () => { void nuxtApp.runWithContext(() => navigateTo(refPath({ type: 'note', id: conflict.note.id }))) } }],
      })
    }
    delete response!.$conflicts
  }

  /**
   * Applies a row from the server without undoing what the author is still typing: fields with a
   * change waiting in patchSoon (or updateProjectSoon) keep their local value.
   */
  function mergeServer(target: Loose, row: Loose, key: string) {
    const waiting = key === 'project'
      ? new Set(Object.keys(projectTimer.patch))
      : new Set(Object.keys(timers.get(key)?.patch ?? {}))
    for (const [field, value] of Object.entries(row)) {
      if (field === '$conflicts' || waiting.has(field)) continue
      // The server trims text: "San " coming back as "San" is the same value, keep the local one.
      if (typeof value === 'string' && typeof target[field] === 'string' && target[field] !== value && target[field].trim() === value) continue
      target[field] = value
    }
  }

  function report(error: unknown) {
    notifyError(error, { toast, nuxtApp })
  }

  function markSaved() {
    lastSavedAt.value = new Date().toISOString()
    failed.value = false
    refused.value = false
  }

  async function track<T>(work: () => Promise<T>): Promise<T> {
    pending.value++
    try {
      const result = await work()
      markSaved()
      return result
    }
    catch (error) {
      failed.value = true
      refused.value = !retryable(error)
      report(error)
      throw error
    }
    finally {
      pending.value--
    }
  }

  /** Network trouble and server overload are worth retrying; a refused change is not. */
  const retryable = (error: unknown) => {
    const status = errorStatus(error)
    return status === 0 || status === 408 || status === 429 || status >= 500
  }
  const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt)

  async function create<C extends Collection>(collection: C, data: CreateInput<C>): Promise<CollectionMap[C]> {
    const url = `${base()}/${collection}`
    return track(async () => {
      const row = await $fetch<CollectionMap[C]>(url, { method: 'POST', body: data })
      ;(rows[collection] as CollectionMap[C][]).push(row)
      sort(collection)
      touch()
      return row
    })
  }

  async function update<C extends Collection>(collection: C, id: string, patch: UpdateInput<C>): Promise<CollectionMap[C] | undefined> {
    const current = get(collection, id)
    if (!current) return undefined
    const key = `${collection}:${id}`
    const superseded = supersedeQueued(key, collection, patch as Loose)
    const snapshot = JSON.parse(JSON.stringify(current)) as CollectionMap[C]
    const basis = baseOf(collection, snapshot as Loose, patch as Loose)
    applyLocal(collection, current as Loose, patch as Loose)
    // What this change set, to undo exactly that (and nothing typed since) if the save fails.
    const optimistic = Object.fromEntries(Object.keys(patch).map(k => [k, JSON.stringify((current as Loose)[k])]))
    if ('position' in patch || 'chapterId' in patch || 'partId' in patch || 'importance' in patch) sort(collection)
    const version = bump(key)
    const url = `${base()}/${collection}/${id}`
    const body = { ...patch, ...(Object.keys(basis).length ? { $base: basis } : {}) }
    try {
      return await track(async () => {
        const row = await $fetch<CollectionMap[C] & { $conflicts?: ConflictNote[] }>(url, { method: 'PATCH', body })
        handleConflicts(row)
        advanceQueuedBase(key, basis, (row as Loose).versions)
        // A newer local change wins over an older answer.
        if (versions.get(key) === version) mergeServer(current as Loose, row as Loose, key)
        else if ('versions' in row) Object.assign(current, { versions: row.versions })
        touch()
        return current
      })
    }
    catch (error) {
      rollback(current as Loose, snapshot as Loose, optimistic, new Set(Object.keys(timers.get(key)?.patch ?? {})))
      sort(collection)
      // The typing this change replaced is on screen again: queue it once more.
      if (Object.keys(superseded).length) patchSoon(collection, id, superseded as UpdateInput<C>)
      throw error
    }
  }

  /**
   * Undoes a failed change field by field: only the fields it set, only where they still hold the
   * value it set, never a field with newer typing waiting to be sent.
   */
  function rollback(target: Loose, before: Loose, optimistic: Record<string, string>, waiting: Set<string>) {
    for (const [field, value] of Object.entries(optimistic)) {
      if (waiting.has(field)) continue
      if (JSON.stringify(target[field]) === value) target[field] = before[field]
    }
  }

  interface Queued {
    timer: ReturnType<typeof setTimeout>
    collection: Collection
    id: string
    patch: Loose
    /** Base versions of the long texts in the patch, from before the first unsent change. */
    base: Record<string, number>
    attempt: number
  }
  const timers = new Map<string, Queued>()

  /**
   * Applies a change at once and sends it after a pause (typing in a field). Several changes to the
   * same item are merged into one request; a failed request is kept and retried with backoff.
   */
  function patchSoon<C extends Collection>(collection: C, id: string, patch: UpdateInput<C>, delay = 700) {
    const current = get(collection, id)
    if (!current) return
    const before = baseOf(collection, current as Loose, patch as Loose)
    applyLocal(collection, current as Loose, patch as Loose)
    const key = `${collection}:${id}`
    const entry = timers.get(key)
    if (entry) clearTimeout(entry.timer)
    else queued.value++
    timers.set(key, {
      collection,
      id,
      patch: entry ? mergePatches(collection, entry.patch, patch as Loose) : { ...(patch as Loose) },
      // The oldest base wins: it is the version the first unsent change was made on.
      base: { ...before, ...(entry?.base ?? {}) },
      attempt: entry?.attempt ?? 0,
      timer: setTimeout(() => flushOne(key), delay),
    })
    rememberPending(key)
  }

  /**
   * A change sent at once (a menu choice) replaces the same fields still waiting in the queue: sent
   * later, the older typed value would overwrite it. Deep fields stay queued, merged with the change.
   */
  function supersedeQueued(key: string, collection: Collection, patch: Loose): Loose {
    const entry = timers.get(key)
    const removed: Loose = {}
    if (!entry) return removed
    for (const field of Object.keys(patch)) {
      if ((DEEP[collection] ?? []).includes(field)) {
        entry.patch = mergePatches(collection, entry.patch, { [field]: patch[field] })
        continue
      }
      if (field in entry.patch) removed[field] = entry.patch[field]
      delete entry.patch[field]
      delete entry.base[field]
    }
    if (Object.keys(entry.patch).length) {
      rememberPending(key)
      return removed
    }
    clearTimeout(entry.timer)
    timers.delete(key)
    queued.value--
    forgetPending(key)
    return removed
  }

  /** Saves in flight per item: one at a time, so a queued change always goes out with the newest version. */
  const inFlight = new Map<string, Promise<void>>()

  async function flushOne(key: string): Promise<void> {
    const running = inFlight.get(key)
    if (running) {
      await running
      return flushOne(key)
    }
    const entry = timers.get(key)
    if (!entry) return
    clearTimeout(entry.timer)
    timers.delete(key)
    queued.value--
    const work = sendQueued(key, entry)
    inFlight.set(key, work)
    try {
      await work
    }
    finally {
      inFlight.delete(key)
    }
  }

  async function sendQueued(key: string, entry: Queued) {
    const url = `${base()}/${entry.collection}/${entry.id}`
    const version = bump(key)
    pending.value++
    try {
      const row = await $fetch<Loose & { $conflicts?: ConflictNote[] }>(url, {
        method: 'PATCH',
        body: { ...entry.patch, ...(Object.keys(entry.base).length ? { $base: entry.base } : {}) },
      })
      // A field in conflict kept the other device's text: what is queued must not overwrite it silently.
      const conflicted = new Set((row.$conflicts ?? []).map(c => c.field))
      handleConflicts(row)
      advanceQueuedBase(key, Object.fromEntries(Object.entries(entry.base).filter(([field]) => !conflicted.has(field))), row.versions)
      const current = get(entry.collection, entry.id)
      if (current && versions.get(key) === version) mergeServer(current as Loose, row, key)
      else if (current && 'versions' in row) Object.assign(current, { versions: row.versions })
      forgetPending(key)
      markSaved()
      touch()
    }
    catch (error) {
      failed.value = true
      if (!retryable(error)) {
        refused.value = true
        forgetPending(key)
        report(error)
        return
      }
      if (entry.attempt === 0) report(error)
      // Keep the change: merged under anything typed since, and retried later.
      const newer = timers.get(key)
      if (newer) clearTimeout(newer.timer)
      else queued.value++
      const attempt = entry.attempt + 1
      timers.set(key, {
        ...entry,
        patch: newer ? mergePatches(entry.collection, entry.patch, newer.patch) : entry.patch,
        base: { ...(newer?.base ?? {}), ...entry.base },
        attempt,
        timer: setTimeout(() => flushOne(key), backoff(attempt)),
      })
      rememberPending(key)
    }
    finally {
      pending.value--
    }
  }

  // ---------------------------------------------------------------- a local copy of unsent changes (spec 5.11.2)

  const PENDING_PREFIX = 'dramatis:pending:'
  const pendingKey = (key: string) => `${PENDING_PREFIX}${projectId.value}:${key}`

  /** Writes the queued change of an item to the browser, until the server confirms it. */
  function rememberPending(key: string) {
    const entry = timers.get(key)
    if (!entry || !project.value) return
    try {
      localStorage.setItem(pendingKey(key), JSON.stringify({ collection: entry.collection, id: entry.id, patch: entry.patch, base: entry.base, at: Date.now() }))
    }
    catch {}
  }

  function forgetPending(key: string) {
    if (timers.has(key)) {
      // Something newer is queued: keep its copy.
      rememberPending(key)
      return
    }
    try {
      localStorage.removeItem(pendingKey(key))
    }
    catch {}
  }

  /** After a reload: re-applies and re-sends changes that never reached the server (offline, closed tab). */
  function resumePending() {
    if (!project.value) return
    const prefix = `${PENDING_PREFIX}${project.value.id}:`
    let keys: string[] = []
    try {
      keys = Object.keys(localStorage).filter(k => k.startsWith(prefix))
    }
    catch {
      return
    }
    for (const storageKey of keys) {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as { collection: Collection, id: string, patch: Loose, base: Record<string, number> } | null
        if (!saved || !get(saved.collection, saved.id)) {
          localStorage.removeItem(storageKey)
          continue
        }
        const key = `${saved.collection}:${saved.id}`
        applyLocal(saved.collection, get(saved.collection, saved.id) as Loose, saved.patch)
        queued.value++
        timers.set(key, { collection: saved.collection, id: saved.id, patch: saved.patch, base: saved.base, attempt: 0, timer: setTimeout(() => flushOne(key), 300) })
      }
      catch {}
    }
  }

  /** Sends every queued change now (before leaving a page, before export, "Riprova"...). */
  async function flush() {
    await Promise.all([...timers.keys()].map(flushOne))
  }

  async function remove(collection: Collection, id: string, options: { undo?: boolean } = {}) {
    // Typing still waiting for this item goes in first: it then travels to the trash with it (and back on undo).
    if (timers.has(`${collection}:${id}`)) await flushOne(`${collection}:${id}`)
    const list = rows[collection] as { id: string }[]
    const position = list.findIndex(r => r.id === id)
    if (position < 0) return
    const [removed] = list.splice(position, 1)
    const url = `${base()}/${collection}/${id}`
    try {
      const result = await track(() => $fetch<DeleteResult>(url, { method: 'DELETE' }))
      for (const [key, ids] of Object.entries(result.cascade ?? {})) {
        if (ids?.length) removeLocal(key as Collection, ids)
      }
      const goneScenes = new Set([...(collection === 'scenes' ? [id] : []), ...(result.cascade?.scenes ?? [])])
      // Choices leaving a trashed scene go with it; choices pointing to it stay, and the flow checks report them.
      if (goneScenes.size) rows.links = rows.links.filter(l => !goneScenes.has(l.fromSceneId))
      // The relationships of a trashed entity are only hidden (they come back on restore, which reloads).
      const ref = refTypeOf(collection)
      if (ref === 'character' || ref === 'group' || ref === 'location' || ref === 'object') {
        rows.relations = rows.relations.filter(r => !(r.sourceType === ref && r.sourceId === id) && !(r.targetType === ref && r.targetId === id))
      }
      if (result.trashed) trashCount.value += 1 + Object.values(result.cascade ?? {}).reduce((n, ids) => n + (ids?.length ?? 0), 0)
      touch()
      if (result.trashed && options.undo !== false) {
        toast.add({
          title: tr('common.trash.moved'),
          icon: 'i-lucide-trash-2',
          actions: [{ label: tr('common.actions.undo'), onClick: () => { void restore(collection, id) } }],
        })
      }
      return result
    }
    catch (error) {
      list.splice(position, 0, removed!)
      throw error
    }
  }

  /** Brings an item back from the trash and reloads the project (restores may bring back children). */
  async function restore(collection: Collection, id: string) {
    await track(() => $fetch<{ ok: boolean }>(`${base()}/trash/restore` as string, { method: 'POST', body: { collection, id } }))
    await reload()
  }

  /**
   * Sets a new order of siblings. For chapters pass partId to move them into a part (null = no part);
   * for scenes pass chapterId to move them into a chapter.
   */
  async function reorder(collection: Collection, ids: string[], extra: { partId?: string | null, chapterId?: string } = {}) {
    const snapshot = (rows[collection] as { id: string, position?: number, partId?: string | null, chapterId?: string }[]).map(r => ({ ...r }))
    ids.forEach((id, i) => {
      const row = get(collection, id) as { position?: number, partId?: string | null, chapterId?: string } | undefined
      if (!row) return
      row.position = i
      if (collection === 'chapters' && extra.partId !== undefined) row.partId = extra.partId
      if (collection === 'scenes' && extra.chapterId) row.chapterId = extra.chapterId
    })
    sort(collection)
    try {
      await track(() => $fetch<{ ok: boolean }>(`${base()}/reorder` as string, { method: 'POST', body: { collection, ids, ...extra } }))
      touch()
    }
    catch (error) {
      ;(rows[collection] as unknown[]) = snapshot
      throw error
    }
  }

  async function updateProject(patch: Partial<Omit<Project, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>) {
    if (!project.value) return
    // Fields sent now replace the same fields still waiting to be sent (see supersedeQueued).
    for (const field of Object.keys(patch)) {
      delete projectTimer.patch[field]
      delete projectTimer.base[field]
    }
    if (projectTimer.timer && !Object.keys(projectTimer.patch).length) {
      clearTimeout(projectTimer.timer)
      projectTimer.timer = null
      queued.value--
    }
    const snapshot = JSON.parse(JSON.stringify(project.value)) as Project
    const basis = baseOf('project', snapshot, patch as Loose)
    const body = { ...patch, ...(Object.keys(basis).length ? { $base: basis } : {}) }
    Object.assign(project.value, patch)
    const optimistic = Object.fromEntries(Object.keys(patch).map(k => [k, JSON.stringify((project.value as unknown as Loose)[k])]))
    const version = bump('project')
    try {
      await track(async () => {
        const row = await $fetch<Project & { $conflicts?: ConflictNote[] }>(base(), { method: 'PATCH', body })
        handleConflicts(row)
        advanceQueuedBase('project', basis, row.versions)
        if (versions.get('project') === version && project.value) mergeServer(project.value as unknown as Loose, row as unknown as Loose, 'project')
      })
    }
    catch (error) {
      if (project.value) rollback(project.value as unknown as Loose, snapshot as unknown as Loose, optimistic, new Set(Object.keys(projectTimer.patch)))
      throw error
    }
  }

  const projectTimer = { timer: null as ReturnType<typeof setTimeout> | null, patch: {} as Loose, base: {} as Record<string, number>, attempt: 0 }

  /** Like patchSoon, for the project's own fields (premise, goals, settings...). */
  function updateProjectSoon(patch: Partial<Omit<Project, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>, delay = 700) {
    if (!project.value) return
    const before = baseOf('project', project.value, patch as Loose)
    Object.assign(project.value, patch)
    if (projectTimer.timer) clearTimeout(projectTimer.timer)
    else queued.value++
    projectTimer.patch = { ...projectTimer.patch, ...patch }
    projectTimer.base = { ...before, ...projectTimer.base }
    projectTimer.timer = setTimeout(flushProject, delay)
  }

  async function flushProject() {
    if (!projectTimer.timer) return
    clearTimeout(projectTimer.timer)
    projectTimer.timer = null
    queued.value--
    const patch = projectTimer.patch
    const basis = projectTimer.base
    const attempt = projectTimer.attempt
    projectTimer.patch = {}
    projectTimer.base = {}
    projectTimer.attempt = 0
    const version = bump('project')
    pending.value++
    try {
      const row = await $fetch<Project & { $conflicts?: ConflictNote[] }>(base(), { method: 'PATCH', body: { ...patch, ...(Object.keys(basis).length ? { $base: basis } : {}) } })
      handleConflicts(row)
      advanceQueuedBase('project', basis, row.versions)
      if (versions.get('project') === version && project.value) mergeServer(project.value as unknown as Loose, row as unknown as Loose, 'project')
      else if (project.value) project.value.versions = row.versions
      markSaved()
    }
    catch (error) {
      failed.value = true
      if (!retryable(error)) {
        report(error)
        return
      }
      if (attempt === 0) report(error)
      if (projectTimer.timer) clearTimeout(projectTimer.timer)
      else queued.value++
      projectTimer.patch = { ...patch, ...projectTimer.patch }
      projectTimer.base = { ...projectTimer.base, ...basis }
      projectTimer.attempt = attempt + 1
      projectTimer.timer = setTimeout(flushProject, backoff(attempt + 1))
    }
    finally {
      pending.value--
    }
  }

  // ---------------------------------------------------------------- local-only helpers (after custom endpoints)

  function patchLocal<C extends Collection>(collection: C, id: string, patch: Partial<CollectionMap[C]>) {
    const current = get(collection, id)
    if (current) applyLocal(collection, current as Loose, patch as Loose)
  }

  function upsertLocal<C extends Collection>(collection: C, row: CollectionMap[C]) {
    const current = get(collection, row.id)
    if (current) mergeServer(current as Loose, row as unknown as Loose, `${collection}:${row.id}`)
    else (rows[collection] as CollectionMap[C][]).push(row)
    sort(collection)
  }

  function removeLocal(collection: Collection, ids: string | string[]) {
    const drop = new Set(Array.isArray(ids) ? ids : [ids])
    ;(rows[collection] as { id: string }[]) = (rows[collection] as { id: string }[]).filter(r => !drop.has(r.id))
  }

  function touch() {
    if (project.value) project.value.updatedAt = new Date().toISOString()
  }

  return {
    // state
    project,
    status,
    loadError,
    rows,
    pending,
    queued,
    saving,
    failed,
    refused,
    lastSavedAt,
    trashCount,
    // identity
    projectId,
    kind,
    isGame,
    modules,
    // loading
    load,
    reload,
    reset,
    apply,
    // lookups
    get,
    getRef,
    refLabel,
    refPath,
    isRace,
    mappable,
    imagesOf,
    primaryImage,
    worldEntities,
    worldEntitiesOf,
    orderedParts,
    orderedChapters,
    orderedScenes,
    scenesByChapter,
    chapterScenes,
    chapterNumber,
    chapterWords,
    totalWords,
    // mutations
    create,
    update,
    patchSoon,
    flush,
    remove,
    restore,
    reorder,
    updateProject,
    updateProjectSoon,
    flushProject,
    patchLocal,
    upsertLocal,
    removeLocal,
  }
})

/** Shortcut used across the workspace: the store, already typed. */
export type ProjectStore = ReturnType<typeof useProjectStore>

/** The singular ref type of a collection, when it has one. */
export function refTypeOf(collection: Collection): RefType | undefined {
  return (COLLECTION_TO_REF as Partial<Record<Collection, RefType>>)[collection]
}
