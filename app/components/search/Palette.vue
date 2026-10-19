<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { EntityRef, RefType } from '#shared/types/domain'
import { docFromParagraphs } from '#shared/utils/richtext'
import type { SearchMatch, SearchResponse } from '~~/server/api/projects/[projectId]/search.get'
import { useManuscriptStructure } from '~/components/manuscript/Structure.vue'
import { searchLink } from './Result.vue'

/**
 * The command palette of the workspace (spec 4.6, 5.9): go anywhere or do anything without the
 * mouse. With no query, the last items opened and the main actions; with a query, sections, items by
 * name and alias (accents and case do not matter), actions, the scenes whose text holds the words,
 * and as the last row "Cerca «x» nel testo". Full screen on a phone.
 * The shell opens it with Cmd/Ctrl+K; here, Cmd/Ctrl+Shift+F opens the project search page.
 */
const open = defineModel<boolean>('open', { default: false })

const store = useProjectStore()
const route = useRoute()
const { t, locale, setLocale } = useI18n()
const { term } = useTerms()
const { groups: navGroups } = useProjectNav()
const colorMode = useColorMode()
const toast = useToast()
const { date } = useFormat()
const { macOS } = useKbd()
const structure = useManuscriptStructure()
const phone = useMediaQuery('(max-width: 1023px)')

/** The search endpoint takes up to 200 characters. */
const MAX_QUERY = 200

const searchTerm = ref('')
watch(open, (value) => {
  if (!value) searchTerm.value = ''
})
const close = () => { open.value = false }

// ---------------------------------------------------------------- matching

const FOLD: Record<string, string> = { '’': '\'', '‘': '\'', 'ʼ': '\'', '“': '"', '”': '"', '«': '"', '»': '"', '–': '-', '—': '-', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ł': 'l' }
/** Lowercase, no accents, plain quotes; with the index in the original of every folded character. */
function fold(text: string) {
  let folded = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!.toLowerCase()
    const out = FOLD[ch] ?? ch.normalize('NFD').replace(/\p{M}+/gu, '')
    for (const c of out) {
      folded += c
      map.push(i)
    }
  }
  return { folded, map }
}
const query = computed(() => fold(searchTerm.value.trim().replace(/\s+/g, ' ')).folded)

interface Hit { score: number, marks: [number, number][] }
/** 0 the name starts with the query, 1 a word does, 2 it is inside; null when absent. */
function hit(text: string): Hit | null {
  const q = query.value
  if (!q || !text) return null
  const { folded, map } = fold(text)
  const at = folded.indexOf(q)
  if (at < 0) return null
  const score = at === 0 ? 0 : /[\s\p{P}]/u.test(folded[at - 1] ?? '') ? 1 : 2
  return { score, marks: [[map[at]!, map[at + q.length - 1]! + 1]] }
}

interface Candidate extends CommandPaletteItem {
  label: string
  /** Other names that may match (aliases, a scene's code). */
  also?: { text: string, shown: string }[]
}
/** The candidates that match the query, best first, with the matched part of the label marked. */
function filter<T extends Candidate>(list: T[], limit = 6): T[] {
  const found: { item: T, score: number, index: number }[] = []
  list.forEach((item, index) => {
    const own = hit(item.label)
    if (own) return found.push({ item: { ...item, marks: own.marks }, score: own.score, index })
    for (const other of item.also ?? []) {
      const h = hit(other.text)
      if (!h) continue
      // The marks are on the other name; move them to where it sits in the suffix ("anche Tita").
      const shift = Math.max(0, other.shown.indexOf(other.text))
      const suffixMarks = h.marks.map(([a, b]) => [a + shift, b + shift] as [number, number])
      return found.push({ item: { ...item, marks: [], suffix: other.shown, suffixMarks }, score: h.score + 0.5, index })
    }
  })
  return found.sort((a, b) => a.score - b.score || a.index - b.index).slice(0, limit).map(f => f.item)
}

// ---------------------------------------------------------------- items

const base = computed(() => `/p/${store.projectId}`)
const kind = (key: Parameters<typeof term>[0]) => term(key).toLocaleLowerCase()

