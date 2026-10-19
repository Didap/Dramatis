import type { InjectionKey } from 'vue'
import { until } from '@vueuse/core'
import type { EditorPreferences, RichDoc, SceneTags } from '#shared/types/domain'
import type { Scene, SceneContent, SceneRevisionInfo, User } from '#shared/types/entities'

/*
 * The text of the open scene (spec 5.11, "never lose a word"). Loads the active revision; saves it one
 * second after the last keystroke and at least every ten seconds; keeps the unsent text on this device
 * (IndexedDB, or localStorage) until the server confirms it; retries with backoff; turns a stale save
 * into the conflict message. Revisions and history go through here too, because they change the text
 * under the editor. Also the account's editor typography (the "Aa" menu).
 *
 * Every save remembers what it sent on which basis until its answer comes back. When the server then
 * holds that very text (an answer lost, a copy sent as the page closed), it is this device's own: the
 * conflict revision the server made for it goes, and the newer text continues on the new basis.
 */

export type SaveFailure = 'network' | 'signedOut' | 'gone' | 'invalid'

/** Failures that retrying will not fix by itself (signed out, scene trashed, text refused). */
const HARD_FAILURES: readonly SaveFailure[] = ['signedOut', 'gone', 'invalid']

export interface ConflictInfo {
  reason: 'revision' | 'version'
  /** The incoming text, kept by the server as a new inactive revision. */
  conflictRevision: SceneRevisionInfo
  /** The text the server holds, now shown in the editor. */
  current: { revisionId: string, content: RichDoc | null, wordCount: number, version: number, updatedAt: string }
}

export interface SnapshotInfo {
  id: string
  revisionId: string
  wordCount: number
  reason: string
  createdAt: string
}

interface SavedAnswer {
  sceneId: string
  revisionId: string
  version: number
  wordCount: number
  updatedAt: string
  scene: Scene
  /** Present when the server gave dialogue lines new ids. */
  content?: RichDoc
}

interface RevisionAnswer {
  revision: SceneRevisionInfo
  scene: Scene
}

interface Basis {
  revisionId: string
  version: number
}

/** Fields of a scene the server recomputes on a content save or a revision switch. */
const COMPUTED_FIELDS = ['wordCount', 'charCount', 'charCountNoSpaces', 'lineCounter', 'editedAt', 'tags', 'characterIds', 'locationIds', 'objectIds', 'currentRevisionId'] as const

function computedFields(scene: Scene): Partial<Scene> {
  return Object.fromEntries(COMPUTED_FIELDS.map(key => [key, scene[key]])) as Partial<Scene>
}

/**
 * The fields of a content save: what the text tags (mentions, lines spoken) comes from the server, the
 * manual tags stay as the store holds them, because a change of them may still be on its way.
 */
function withLocalManualTags(fields: Partial<Scene>, local: Scene | undefined): Partial<Scene> {
  if (!local || !fields.tags) return fields
  const tags: SceneTags = {}
  for (const key of new Set([...Object.keys(fields.tags), ...Object.keys(local.tags ?? {})])) {
    const server = fields.tags[key]
    const entry = {
      ...(server?.mentions ? { mentions: server.mentions } : {}),
      ...(server?.lines ? { lines: server.lines } : {}),
      ...(local.tags?.[key]?.manual ? { manual: true } : {}),
    }
    if (entry.manual || entry.mentions || entry.lines) tags[key] = entry
  }
  const ids = (type: string) => Object.keys(tags).filter(k => k.startsWith(`${type}:`)).map(k => k.slice(type.length + 1))
  return { ...fields, tags, characterIds: ids('character'), locationIds: ids('location'), objectIds: ids('object') }
}

// ------------------------------------------------------------------ comparing texts

/** Key order (the database sorts keys) and line ids (the server may assign them) do not count. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  const node = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(node).sort()) {
    if (node[key] === undefined) continue
    out[key] = key === 'attrs' && node.type === 'dialogueLine' ? canonical({ ...(node.attrs as object), lineId: null }) : canonical(node[key])
  }
  return out
}

const textKey = (doc: RichDoc | null | undefined) => JSON.stringify(canonical(doc ?? null))

/** Two documents with the same text. */
function sameText(a: RichDoc | null | undefined, b: RichDoc | null | undefined): boolean {
  return textKey(a) === textKey(b)
}

