/*
 * Lines and words per speaker (spec 4.6, game tab). Scene texts are not in the bundle: the dialogue
 * lines of every active revision come in one request (GET .../dialogue/lines), kept per project until
 * a scene's text, its active revision or the set of scenes changes.
 */

/** A line as GET /api/projects/:id/dialogue/lines returns it (the fields used here). */
interface SpokenLine {
  sceneId: string
  speakerId: string | null
  speakerName: string
  /** Words of the line text only (spec 0.11). */
  words: number
}

export interface SpeakerStats {
  /** "character:<id>", or "label:<name>" for a speaker without a character. */
  key: string
  characterId: string | null
  name: string
  lines: number
  words: number
  scenes: number
}

const cache = new Map<string, { stamp: string, lines: SpokenLine[] }>()

/** Reads the lines while `enabled()` says so (the script module is on), and again when the texts change. */
export function useDialogueStats(enabled: () => boolean) {
  const store = useProjectStore()
  const lines = shallowRef<SpokenLine[]>([])
  const loading = ref(false)
  const failed = ref(false)

  /** Changes with any scene's text (saved, switched to another revision) and with the scenes themselves. */
  const stamp = computed(() => store.rows.scenes.map(s => `${s.id}:${s.currentRevisionId}:${s.editedAt ?? ''}`).sort().join('|'))

  let request = 0
  async function load() {
    const projectId = store.projectId
    const wanted = stamp.value
    const known = cache.get(projectId)
    if (known) lines.value = known.lines
    if (known?.stamp === wanted) {
      failed.value = false
      return
    }
    const mine = ++request
    // Numbers already on screen stay there while fresher ones come.
    loading.value = !known
    failed.value = false
    try {
      const answer = await $fetch<{ lines: SpokenLine[] }>(`/api/projects/${projectId}/dialogue/lines`)
      if (mine !== request) return
      cache.set(projectId, { stamp: wanted, lines: answer.lines })
      lines.value = answer.lines
    }
    catch {
      if (mine === request) failed.value = true
    }
    finally {
      if (mine === request) loading.value = false
    }
  }

  watch([enabled, stamp], ([on]) => {
    if (on) void load()
  }, { immediate: true })

  const speakers = computed<SpeakerStats[]>(() => {
    const byKey = new Map<string, SpeakerStats & { sceneIds: Set<string> }>()
    for (const line of lines.value) {
      const character = line.speakerId ? store.get('characters', line.speakerId) : undefined
      const name = character?.name ?? line.speakerName.trim()
      if (!name) continue
      const key = character ? `character:${character.id}` : `label:${name.toLocaleLowerCase()}`
      let entry = byKey.get(key)
      if (!entry) byKey.set(key, (entry = { key, characterId: character?.id ?? null, name, lines: 0, words: 0, scenes: 0, sceneIds: new Set() }))
      entry.lines++
      entry.words += line.words
      entry.sceneIds.add(line.sceneId)
    }
    return [...byKey.values()]
      .map(({ sceneIds, ...entry }) => ({ ...entry, scenes: sceneIds.size }))
      .sort((a, b) => b.lines - a.lines || b.words - a.words || a.name.localeCompare(b.name))
  })

  /** Lines nobody says (the revision stage of a game asks for a speaker on every line). */
  const unattributed = computed(() => lines.value.filter(line => !line.speakerId && !line.speakerName.trim()).length)

  const totalLines = computed(() => lines.value.length)

  return { load, speakers, unattributed, totalLines, loading, failed }
}

// Nuxt registers every file of components/ as a component: a default export keeps its generated types valid.
export default { useDialogueStats }