function entity(ref: EntityRef): Candidate | null {
  const go = { to: store.refPath(ref), onSelect: close }
  switch (ref.type) {
    case 'scene': {
      const s = store.get('scenes', ref.id)
      if (!s) return null
      const n = store.chapterNumber(s.chapterId)
      return { ...go, id: ref.id, type: ref.type, label: s.title || t('common.untitled.scene'), suffix: [kind('scene'), s.code, n ? `${kind('chapter')} ${n}` : ''].filter(Boolean).join(' · '), icon: store.modules.scene_kinds ? SCENE_KIND_ICONS[s.kind] : REF_ICONS.scene, also: [{ text: s.code, shown: s.code }] }
    }
    case 'chapter': {
      const c = store.get('chapters', ref.id)
      return c ? { ...go, id: ref.id, type: ref.type, label: c.title || t('common.untitled.chapter'), suffix: `${kind('chapter')} ${store.chapterNumber(c.id)}`, icon: REF_ICONS.chapter } : null
    }
    case 'character': {
      const c = store.get('characters', ref.id)
      return c ? { ...go, id: ref.id, type: ref.type, label: c.name, suffix: c.tagline || kind('character'), color: c.color, imageId: store.primaryImage('character', c.id), also: c.aliases.map(a => ({ text: a, shown: t('search.palette.alias', { alias: a }) })) } : null
    }
    case 'group': {
      const g = store.get('groups', ref.id)
      return g ? { ...go, id: ref.id, type: ref.type, label: g.name, suffix: kind('group'), color: g.color, imageId: store.primaryImage('group', g.id), icon: REF_ICONS.group } : null
    }
    case 'location': {
      const l = store.get('locations', ref.id)
      return l ? { ...go, id: ref.id, type: ref.type, label: l.name, suffix: [l.city, l.region, l.nation].filter(Boolean).join(', ') || kind('location'), color: l.color, imageId: store.primaryImage('location', l.id), icon: REF_ICONS.location } : null
    }
    case 'object': {
      const o = store.get('objects', ref.id)
      return o ? { ...go, id: ref.id, type: ref.type, label: o.name, suffix: o.kind || kind('object'), color: o.color, imageId: store.primaryImage('object', o.id), icon: REF_ICONS.object } : null
    }
    case 'strand': {
      const s = store.get('strands', ref.id)
      return s ? { ...go, id: ref.id, type: ref.type, label: s.name, suffix: kind('strand'), color: s.color, icon: REF_ICONS.strand } : null
    }
    case 'note': {
      const n = store.get('notes', ref.id)
      return n ? { ...go, id: ref.id, type: ref.type, label: n.title || t('common.untitled.note'), suffix: t('common.enums.refType.note').toLocaleLowerCase(), icon: REF_ICONS.note } : null
    }
    case 'codex': {
      const e = store.get('codexEntries', ref.id)
      return e && store.modules.codex ? { ...go, id: ref.id, type: ref.type, label: e.title, suffix: store.get('codexCategories', e.categoryId)?.name ?? kind('codexEntry'), icon: REF_ICONS.codex } : null
    }
    case 'event': {
      const e = store.get('events', ref.id)
      return e ? { ...go, id: ref.id, type: ref.type, label: e.title, suffix: kind('event'), icon: REF_ICONS.event } : null
    }
  }
  return null
}

const all = (type: RefType, ids: string[]) => ids.map(id => entity({ type, id })).filter((c): c is Candidate => !!c)

const maps = computed<Candidate[]>(() => store.rows.maps.map(m => ({
  id: m.id, type: 'map', label: m.name, suffix: kind('relationMap'), icon: 'i-lucide-waypoints', to: `${base.value}/relations/${m.id}`, onSelect: close,
})))
const variables = computed<Candidate[]>(() => store.modules.variables
  ? store.rows.variables.map(v => ({ id: v.id, type: 'variable', label: v.name, suffix: kind('variable'), icon: 'i-lucide-variable', mono: true, to: `${base.value}/variables`, onSelect: close }))
  : [])
const parts = computed<Candidate[]>(() => store.orderedParts.map((p, i) => ({
  id: p.id, type: 'part', label: p.title || t('common.untitled.part'), suffix: `${kind('part')} ${i + 1}`, icon: 'i-lucide-library', to: `${base.value}/manuscript`, onSelect: close,
})))

