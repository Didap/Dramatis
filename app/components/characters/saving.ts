import type { MaybeRefOrGetter } from 'vue'
import type { Collection } from '#shared/types/domain'
import type { UpdateInput } from '#shared/types/entities'

/*
 * Saving on the character pages (spec 0.5, 5.11). Every change goes through the store's patchSoon:
 * shown at once, sent after a pause, merged with the changes around it, kept and retried when the
 * connection fails, never rolled back under the author.
 *
 * On top of that, one save at a time: a change made while a save is on its way waits in the queue for
 * the answer, which moves the base version of its long texts forward (description, notes, free text).
 * Sent at once, it would carry the old base and come back as a conflict note against the author's own
 * typing. The store could do this per item; until it does, A1 holds while anything is in flight.
 */

/** One second after the last keystroke (spec 5.11). */
const TYPING_DELAY = 1000
/** During continuous typing a text still goes out this often. */
const MAX_WAIT = 10_000
/** The longest a change waits for an answer that does not come. */
const HOLD = 20_000

const held = new Map<string, { collection: Collection, id: string }>()
const bursts = new Map<string, { since: number, last: number }>()
let releasing = false

export function useCharacterSaves() {
  const store = useProjectStore()

  if (!releasing) {
    releasing = true
    // For the life of the app, not of the page that saved first: a held change outlives its page.
    effectScope(true).run(() => {
      watch(() => store.pending, (pending) => {
        if (pending) return
        for (const { collection, id } of held.values()) store.patchSoon(collection, id, {}, TYPING_DELAY)
        held.clear()
      })
    })
  }

  /** The pause before sending: the typing delay, or none once a burst of typing has lasted MAX_WAIT. */
  function pause(key: string, delay: number): number {
    if (!delay) return 0
    const now = Date.now()
    const burst = bursts.get(key)
    if (!burst || now - burst.last > delay) {
      bursts.set(key, { since: now, last: now })
      return delay
    }
    burst.last = now
    if (now - burst.since < MAX_WAIT) return delay
    burst.since = now
    return 0
  }

  /** Saves a change of a character (or of one of its relationships). `delay` 0 for a discrete choice. */
  function save<C extends Collection>(collection: C, id: string, patch: UpdateInput<C>, delay = TYPING_DELAY) {
    const key = `${collection}:${id}`
    if (store.pending) {
      held.set(key, { collection, id })
      store.patchSoon(collection, id, patch, HOLD)
      return
    }
    held.delete(key)
    store.patchSoon(collection, id, patch, pause(key, delay))
  }

  return { save }
}

interface TrashItem { collection: string, id: string }

/**
 * true once a save has failed because the character is in the trash, moved there from another
 * device: the page says so instead of failing in silence. Checked against the trash after a failure.
 */
export function useTrashedCharacter(characterId: MaybeRefOrGetter<string>) {
  const store = useProjectStore()
  const online = useOnline()
  const trashed = ref(false)

  watch(() => store.failed, async (failed) => {
    if (!failed || !online.value || trashed.value || !store.projectId) return
    try {
      const items = await $fetch<TrashItem[]>(`/api/projects/${store.projectId}/trash`)
      const id = toValue(characterId)
      trashed.value = items.some(item => item.collection === 'characters' && item.id === id)
    }
    catch {
      // Still unreachable: the save indicator already says so.
    }
  })
  watch(() => toValue(characterId), () => { trashed.value = false })

  return trashed
}
