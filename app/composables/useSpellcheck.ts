import { loadSpeller, namesToWords, spellLanguage, spellWordKey, type SpellChecker, type Speller } from '~/utils/spelling'

/**
 * The spell check of the open project: the speller of the work's language, loaded the first time, and
 * the words it accepts: the project's dictionary, the names (and other names) of its characters,
 * races, groups, places, objects and codex entries, and the words ignored in this session. Off with
 * the account's preference ("Aa"), or for a language without a dictionary. `load: false` for the
 * dictionary alone (Settings), without the speller.
 */
export function useSpellcheck(options: { load?: boolean } = {}) {
  const store = useProjectStore()
  const { prefs } = useEditorTypography()
  /** Words ignored until the page is reloaded, per project. */
  const ignored = useState<Record<string, string[]>>('dramatis:spell-ignored', () => ({}))

  const language = computed(() => spellLanguage(store.project?.language))
  const enabled = computed(() => prefs.value.spellcheck !== false && !!language.value)
  const speller = shallowRef<Speller | null>(null)
  const failed = ref(false)

  watch([enabled, language], async ([on, lang]) => {
    speller.value = null
    failed.value = false
    if (!on || !lang || options.load === false) return
    try {
      const loaded = await loadSpeller(lang)
      if (enabled.value && language.value === lang) speller.value = loaded
    }
    catch {
      failed.value = true
    }
  }, { immediate: true })

  const dictionary = computed(() => store.project?.settings.dictionary ?? [])

  const accepted = computed(() => {
    const words = new Set<string>()
    for (const word of dictionary.value) words.add(spellWordKey(word))
    for (const word of ignored.value[store.projectId] ?? []) words.add(word)
    const names = [
      ...store.rows.characters.flatMap(c => [c.name, ...c.aliases]),
      ...store.rows.groups.map(g => g.name),
      ...store.rows.locations.map(l => l.name),
      ...store.rows.objects.map(o => o.name),
      ...store.rows.codexEntries.map(e => e.title),
    ]
    for (const word of namesToWords(names)) words.add(word)
    return words
  })

  const checker = computed<SpellChecker | null>(() => (speller.value ? { speller: speller.value, accepted: accepted.value } : null))

  /** Sends a change of the dictionary; shown at once, put back when the server says no. */
  async function change(body: { add?: string[], remove?: string[] }, optimistic: string[]) {
    const project = store.project
    if (!project) return
    const before = project.settings
    project.settings = { ...project.settings, dictionary: optimistic }
    try {
      const { dictionary } = await $fetch<{ dictionary: string[] }>(`/api/projects/${project.id}/dictionary`, { method: 'POST', body })
      if (store.project?.id === project.id) project.settings = { ...project.settings, dictionary }
    }
    catch (error) {
      if (store.project?.id === project.id) project.settings = before
      notifyError(error)
    }
  }

  /** "Aggiungi al dizionario": from now on the word is right in the whole project. */
  function addWord(word: string) {
    const clean = word.trim().replace(/['’]$/, '')
    if (!clean || dictionary.value.some(w => spellWordKey(w) === spellWordKey(clean))) return Promise.resolve()
    return change({ add: [clean] }, [...dictionary.value, clean])
  }

  function removeWord(word: string) {
    return change({ remove: [word] }, dictionary.value.filter(w => spellWordKey(w) !== spellWordKey(word)))
  }

  /** "Ignora": right until the page is reloaded, in every scene of the project. */
  function ignore(word: string) {
    const id = store.projectId
    ignored.value = { ...ignored.value, [id]: [...(ignored.value[id] ?? []), spellWordKey(word)] }
  }

  return { language, enabled, failed, speller, checker, dictionary, addWord, removeWord, ignore }
}