const sections = computed<Candidate[]>(() => [
  ...navGroups.value.flatMap(g => g.items.map(item => ({ id: item.key, label: item.label, icon: item.icon, to: item.to, onSelect: close }))),
  ...(['premise', 'fabula', 'setting'] as const).map(key => ({ id: key, label: term(key), icon: SECTION_ICONS.architecture, suffix: term('architecture'), to: `${base.value}/architecture/${key}`, onSelect: close })),
  { id: 'world', label: term('world'), icon: SECTION_ICONS.world, to: `${base.value}/world`, onSelect: close },
  { id: 'search', label: t('search.palette.searchPage'), icon: SECTION_ICONS.search, to: `${base.value}/search`, onSelect: close },
  { id: 'projects', label: t('search.palette.projects'), icon: 'i-lucide-library', to: '/projects', onSelect: close },
  { id: 'account', label: t('search.palette.account'), icon: 'i-lucide-circle-user-round', to: '/account', onSelect: close },
])

// ---------------------------------------------------------------- actions

async function run(work: () => Promise<unknown>) {
  close()
  try { await work() }
  catch {}
}

async function newScene() {
  // In the last edited chapter. With no chapter yet the manuscript makes "Capitolo 1" (inside "Parte
  // prima" or "Atto I" when parts are on), and in a game the first scene becomes the start (spec 5.1).
  const lastEdited = [...store.rows.scenes].filter(s => s.editedAt).sort((a, b) => b.editedAt!.localeCompare(a.editedAt!))[0]
  const scene = await structure.createScene({ chapterId: lastEdited?.chapterId ?? store.orderedChapters.at(-1)?.id })
  await navigateTo(store.refPath({ type: 'scene', id: scene.id }))
}
async function newWorldItem(type: 'character' | 'location' | 'object' | 'group') {
  const game = store.isGame
  const row = type === 'character'
    // The first character is the main one (spec 5.2).
    ? await store.create('characters', { name: t('common.untitled.character'), importance: store.rows.characters.some(c => c.importance === 'main') ? 'secondary' : 'main' })
    : type === 'group'
      ? await store.create('groups', game ? { name: t('common.untitled.faction'), kind: 'faction' } : { name: t('common.untitled.group') })
      : type === 'object'
        ? await store.create('objects', { name: game ? t('common.untitled.item') : t('common.untitled.object') })
        : await store.create('locations', { name: t('common.untitled.location') })
  await navigateTo(store.refPath({ type, id: row.id }))
}
async function newEvent() {
  const row = await store.create('events', { title: t('common.untitled.event') })
  await navigateTo(store.refPath({ type: 'event', id: row.id }))
}
async function newEntry() {
  const category = store.rows.codexCategories[0] ?? await store.create('codexCategories', { name: term('codex') })
  const row = await store.create('codexEntries', { categoryId: category.id, title: t('common.untitled.entry') })
  await navigateTo(store.refPath({ type: 'codex', id: row.id }))
}
async function quickNote() {
  const row = await store.create('notes', { title: date(new Date(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), content: docFromParagraphs([]) })
  await navigateTo(store.refPath({ type: 'note', id: row.id }))
}

/**
 * Focus mode belongs to the scene editor: the palette presses its shortcut for the author, with Cmd
 * or Ctrl decided by the same rule as defineShortcuts (an iPhone gets Ctrl).
 */
function focusMode() {
  close()
  const mac = !!macOS.value
  setTimeout(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', metaKey: mac, ctrlKey: !mac, shiftKey: true, bubbles: true }))
  }, 60)
}

async function setTheme(theme: 'light' | 'dark' | 'system') {
  close()
  colorMode.preference = theme
  await $fetch('/api/account', { method: 'PATCH', body: { preferences: { theme } } }).catch(() => {})
}
async function setLanguage(code: 'it' | 'en') {
  close()
  await setLocale(code)
  await $fetch('/api/account', { method: 'PATCH', body: { locale: code } }).catch(() => {})
}
async function setGuidance(value: boolean) {
  if (!store.project) return
  await store.updateProject({ settings: { ...store.project.settings, guidance: value } })
  if (value) {
    toast.add({ title: t('search.palette.pathShown'), icon: 'i-lucide-route' })
    await navigateTo(base.value)
  }
}

const inEditor = computed(() => /\/manuscript\/scenes\/[^/]+$/.test(route.path))
const guidance = computed(() => store.project?.settings.guidance ?? true)