function hashText(doc: RichDoc | null | undefined): string {
  const text = textKey(doc)
  let hash = 0x811C9DC5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${text.length.toString(36)}.${(hash >>> 0).toString(36)}`
}

/** A save sent from this device whose answer has not come back. */
interface SentMark extends Basis {
  hash: string
}

/** The server holds a text this device sent on that basis: the save arrived, its answer did not. */
function isOwn(current: Basis & { content: RichDoc | null }, marks: SentMark[] | undefined): boolean {
  if (!marks?.length) return false
  const hash = hashText(current.content)
  return marks.some(m => m.revisionId === current.revisionId && m.version + 1 === current.version && m.hash === hash)
}

function conflictOf(error: unknown): ConflictInfo | null {
  const data = (error as { data?: { data?: ConflictInfo } })?.data?.data
  return data?.conflictRevision ? data : null
}

/** A conflict revision made by a save of this device itself: out of the way, for good. */
function purgeRevision(projectId: string, sceneId: string, id: string) {
  void $fetch(`/api/projects/${projectId}/scenes/${sceneId}/revisions/${id}`, { method: 'DELETE' })
    .then(() => $fetch(`/api/projects/${projectId}/trash/purge`, { method: 'POST', body: { collection: 'revisions', id } }))
    .catch(() => {})
}

// ------------------------------------------------------------------ the text kept on this device

interface PendingText extends Basis {
  sceneId: string
  projectId: string
  /** The revision and version the text was written on: a newer server text makes it a conflict revision. */
  content: RichDoc
  at: number
  /** Saves sent on this basis and not answered: when the server holds one of them, this text continues it. */
  sent?: SentMark[]
}

const DB_NAME = 'dramatis-editor'
const DB_STORE = 'pending'
const LS_PREFIX = 'dramatis:pending-scene:'
let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE, { keyPath: 'sceneId' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    }
    catch {
      resolve(null)
    }
  })
  return dbPromise
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<{ ok: boolean, value?: T }> {
  const db = await openDb()
  if (!db) return { ok: false }
  return new Promise((resolve) => {
    try {
      const request = run(db.transaction(DB_STORE, mode).objectStore(DB_STORE))
      request.onsuccess = () => resolve({ ok: true, value: request.result })
      request.onerror = () => resolve({ ok: false })
    }
    catch {
      resolve({ ok: false })
    }
  })
}

const newest = (a: PendingText | null | undefined, b: PendingText | null | undefined): PendingText | null =>
  !a ? b ?? null : !b ? a : b.at > a.at ? b : a

function readLocal(key: string): PendingText | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as PendingText : null
  }
  catch {
    return null
  }
}

/** The unsent text of each scene: IndexedDB first, localStorage when it is not available or no time is left. */
const pendingTexts = {
  async put(entry: PendingText) {
    const plain = JSON.parse(JSON.stringify(entry)) as PendingText
    if ((await idb('readwrite', s => s.put(plain))).ok) return
    try { localStorage.setItem(LS_PREFIX + entry.sceneId, JSON.stringify(plain)) }
    catch {}
  },
  /** Synchronous, for a page that is going away: an IndexedDB write may not finish in time. */
  putNow(entry: PendingText) {
    try { localStorage.setItem(LS_PREFIX + entry.sceneId, JSON.stringify(entry)) }
    catch {}
  },
  async get(sceneId: string): Promise<PendingText | null> {
    const found = await idb<PendingText | undefined>('readonly', s => s.get(sceneId))
    return newest(found.value, readLocal(LS_PREFIX + sceneId))
  },
  async remove(sceneId: string) {
    await idb('readwrite', s => s.delete(sceneId))
    try { localStorage.removeItem(LS_PREFIX + sceneId) }
    catch {}
  },
  async list(projectId: string): Promise<PendingText[]> {
    const all = await idb<PendingText[]>('readonly', s => s.getAll())
    const byScene = new Map<string, PendingText>()
    const add = (entry: PendingText | null) => {
      if (entry?.projectId === projectId) byScene.set(entry.sceneId, newest(byScene.get(entry.sceneId), entry)!)
    }
    for (const entry of all.value ?? []) add(entry)
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(LS_PREFIX)) add(readLocal(key))
      }
    }
    catch {}
    return [...byScene.values()]
  },
}

// ------------------------------------------------------------------ scenes open in this browser

/** Each open editor holds a shared lock on its scene, so another tab leaves its kept text alone. */
const LOCK_PREFIX = 'dramatis:scene:'

async function openScenes(): Promise<(sceneId: string, at: number) => boolean> {
  try {
    const state = await navigator.locks?.query?.()
    if (state) {
      const held = new Set((state.held ?? []).map(lock => lock.name))
      return sceneId => held.has(LOCK_PREFIX + sceneId)
    }
  }
  catch {}
  // Without locks: a text kept less than half a minute ago may belong to an editor still open.
  return (_sceneId, at) => Date.now() - at < 30_000
}

/** Scenes in the trash whose kept text was already mentioned in this visit. */
const toldTrashed = new Set<string>()

// ------------------------------------------------------------------ the composable

export function useSceneContent(sceneId: string) {
  const store = useProjectStore()
  const { t } = useI18n()
  const toast = useToast()
  const projectId = store.projectId
  const base = `/api/projects/${projectId}/scenes/${sceneId}`

  const status = ref<'loading' | 'ready' | 'error'>('loading')
  const loadError = shallowRef<unknown>(null)
  /** The text the editor starts from; replaced, with a new `loadKey`, when the text changes under it. */
  const initial = shallowRef<RichDoc | null>(null)
  const loadKey = ref(0)
  const revisionId = ref('')
  const version = ref(0)
  const savedAt = ref<string | null>(null)
  const saving = ref(false)
  const dirty = ref(false)
  /** When the oldest change not yet on the server was made. */
  const dirtySince = ref(0)
  /** When the save on its way left. */
  const sendingSince = ref<number | null>(null)
  const failure = ref<SaveFailure | null>(null)
  const failingSince = ref<number | null>(null)
  const conflict = shallowRef<ConflictInfo | null>(null)
  /** Text written on this device in an earlier visit, put back in the editor. */
  const recovered = ref(false)
  /** Words of the active revision as the server last counted them. */
  const savedWords = ref(0)
  /** Words written by this visit's saves (positive deltas, as the server counts them). */
  const writtenHere = ref(0)

  const now = ref(Date.now())
  useIntervalFn(() => { now.value = Date.now() }, 1000)
  /** Changes unsaved for more than ten seconds (spec 5.8.6), a save that hangs included. */
  const stale = computed(() => {
    const at = now.value
    return dirty.value && at - dirtySince.value > 10_000 && (!saving.value || at - (sendingSince.value ?? at) > 3000)
  })

  let getDoc: (() => RichDoc) | null = null
  let applyLineIds: ((sent: RichDoc, saved: RichDoc) => void) | null = null
  /** Bumped on every change: a save knows whether more text arrived while it travelled. */
  let generation = 0
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let bufferTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retries = 0
  let again = false
  let hiddenAt = 0
  /** Saves sent on the current basis whose answer has not come back. */
  let unconfirmed: SentMark[] = []
  /** Conflict revisions made for the current stale basis, oldest first: only the newest holds all the text. */
  let conflictTrail: string[] = []
  /** The next save asks the server to keep a version of the text first (before "Sostituisci tutto"). */
  let bulkNext = false

  function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
    if (timer) clearTimeout(timer)
    return null
  }

  const savedFields = (scene: Scene) => withLocalManualTags(computedFields(scene), store.get('scenes', scene.id))

  function use(content: SceneContent) {
    revisionId.value = content.revisionId
    version.value = content.version
    savedAt.value = content.updatedAt
    savedWords.value = content.wordCount
    initial.value = content.content
    dirty.value = false
    unconfirmed = []
    loadKey.value++
  }

  // ---------------------------------------------------------------- this scene is open here

  let claimed = false
  let release = () => {}

  function claim() {
    if (claimed || typeof navigator === 'undefined' || !navigator.locks) return
    claimed = true
    const controller = new AbortController()
    let done = () => {}
    navigator.locks
      .request(LOCK_PREFIX + sceneId, { mode: 'shared', signal: controller.signal }, () => new Promise<void>((resolve) => { done = resolve }))
      .catch(() => {})
    release = () => {
      controller.abort()
      done()
    }
  }

  // ---------------------------------------------------------------- loading

  async function load() {
    status.value = 'loading'
    loadError.value = null
    claim()
    let content: SceneContent | null = null
    try {
      content = await $fetch<SceneContent>(`${base}/content`)
    }
    catch (error) {
      loadError.value = error
    }
    const pending = await pendingTexts.get(sceneId)
    if (content) {
      use(content)
      if (pending && !sameText(pending.content, content.content)) restore(pending, content)
      else if (pending) await pendingTexts.remove(sceneId)
      status.value = 'ready'
      void sendOtherScenes()
    }
    else if (pending && errorStatus(loadError.value) === 0) {
      // Offline: the scene stays editable on the text kept on this device.
      restore(pending)
      failure.value = 'network'
      failingSince.value = Date.now()
      status.value = 'ready'
    }
    else {
      status.value = 'error'
    }
  }

  /**
   * Puts back text that never reached the server. When a save of this device reached the server after
   * the text was kept, the text continues it; otherwise it stays on its own basis, and a newer server
   * text makes it a conflict revision.
   */
  function restore(pending: PendingText, server?: SceneContent) {
    const continued = server && isOwn(server, pending.sent) ? server : null
    revisionId.value = (continued ?? pending).revisionId
    version.value = (continued ?? pending).version
    unconfirmed = continued ? [] : [...(pending.sent ?? [])]
    initial.value = pending.content
    loadKey.value++
    recovered.value = true
    dirty.value = true
    dirtySince.value = Date.now()
    generation++
  }

  /** The editor hands over how to read its text and how to apply the line ids the server assigns. */
  function attach(read: () => RichDoc, lineIds: (sent: RichDoc, saved: RichDoc) => void) {
    getDoc = read
    applyLineIds = lineIds
    if (dirty.value) scheduleSave(0)
  }

  function detach() {
    getDoc = null
    applyLineIds = null
  }

  // ---------------------------------------------------------------- saving

  /** Called on every change the author makes. */
  function changed() {
    generation++
    // The note about recovered text has been read once the author writes on.
    recovered.value = false
    if (!dirty.value) {
      dirty.value = true
      dirtySince.value = Date.now()
    }
    bufferTimer = clearTimer(bufferTimer)
    bufferTimer = setTimeout(() => void writeBuffer(), 300)
    scheduleSave()
  }

  function scheduleSave(wait?: number) {
    saveTimer = clearTimer(saveTimer)
    if (retryTimer || (failure.value && HARD_FAILURES.includes(failure.value))) return
    const delay = wait ?? Math.max(0, Math.min(1000, dirtySince.value + 10_000 - Date.now()))
    saveTimer = setTimeout(() => {
      saveTimer = null
      void save()
    }, delay)
  }

  /** The text as it is kept on this device: on the basis it was written on, with the saves on their way. */
  function entry(content: RichDoc, at = Date.now()): PendingText {
    return { sceneId, projectId, revisionId: revisionId.value, version: version.value, content, at, sent: [...unconfirmed] }
  }

  async function writeBuffer() {
    bufferTimer = clearTimer(bufferTimer)
    if (!getDoc || !dirty.value) return
    await pendingTexts.put(entry(getDoc()))
  }

  /** The same, synchronous: for a page that is going away. */
  function keepNow() {
    bufferTimer = clearTimer(bufferTimer)
    if (getDoc && dirty.value) pendingTexts.putNow(entry(getDoc()))
  }

  /** One PUT of the text. With `keepalive` it outlives the page, and it leaves before this returns. */
  function send(body: Record<string, unknown>, keepalive: boolean): Promise<SavedAnswer> {
    const url = `${base}/content`
    const json = keepalive ? JSON.stringify(body) : ''
    // Browsers refuse keepalive bodies above 64 kB.
    if (!keepalive || json.length > 60_000) return $fetch<SavedAnswer>(url, { method: 'PUT', body, timeout: 20_000 })
    return fetch(url, {
      method: 'PUT',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: json,
      signal: AbortSignal.timeout?.(20_000),
    }).then(async (response) => {
      const data = await response.json().catch(() => null)
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status, data })
      return data as SavedAnswer
    })
  }

  /** Sends the text now. Resolves true when everything written so far is on the server. */
  async function save(options: { keepalive?: boolean } = {}): Promise<boolean> {
    if (!getDoc) return !dirty.value
    if (saving.value) {
      again = true
      return false
    }
    if (!dirty.value) return true
    saveTimer = clearTimer(saveTimer)
    retryTimer = clearTimer(retryTimer)
    const doc = getDoc()
    const sentGeneration = generation
    const startedAt = Date.now()
    const basis = { revisionId: revisionId.value, version: version.value }
    unconfirmed = [...unconfirmed.filter(m => m.revisionId === basis.revisionId && m.version === basis.version), { ...basis, hash: hashText(doc) }].slice(-5)
    saving.value = true
    sendingSince.value = startedAt
    // Kept on this device while it travels. Nothing is awaited before the request leaves: a closing page has no time.
    void pendingTexts.put(entry(doc, startedAt))
    try {
      const answer = await send({ content: doc, ...basis, ...(bulkNext ? { snapshot: 'before_bulk' } : {}) }, !!options.keepalive)
      return settle(answer, doc, sentGeneration, startedAt)
    }
    catch (error) {
      const info = errorStatus(error) === 409 ? conflictOf(error) : null
      if (info) return await takeConflict(info, doc, basis, sentGeneration)
      fail(error)
      return false
    }
    finally {
      saving.value = false
      sendingSince.value = null
      if (again) {
        again = false
        if (dirty.value && !failure.value) scheduleSave(0)
      }
    }
  }

  /** A save arrived: counts, tags and line ids follow; text written meanwhile goes next, on the new version. */
  function settle(answer: SavedAnswer, doc: RichDoc, sentGeneration: number, startedAt: number): boolean {
    revisionId.value = answer.revisionId
    version.value = answer.version
    savedAt.value = answer.updatedAt
    if (answer.wordCount > savedWords.value) writtenHere.value += answer.wordCount - savedWords.value
    savedWords.value = answer.wordCount
    store.patchLocal('scenes', sceneId, savedFields(answer.scene))
    if (answer.content) applyLineIds?.(doc, answer.content)
    unconfirmed = []
    bulkNext = false
    retries = 0
    failure.value = null
    failingSince.value = null
    if (generation === sentGeneration) {
      dirty.value = false
      void pendingTexts.remove(sceneId)
      return true
    }
    dirtySince.value = startedAt
    void writeBuffer()
    scheduleSave()
    return false
  }

  function fail(error: unknown) {
    const code = errorStatus(error)
    failure.value = code === 401 ? 'signedOut' : code === 404 ? 'gone' : code === 400 || code === 413 ? 'invalid' : 'network'
    failingSince.value ??= Date.now()
    if (failure.value !== 'network') return
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(retries, 5)) * (0.8 + Math.random() * 0.4)
    retries++
    retryTimer = clearTimer(retryTimer)
    retryTimer = setTimeout(() => {
      retryTimer = null
      void save()
    }, delay)
  }

  function adopt(current: ConflictInfo['current']) {
    revisionId.value = current.revisionId
    version.value = current.version
    savedAt.value = current.updatedAt
    savedWords.value = current.wordCount
    unconfirmed = []
    retries = 0
    failure.value = null
    failingSince.value = null
    recovered.value = false
  }

  /**
   * The server held a newer text. When it is this device's own, the conflict revision just made goes and
   * the text in the editor continues on the new basis. Otherwise ours is safe in the conflict revision;
   * text typed while the answers travel goes in too, on the same old basis, and only when nothing written
   * is outside a revision does the editor show their text. A save that fails meanwhile leaves the editor
   * and the kept text as they are, to try again.
   */
  async function takeConflict(info: ConflictInfo, sent: RichDoc, basis: Basis, sentGeneration: number): Promise<boolean> {
    if (sameText(info.current.content, sent) || isOwn(info.current, unconfirmed)) {
      purgeRevision(projectId, sceneId, info.conflictRevision.id)
      adopt(info.current)
      if (generation === sentGeneration && sameText(info.current.content, sent)) {
        dirty.value = false
        void pendingTexts.remove(sceneId)
        return true
      }
      void writeBuffer()
      scheduleSave(0)
      return false
    }
    bulkNext = false
    let latestInfo = info
    let stored = sent
    conflictTrail.push(info.conflictRevision.id)
    for (let round = 0; ; round++) {
      const latest = getDoc?.()
      if (!latest || sameText(latest, stored)) break
      if (round === 8) {
        // Typing faster than the answers come back: again in a moment, on the same basis.
        void writeBuffer()
        scheduleSave(1000)
        return false
      }
      const latestGeneration = generation
      try {
        const answer = await send({ content: latest, ...basis }, false)
        // The old basis was current again (its revision came back): the text is saved, nothing to swap.
        for (const id of conflictTrail) purgeRevision(projectId, sceneId, id)
        conflictTrail = []
        return settle(answer, latest, latestGeneration, Date.now())
      }
      catch (error) {
        const next = errorStatus(error) === 409 ? conflictOf(error) : null
        if (!next) {
          void writeBuffer()
          fail(error)
          return false
        }
        latestInfo = next
        stored = latest
        conflictTrail.push(next.conflictRevision.id)
      }
    }
    // Nothing waits from here to the swap: no keystroke can fall between the last revision and their text.
    for (const id of conflictTrail.slice(0, -1)) purgeRevision(projectId, sceneId, id)
    conflictTrail = []
    // Without an editor the kept text may be newer than the revision: it stays for the next visit.
    if (getDoc) void pendingTexts.remove(sceneId)
    adopt(latestInfo.current)
    conflict.value = latestInfo
    initial.value = latestInfo.current.content
    dirty.value = false
    loadKey.value++
    store.patchLocal('scenes', sceneId, { currentRevisionId: latestInfo.current.revisionId, wordCount: latestInfo.current.wordCount })
    return true
  }

  /**
   * Waits until everything written is on the server, at most `within` milliseconds when given, and keeps
   * on this device what could not be sent.
   */
  async function flush(options: { within?: number } = {}) {
    saveTimer = clearTimer(saveTimer)
    const work = (async () => {
      for (let attempt = 0; attempt < 3 && (dirty.value || saving.value); attempt++) {
        if (saving.value) await until(saving).toBe(false, { timeout: 8000 })
        else if (!(await save()) && failure.value) break
      }
    })()
    await (options.within ? Promise.race([work, new Promise(resolve => setTimeout(resolve, options.within))]) : work)
    if (dirty.value) await writeBuffer()
    return !dirty.value
  }

  /** Revisions and history change the text under the editor: first everything written goes to the server. */
  async function requireSaved() {
    if (await flush()) return
    const code = failure.value === 'signedOut' ? 401 : failure.value === 'gone' ? 404 : failure.value === 'invalid' ? 400 : 0
    throw Object.assign(new Error('The text of the scene is not saved yet'), { statusCode: code })
  }

  function retryNow() {
    retries = 0
    retryTimer = clearTimer(retryTimer)
    failure.value = null
    return save()
  }

  /** After the tab was away: picks up a text saved meanwhile on another device. */
  async function refreshIfStale() {
    if (status.value !== 'ready' || saving.value) return
    if (dirty.value) {
      void save()
      return
    }
    try {
      const content = await $fetch<SceneContent>(`${base}/content`)
      if (dirty.value || saving.value) return
      if (content.revisionId !== revisionId.value || content.version !== version.value) {
        use(content)
        toast.add({ title: t('editor.save.updatedElsewhere'), icon: 'i-lucide-refresh-cw' })
      }
    }
    catch {}
  }

  // ---------------------------------------------------------------- texts of other scenes kept here

  /**
   * Sends the kept text of another scene. When the server already holds it, or holds a save of this
   * device that the kept text continues, that is no conflict.
   */
  async function sendKept(kept: PendingText): Promise<'saved' | 'same' | SceneRevisionInfo> {
    let basis: Basis = { revisionId: kept.revisionId, version: kept.version }
    for (let attempt = 0; ; attempt++) {
      try {
        const answer = await $fetch<SavedAnswer>(`/api/projects/${projectId}/scenes/${kept.sceneId}/content`, {
          method: 'PUT',
          body: { content: kept.content, ...basis },
          timeout: 20_000,
        })
        store.patchLocal('scenes', kept.sceneId, savedFields(answer.scene))
        return 'saved'
      }
      catch (error) {
        const info = errorStatus(error) === 409 ? conflictOf(error) : null
        if (!info) throw error
        const same = sameText(info.current.content, kept.content)
        if (!same && (attempt > 0 || !isOwn(info.current, kept.sent))) return info.conflictRevision
        purgeRevision(projectId, kept.sceneId, info.conflictRevision.id)
        if (same) return 'same'
        basis = { revisionId: info.current.revisionId, version: info.current.version }
      }
    }
  }

  /** Texts of other scenes of this project that stayed on this device: sent now, never dropped. */
  async function sendOtherScenes() {
    const open = await openScenes()
    for (const kept of await pendingTexts.list(projectId)) {
      // A scene open in another tab is that editor's business.
      if (kept.sceneId === sceneId || open(kept.sceneId, kept.at)) continue
      const title = store.get('scenes', kept.sceneId)?.title || t('common.untitled.scene')
      try {
        const outcome = await sendKept(kept)
        await pendingTexts.remove(kept.sceneId)
        if (outcome === 'saved') toast.add({ title: t('editor.save.sentLater', { title }), icon: 'i-lucide-check' })
        else if (outcome !== 'same') toast.add({ title: t('editor.save.sentLaterConflict', { title, revision: outcome.label }), icon: 'i-lucide-git-fork', duration: 0 })
      }
      catch (error) {
        // In the trash: the text stays here and comes back with the scene. Offline or signed out: later.
        if (errorStatus(error) === 404 && !toldTrashed.has(kept.sceneId)) {
          toldTrashed.add(kept.sceneId)
          toast.add({ title: t('editor.save.keptTrashed'), icon: 'i-lucide-trash-2' })
        }
      }
    }
  }

  // ---------------------------------------------------------------- revisions and history

  async function listRevisions() {
    return $fetch<SceneRevisionInfo[]>(`${base}/revisions`)
  }

  async function listSnapshots() {
    return $fetch<SnapshotInfo[]>(`${base}/snapshots`)
  }

  async function readRevision(id: string) {
    return $fetch<{ content: RichDoc | null, wordCount: number, label: string, number: number, updatedAt: string }>(`${base}/revisions/${id}`)
  }

  async function readSnapshot(id: string) {
    return $fetch<{ content: RichDoc | null, wordCount: number, createdAt: string }>(`${base}/snapshots/${id}`)
  }

  /** "Nuova revisione": a copy of the active text, which becomes active. The editor keeps its text. */
  async function createRevision() {
    await requireSaved()
    const answer = await $fetch<RevisionAnswer>(`${base}/revisions`, { method: 'POST', body: {} })
    store.patchLocal('scenes', sceneId, computedFields(answer.scene))
    revisionId.value = answer.revision.id
    version.value = answer.revision.version
    savedWords.value = answer.revision.wordCount
    unconfirmed = []
    return answer.revision
  }

  /** "Usa questa revisione": switching does not count as words written or removed. */
  async function activateRevision(id: string) {
    await requireSaved()
    const answer = await $fetch<RevisionAnswer>(`${base}/revisions/${id}`, { method: 'PATCH', body: { current: true } })
    store.patchLocal('scenes', sceneId, computedFields(answer.scene))
    use(await $fetch<SceneContent>(`${base}/content`))
    if (conflict.value?.conflictRevision.id === id || conflict.value?.current.revisionId === id) conflict.value = null
    return answer.revision
  }

  async function renameRevision(id: string, label: string) {
    const answer = await $fetch<RevisionAnswer>(`${base}/revisions/${id}`, { method: 'PATCH', body: { label } })
    return answer.revision
  }

  async function trashRevision(id: string) {
    await $fetch(`${base}/revisions/${id}`, { method: 'DELETE' })
    store.trashCount++
    if (conflict.value?.conflictRevision.id === id) conflict.value = null
  }

  async function untrashRevision(id: string) {
    await $fetch(`/api/projects/${projectId}/trash/restore`, { method: 'POST', body: { collection: 'revisions', id } })
    store.trashCount = Math.max(0, store.trashCount - 1)
  }

  /** "Ripristina come nuova revisione": never overwrites, the restored text becomes a new active revision. */
  async function restoreSnapshot(id: string) {
    await requireSaved()
    const answer = await $fetch<RevisionAnswer>(`${base}/snapshots/${id}`, { method: 'POST' })
    store.patchLocal('scenes', sceneId, computedFields(answer.scene))
    use(await $fetch<SceneContent>(`${base}/content`))
    return answer.revision
  }

  // ---------------------------------------------------------------- page life

  /**
   * As the page goes away, or the tab hides (on a phone the last moment there may be): one last send that
   * outlives the page, and the text kept on this device at once. A save already on its way carries this
   * basis: a second one would only make a conflict revision.
   */
  function sendOnUnload() {
    if (!getDoc || !dirty.value) return
    // A save sent on this basis and not answered (on its way, or cut off by the closing page) may have
    // arrived: a second one would only make a conflict revision. The kept text settles it next time.
    const sentOnBasis = unconfirmed.some(m => m.revisionId === revisionId.value && m.version === version.value)
    if (!saving.value && !sentOnBasis) void save({ keepalive: true })
    keepNow()
  }

  useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
    if (!dirty.value && !saving.value) return
    sendOnUnload()
    event.preventDefault()
    event.returnValue = ''
  })
  useEventListener(window, 'pagehide', sendOnUnload)
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      sendOnUnload()
    }
    else if (hiddenAt && Date.now() - hiddenAt > 5000) {
      void refreshIfStale()
    }
  })
  useEventListener(window, 'online', () => {
    if (dirty.value) void retryNow()
  })

  // A hung connection never holds the author here: what is not on the server stays on this device.
  onBeforeRouteLeave(async () => {
    await flush({ within: 3000 })
  })
  onBeforeRouteUpdate(async (to, from) => {
    if (to.params.sceneId !== from.params.sceneId) await flush({ within: 3000 })
  })
  onBeforeUnmount(() => {
    retryTimer = clearTimer(retryTimer)
    // The editor is still there: its text is read now, kept, and sent unless a save is on its way.
    if (dirty.value) {
      if (saving.value) void writeBuffer()
      else void save()
    }
    saveTimer = clearTimer(saveTimer)
    bufferTimer = clearTimer(bufferTimer)
    detach()
    // The scene stays claimed until its last save is answered, so no other tab sends its kept text meanwhile.
    if (saving.value) void until(saving).toBe(false, { timeout: 25_000 }).then(() => release())
    else release()
  })

  const api = {
    status,
    loadError,
    initial,
    loadKey,
    revisionId,
    version,
    savedAt,
    saving,
    dirty,
    stale,
    failure,
    failingSince,
    conflict,
    recovered,
    savedWords,
    writtenHere,
    load,
    attach,
    detach,
    changed,
    save,
    flush,
    retryNow,
    /** The next save stores a version of the text first: called right before a bulk change. */
    beforeBulk: () => { bulkNext = true },
    listRevisions,
    listSnapshots,
    readRevision,
    readSnapshot,
    createRevision,
    activateRevision,
    renameRevision,
    trashRevision,
    untrashRevision,
    restoreSnapshot,
    dismissConflict: () => { conflict.value = null },
    dismissRecovered: () => { recovered.value = false },
  }
  provide(OPEN_SCENE, api)
  return api
}

export type SceneContentState = ReturnType<typeof useSceneContent>

const OPEN_SCENE = Symbol('dramatis:open-scene') as InjectionKey<SceneContentState>

/** The text state of the scene open in the editor, for the editor's panels and bars. */
export function useOpenScene(): SceneContentState {
  const state = inject(OPEN_SCENE)
  if (!state) throw new Error('useOpenScene() outside the scene editor')
  return state
}

// ------------------------------------------------------------------ typography of the manuscript

/**
 * The account's editor typography (spec 7.1): font, size, line height, width, typewriter scrolling and
 * paragraph focus. Applied at once, saved to the account a moment later.
 */
export function useEditorTypography() {
  const prefs = useState<EditorPreferences>('dramatis:editor-typography', () => ({}))
  const loaded = useState('dramatis:editor-typography-loaded', () => false)
  const queued = useState<Partial<EditorPreferences>>('dramatis:editor-typography-queued', () => ({}))

  async function load() {
    if (loaded.value) return
    try {
      const user = await $fetch<User>('/api/account')
      prefs.value = { ...user.preferences?.editor, ...queued.value }
      loaded.value = true
    }
    catch {}
  }

  const send = useDebounceFn(async () => {
    const editor = queued.value
    queued.value = {}
    if (!Object.keys(editor).length) return
    await $fetch('/api/account', { method: 'PATCH', body: { preferences: { editor } } }).catch(notifyError)
  }, 800)

  function set(patch: Partial<EditorPreferences>) {
    prefs.value = { ...prefs.value, ...patch }
    queued.value = { ...queued.value, ...patch }
    void send()
  }

  return { prefs, load, set }
}