const actions = computed<Candidate[]>(() => [
  { id: 'newScene', label: t('search.palette.newScene'), icon: 'i-lucide-file-plus', onSelect: () => run(newScene) },
  { id: 'newCharacter', label: t('search.palette.newCharacter'), icon: SECTION_ICONS.characters, onSelect: () => run(() => newWorldItem('character')) },
  { id: 'quickNote', label: t('search.palette.quickNote'), icon: 'i-lucide-notebook-pen', onSelect: () => run(quickNote) },
  ...(inEditor.value ? [{ id: 'focus', label: t('search.palette.focus'), icon: 'i-lucide-maximize', kbds: ['meta', 'shift', 'enter'], onSelect: focusMode }] : []),
  { id: 'export', label: t('search.palette.export'), icon: SECTION_ICONS.export, to: `${base.value}/export`, onSelect: close },
  {
    id: 'theme',
    label: t('search.palette.theme'),
    icon: 'i-lucide-sun-moon',
    placeholder: t('search.palette.theme'),
    children: (['light', 'dark', 'system'] as const).map(theme => ({ id: theme, label: t(`common.theme.${theme}`), active: colorMode.preference === theme, onSelect: () => { void setTheme(theme) } })),
  },
  {
    id: 'language',
    label: t('search.palette.language'),
    icon: 'i-lucide-languages',
    placeholder: t('search.palette.language'),
    children: (['it', 'en'] as const).map(code => ({ id: code, label: code === 'it' ? 'Italiano' : 'English', active: locale.value === code, onSelect: () => { void setLanguage(code) } })),
  },
  { id: 'newLocation', label: t('search.palette.newLocation'), icon: SECTION_ICONS.locations, onSelect: () => run(() => newWorldItem('location')) },
  { id: 'newObject', label: store.isGame ? t('search.palette.newItem') : t('search.palette.newObject'), icon: SECTION_ICONS.objects, onSelect: () => run(() => newWorldItem('object')) },
  { id: 'newGroup', label: store.isGame ? t('search.palette.newFaction') : t('search.palette.newGroup'), icon: SECTION_ICONS.groups, onSelect: () => run(() => newWorldItem('group')) },
  { id: 'newEvent', label: t('search.palette.newEvent'), icon: SECTION_ICONS.timeline, onSelect: () => run(newEvent) },
  ...(store.modules.codex ? [{ id: 'newEntry', label: t('search.palette.newEntry'), icon: SECTION_ICONS.codex, onSelect: () => run(newEntry) }] : []),
  guidance.value
    ? { id: 'hidePath', label: t('search.palette.hidePath'), icon: 'i-lucide-eye-off', onSelect: () => run(() => setGuidance(false)) }
    : { id: 'showPath', label: t('search.palette.showPath'), icon: 'i-lucide-route', onSelect: () => run(() => setGuidance(true)) },
])

// ---------------------------------------------------------------- recent items (this device)

const recent = ref<EntityRef[]>([])
const recentKey = computed(() => `dramatis:recent:${store.projectId}`)
watch(recentKey, (key) => {
  try { recent.value = JSON.parse(localStorage.getItem(key) ?? '[]') }
  catch { recent.value = [] }
}, { immediate: true })

const ITEM_ROUTES: [RegExp, RefType][] = [
  [/\/manuscript\/scenes\/([0-9a-f-]{36})/, 'scene'],
  [/\/manuscript\/chapters\/([0-9a-f-]{36})/, 'chapter'],
  [/\/characters\/([0-9a-f-]{36})/, 'character'],
  [/\/groups\/([0-9a-f-]{36})/, 'group'],
  [/\/locations\/([0-9a-f-]{36})/, 'location'],
  [/\/objects\/([0-9a-f-]{36})/, 'object'],
  [/\/strands\/([0-9a-f-]{36})/, 'strand'],
  [/\/notes\/([0-9a-f-]{36})/, 'note'],
  [/\/codex\/([0-9a-f-]{36})/, 'codex'],
]
watch(() => route.fullPath, () => {
  let ref: EntityRef | null = null
  for (const [re, type] of ITEM_ROUTES) {
    const m = re.exec(route.path)
    if (m) ref = { type, id: m[1]! }
  }
  if (!ref && typeof route.query.event === 'string') ref = { type: 'event', id: route.query.event }
  if (!ref) return
  recent.value = [ref, ...recent.value.filter(r => r.type !== ref!.type || r.id !== ref!.id)].slice(0, 16)
  try { localStorage.setItem(recentKey.value, JSON.stringify(recent.value)) }
  catch {}
}, { immediate: true })

// ---------------------------------------------------------------- text of the scenes (server)

const textHits = ref<SearchMatch[]>([])
const textLoading = ref(false)
let ticket = 0
const searchText = useDebounceFn(async (q: string) => {
  const mine = ++ticket
  if (q.length < 2) {
    textHits.value = []
    textLoading.value = false
    return
  }
  try {
    const found = await $fetch<SearchResponse>(`/api/projects/${store.projectId}/search`, { query: { q, types: 'scene', limit: 5 } })
    if (mine === ticket) textHits.value = found.groups[0]?.items.filter(i => i.field !== 'title') ?? []
  }
  catch {
    if (mine === ticket) textHits.value = []
  }
  finally {
    if (mine === ticket) textLoading.value = false
  }
}, 300)
watch(searchTerm, (value) => {
  const q = value.trim().slice(0, MAX_QUERY)
  textLoading.value = q.length >= 2
  void searchText(q)
})

// ---------------------------------------------------------------- groups

const groups = computed<CommandPaletteGroup[]>(() => {
  const q = searchTerm.value.trim().slice(0, MAX_QUERY)
  if (!q) {
    return [
      { id: 'recent', label: t('search.palette.recent'), slot: 'entity', ignoreFilter: true, items: recent.value.map(entity).filter((c): c is Candidate => !!c).slice(0, 8) },
      { id: 'actions', label: t('search.palette.actions'), slot: 'command', ignoreFilter: true, items: actions.value.slice(0, store.modules.codex ? 8 : 7) },
    ]
  }
  const world = (type: RefType, ids: string[]) => filter(all(type, ids))
  const list: CommandPaletteGroup[] = [
    { id: 'sections', label: t('search.palette.sections'), slot: 'command', items: filter(sections.value, 5) },
    { id: 'scenes', label: term('scene', 2), slot: 'entity', items: world('scene', store.orderedScenes.map(s => s.id)) },
    { id: 'characters', label: term('characters'), slot: 'entity', items: world('character', store.rows.characters.map(c => c.id)) },
    { id: 'locations', label: term('locations'), slot: 'entity', items: world('location', store.rows.locations.map(l => l.id)) },
    { id: 'objects', label: term('objects'), slot: 'entity', items: world('object', store.rows.objects.map(o => o.id)) },
    { id: 'groups', label: term('groups'), slot: 'entity', items: world('group', store.rows.groups.map(g => g.id)) },
    { id: 'strands', label: term('strands'), slot: 'entity', items: world('strand', store.rows.strands.map(s => s.id)) },
    { id: 'codex', label: term('codex'), slot: 'entity', items: store.modules.codex ? world('codex', store.rows.codexEntries.map(e => e.id)) : [] },
    { id: 'notes', label: term('notes'), slot: 'entity', items: world('note', store.rows.notes.map(n => n.id)) },
    { id: 'variables', label: term('variables'), slot: 'entity', items: filter(variables.value) },
    { id: 'parts', label: term('part', 2), slot: 'entity', items: filter(parts.value, 4) },
    { id: 'chapters', label: term('chapter', 2), slot: 'entity', items: world('chapter', store.orderedChapters.map(c => c.id)) },
    { id: 'events', label: term('event', 2), slot: 'entity', items: world('event', store.rows.events.map(e => e.id)) },
    { id: 'maps', label: term('relations'), slot: 'entity', items: filter(maps.value) },
    // Export is also a section: once is enough.
    { id: 'actions', label: t('search.palette.actions'), slot: 'command', items: filter(actions.value.filter(a => a.id !== 'export'), 5) },
    {
      id: 'text',
      label: t('search.palette.inText'),
      slot: 'text',
      items: textHits.value.map(hit => ({
        id: hit.id,
        label: hit.title || t('common.untitled.scene'),
        snippet: hit.snippet,
        snippetMarks: hit.marks,
        icon: REF_ICONS.scene,
        to: searchLink(store.projectId, hit, q),
        onSelect: close,
      })),
    },
    {
      id: 'search',
      slot: 'command',
      items: [{ id: 'search-text', label: t('search.palette.searchText', { q }), suffix: t('search.palette.searchTextHint'), icon: SECTION_ICONS.search, to: { path: `${base.value}/search`, query: { q } }, onSelect: close }],
    },
  ]
  return list.filter(g => g.items?.length).map(g => ({ ...g, ignoreFilter: true }))
})

// ---------------------------------------------------------------- shortcuts

// Cmd/Ctrl+K belongs to the shell, which opens the palette from text fields too.
defineShortcuts({
  meta_shift_f: {
    usingInput: true,
    handler: () => {
      close()
      const q = window.getSelection()?.toString().trim().slice(0, 100)
      void navigateTo({ path: `${base.value}/search`, query: q ? { q } : undefined })
    },
  },
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('search.palette.title')"
    :description="t('search.palette.placeholder')"
    :fullscreen="phone"
    :ui="{ content: phone ? '' : 'sm:max-w-2xl' }"
  >
    <template #content>
      <UCommandPalette
        v-model:search-term="searchTerm"
        :groups="groups"
        :placeholder="t('search.palette.placeholder')"
        :loading="textLoading"
        :close="phone"
        preserve-group-order
        :fuse="{ resultLimit: 16 }"
        class="h-full max-h-dvh sm:max-h-[70vh]"
        :ui="{ input: '[&>input]:text-base', item: 'min-h-10 items-center', label: 'text-xs font-medium text-muted', group: 'p-1.5' }"
        @update:open="(value: boolean) => { open = value }"
      >
        <template #entity-leading="{ item }">
          <span class="grid w-8 shrink-0 place-items-center">
            <DEntityAvatar
              v-if="item.type && ['character', 'group', 'location', 'object', 'strand'].includes(item.type)"
              :name="item.label ?? ''"
              :image-id="item.imageId"
              :color="item.color || null"
              :shape="item.type === 'character' ? 'portrait' : 'square'"
              :icon="item.type === 'character' ? undefined : item.icon"
              :size="item.type === 'character' ? 'sm' : 'md'"
              :class="item.type === 'character' ? '' : '!size-7'"
            />
            <UIcon v-else :name="item.icon ?? 'i-lucide-file'" class="size-5 text-dimmed" />
          </span>
        </template>
        <template #entity-label="{ item }">
          <span class="truncate" :class="item.mono ? 'font-mono text-sm text-highlighted' : 'voice-author font-semibold text-highlighted'">
            <SearchHighlighted :text="item.label ?? ''" :marks="item.marks" />
          </span>
          <span v-if="item.suffix" class="ms-2 truncate text-xs text-muted"><SearchHighlighted :text="item.suffix" :marks="item.suffixMarks" /></span>
        </template>
        <template #command-leading="{ item }">
          <span class="grid w-8 shrink-0 place-items-center">
            <UIcon :name="item.icon ?? 'i-lucide-chevron-right'" class="size-5 text-dimmed" />
          </span>
        </template>
        <template #text-leading="{ item }">
          <span class="grid w-8 shrink-0 place-items-center self-start pt-0.5">
            <UIcon :name="item.icon ?? 'i-lucide-file-text'" class="size-5 text-dimmed" />
          </span>
        </template>
        <template #command-label="{ item }">
          <span class="truncate text-highlighted"><SearchHighlighted :text="item.label ?? ''" :marks="item.marks" /></span>
          <span v-if="item.suffix" class="ms-2 truncate text-xs text-muted">{{ item.suffix }}</span>
        </template>
        <template #text-label="{ item }">
          <span class="voice-author truncate font-semibold text-highlighted">{{ item.label }}</span>
        </template>
        <template #text-description="{ item }">
          <span class="voice-author line-clamp-2 text-[0.8125rem] whitespace-normal text-toned"><SearchHighlighted :text="item.snippet" :marks="item.snippetMarks" /></span>
        </template>
        <template #empty>
          <p class="px-4 py-6 text-center text-sm text-muted">
            {{ searchTerm.trim() ? t('search.palette.noMatch', { q: searchTerm.trim() }) : t('search.palette.empty') }}
          </p>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
