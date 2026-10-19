<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import { CHARACTER_IMPORTANCES, CHARACTER_ROLES } from '#shared/utils/constants'
import type { CharacterImportance } from '#shared/types/domain'
import type { Character } from '#shared/types/entities'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useCharacterSaves } from './saving'

/**
 * The characters of the project (spec 4.4): grouped by importance, filtered by name and other names,
 * role, group and label, sorted by hand, by name or by appearances; new characters inline; the
 * manual order changed by dragging, Alt+Up/Down or the row menu. The whole page below xl; from xl,
 * `compact`, the side list next to the open sheet. Both share filters and order.
 */
const props = withDefaults(defineProps<{ compact?: boolean, activeId?: string | null }>(), { compact: false, activeId: null })

const store = useProjectStore()
const route = useRoute()
const { t, locale } = useI18n()
const { save } = useCharacterSaves()
const { term } = useTerms()
const { label } = useEnums()
const { number } = useFormat()

type Sort = 'manual' | 'name' | 'appearances'
interface ListState {
  query: string
  roles: string[]
  groups: string[]
  tags: string[]
  sort: Sort
}
const state = useState<ListState>(`characters:list:${store.projectId}`, () => ({ query: '', roles: [], groups: [], tags: [], sort: 'manual' }))

const guidance = computed(() => store.project?.settings.guidance ?? true)
const uid = useId()
const base = computed(() => `/p/${store.projectId}`)

// ---------------------------------------------------------------- facts per character

/** Scenes where each character is tagged (manually, mentioned, speaking) or is the point of view. */
const appearances = computed(() => {
  const counts = new Map<string, number>()
  for (const scene of store.rows.scenes) {
    const ids = new Set(scene.characterIds)
    if (scene.povCharacterId) ids.add(scene.povCharacterId)
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
})

/** Groups of each character, from its membership relationships. */
const groupsOf = computed(() => {
  const map = new Map<string, Set<string>>()
  for (const r of store.rows.relations) {
    if (r.kind !== 'membership' || r.sourceType !== 'character' || r.targetType !== 'group') continue
    const set = map.get(r.sourceId)
    if (set) set.add(r.targetId)
    else map.set(r.sourceId, new Set([r.targetId]))
  }
  return map
})

// ---------------------------------------------------------------- filters

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
const collator = computed(() => new Intl.Collator(locale.value, { sensitivity: 'base', numeric: true }))

const roleOptions = computed(() => CHARACTER_ROLES.filter(role => store.rows.characters.some(c => c.role === role)))
const groupOptions = computed(() => {
  const used = new Set([...groupsOf.value.values()].flatMap(set => [...set]))
  return [...store.rows.groups].filter(g => used.has(g.id)).sort((a, b) => a.position - b.position)
})
const tagOptions = computed(() =>
  [...new Set(store.rows.characters.flatMap(c => c.tags))].sort((a, b) => collator.value.compare(a, b)),
)

const filtering = computed(() => !!(state.value.query.trim() || state.value.roles.length || state.value.groups.length || state.value.tags.length))
const canReorder = computed(() => state.value.sort === 'manual' && !filtering.value)

interface Entry {
  character: Character
  /** The other name the search matched, shown in place of the epithet. */
  alias: string | null
}

const entries = computed<Entry[]>(() => {
  const query = fold(state.value.query.trim())
  const { roles, groups, tags } = state.value
  const out: Entry[] = []
  for (const character of store.rows.characters) {
    let alias: string | null = null
    if (query && !fold(character.name).includes(query)) {
      alias = character.aliases.find(a => fold(a).includes(query)) ?? null
      if (!alias) continue
    }
    if (roles.length && !roles.includes(character.role)) continue
    if (groups.length && !groups.some(id => groupsOf.value.get(character.id)?.has(id))) continue
    if (tags.length && !tags.some(tag => character.tags.includes(tag))) continue
    out.push({ character, alias })
  }
  return out
})

function compare(a: Entry, b: Entry) {
  const x = a.character
  const y = b.character
  if (state.value.sort === 'name') return collator.value.compare(x.name, y.name)
  if (state.value.sort === 'appearances') {
    return (appearances.value.get(y.id) ?? 0) - (appearances.value.get(x.id) ?? 0) || collator.value.compare(x.name, y.name)
  }
  return x.position - y.position || x.createdAt.localeCompare(y.createdAt)
}

/** The working order of each importance, rearranged by the drag and drop. */
const order = reactive<Record<CharacterImportance, Entry[]>>({ main: [], secondary: [], minor: [] })
watchEffect(() => {
  for (const importance of CHARACTER_IMPORTANCES) {
    order[importance] = entries.value.filter(e => e.character.importance === importance).sort(compare)
  }
})
const sections = computed(() => CHARACTER_IMPORTANCES.filter(importance => order[importance].length))

function toggle(key: 'roles' | 'groups' | 'tags', value: string, on: boolean) {
  const list = state.value[key]
  state.value[key] = on ? [...new Set([...list, value])] : list.filter(v => v !== value)
}

function clearFilters() {
  state.value.query = ''
  state.value.roles = []
  state.value.groups = []
  state.value.tags = []
}

const checkbox = (key: 'roles' | 'groups' | 'tags', value: string, text: string): DropdownMenuItem => ({
  type: 'checkbox',
  label: text,
  checked: state.value[key].includes(value),
  onUpdateChecked: (on: boolean) => toggle(key, value, on),
  onSelect: (event: Event) => event.preventDefault(),
})

const filterItems = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = []
  if (roleOptions.value.length) {
    groups.push([{ type: 'label', label: t('characters.list.filters.role') }, ...roleOptions.value.map(role => checkbox('roles', role, label('role', role)))])
  }
  if (groupOptions.value.length) {
    groups.push([{ type: 'label', label: term('group') }, ...groupOptions.value.map(g => checkbox('groups', g.id, g.name))])
  }
  if (tagOptions.value.length) {
    groups.push([{ type: 'label', label: t('characters.list.filters.tags') }, ...tagOptions.value.map(tag => checkbox('tags', tag, tag))])
  }
  return groups
})

const activeFilters = computed(() => [
  ...state.value.roles.map(value => ({ key: 'roles' as const, value, text: `${t('characters.list.filters.role')}: ${label('role', value)}` })),
  ...state.value.groups.map(value => ({ key: 'groups' as const, value, text: `${term('group')}: ${store.get('groups', value)?.name ?? ''}` })),
  ...state.value.tags.map(value => ({ key: 'tags' as const, value, text: `${t('characters.list.filters.tags')}: ${value}` })),
])
const filterCount = computed(() => state.value.roles.length + state.value.groups.length + state.value.tags.length)

const SORTS: Sort[] = ['manual', 'name', 'appearances']
/** One order among three: a listbox, not a menu of checkboxes. */
const sortItems = computed(() => SORTS.map(sort => ({ value: sort, label: t(`characters.list.sort.${sort}`) })))

// ---------------------------------------------------------------- moving

const announcement = ref('')
const root = useTemplateRef<HTMLElement>('root')

async function focusRow(id: string) {
  await nextTick()
  root.value?.querySelector<HTMLElement>(`[data-character="${id}"] a`)?.focus()
}

async function move(character: Character, delta: number) {
  if (!canReorder.value) return
  const ids = order[character.importance].map(e => e.character.id)
  const from = ids.indexOf(character.id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return
  ids.splice(to, 0, ids.splice(from, 1)[0]!)
  announcement.value = t('characters.list.moved', { name: character.name, n: to + 1, total: ids.length })
  await store.reorder('characters', ids).catch(() => {})
  await focusRow(character.id)
}

async function onDragEnd(importance: CharacterImportance) {
  await nextTick()
  const ids = order[importance].map(e => e.character.id)
  const stored = store.rows.characters.filter(c => c.importance === importance).sort((a, b) => a.position - b.position).map(c => c.id)
  if (ids.join() !== stored.join()) await store.reorder('characters', ids).catch(() => {})
}

async function moveTo(character: Character, importance: CharacterImportance) {
  save('characters', character.id, { importance }, 0)
  announcement.value = t('characters.list.movedTo', { name: character.name, importance: label('importance', importance) })
  await focusRow(character.id)
}

async function trash(character: Character) {
  if (character.id === props.activeId || character.id === route.params.characterId) {
    await navigateTo(`${base.value}/characters`)
  }
  await store.remove('characters', character.id).catch(() => {})
}

// The open character stays in sight in the side list.
watch(() => props.activeId, async (id) => {
  if (!props.compact || !id) return
  await nextTick()
  root.value?.querySelector(`[data-character="${id}"]`)?.scrollIntoView({ block: 'nearest' })
}, { immediate: true })

// ---------------------------------------------------------------- creating

const creating = ref(false)
const createImportance = ref<CharacterImportance>('main')

function startCreate(importance?: CharacterImportance) {
  createImportance.value = importance ?? (store.rows.characters.some(c => c.importance === 'main') ? 'secondary' : 'main')
  creating.value = true
}

async function onCreated(character: Character) {
  creating.value = false
  await navigateTo(store.refPath({ type: 'character', id: character.id }))
}

// ---------------------------------------------------------------- the one line for newcomers

const INTRO_KEY = 'dramatis:characters-intro'
const introHidden = ref(false)
onMounted(() => {
  try { introHidden.value = localStorage.getItem(INTRO_KEY) === '0' }
  catch {}
})
function hideIntro() {
  introHidden.value = true
  try { localStorage.setItem(INTRO_KEY, '0') }
  catch {}
}

const total = computed(() => store.rows.characters.length)
const empty = computed(() => !total.value)
</script>

<template>
  <div ref="root" class="characters-list" :class="compact ? 'flex min-h-0 flex-1 flex-col' : ''">
    <!-- Header: the page title on the full page, a small bar in the side list. -->
    <DPageHeader v-if="!compact" :title="term('characters')">
      <template v-if="guidance && !introHidden && !empty" #description>
        {{ t(store.isGame ? 'characters.list.intro.game' : 'characters.list.intro.novel') }}
        <UButton
          variant="link"
          color="neutral"
          size="xs"
          class="ms-1 p-0 align-baseline text-dimmed"
          :label="t('characters.list.intro.hide')"
          @click="hideIntro"
        />
      </template>
      <template v-if="!empty" #actions>
        <UButton
          class="hidden lg:inline-flex"
          color="primary"
          variant="solid"
          icon="i-lucide-plus"
          :label="t('characters.list.new')"
          :disabled="creating"
          @click="startCreate()"
        />
        <UButton
          class="w-full justify-center lg:hidden pointer-coarse:min-h-11"
          color="primary"
          variant="outline"
          icon="i-lucide-plus"
          :label="t('characters.list.new')"
          :disabled="creating"
          @click="startCreate()"
        />
      </template>
    </DPageHeader>
    <div v-else class="flex h-14 shrink-0 items-center gap-2 border-b border-default/60 ps-4 pe-2">
      <NuxtLink :to="`${base}/characters`" class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted hover:underline">
        {{ term('characters') }}
        <span class="tabular ms-1 text-xs font-normal text-dimmed">{{ number(total) }}</span>
      </NuxtLink>
      <UTooltip :text="t('characters.list.new')">
        <UButton icon="i-lucide-plus" color="neutral" variant="ghost" class="pointer-coarse:size-11 pointer-coarse:justify-center" :aria-label="t('characters.list.new')" :disabled="creating" @click="startCreate()" />
      </UTooltip>
    </div>

    <!-- Search, filters and order. -->
    <div v-if="!empty" class="flex flex-wrap items-center gap-2" :class="compact ? 'px-3 pt-3' : 'mb-2'">
      <UInput
        v-model="state.query"
        icon="i-lucide-search"
        :placeholder="t('characters.list.search')"
        :aria-label="t('characters.list.searchLabel')"
        class="min-w-0 flex-1"
        :class="compact ? '' : 'basis-40 sm:max-w-sm'"
        :ui="{ base: 'pointer-coarse:min-h-11' }"
        @keydown.esc="state.query = ''"
      >
        <template v-if="state.query" #trailing>
          <UButton icon="i-lucide-x" color="neutral" variant="link" size="xs" class="pointer-coarse:size-11 pointer-coarse:justify-center" :aria-label="t('characters.list.clearSearch')" @click="state.query = ''" />
        </template>
      </UInput>
      <UTooltip v-if="filterItems.length" :text="t('characters.list.filter')">
        <UDropdownMenu :items="filterItems" :content="{ align: compact ? 'end' : 'start' }" :ui="{ content: 'max-h-80' }">
          <UButton
            icon="i-lucide-list-filter"
            color="neutral"
            variant="outline"
            class="pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center"
            :aria-label="filterCount ? t('characters.list.filterActive', { n: filterCount }, filterCount) : t('characters.list.filter')"
          >
            <span v-if="!compact" class="hidden sm:inline">{{ t('characters.list.filter') }}</span>
            <template v-if="filterCount" #trailing>
              <span class="tabular rounded-[4.5px] bg-elevated px-1.5 text-xs text-toned">{{ number(filterCount) }}</span>
            </template>
          </UButton>
        </UDropdownMenu>
      </UTooltip>
      <UTooltip :text="t('characters.list.sort.label')">
        <USelect
          v-model="state.sort"
          :items="sortItems"
          icon="i-lucide-arrow-down-wide-narrow"
          color="neutral"
          variant="ghost"
          :aria-label="t('characters.list.sort.label')"
          :content="{ align: 'end' }"
          :ui="{
            base: 'pointer-coarse:min-h-11',
            value: compact ? 'sr-only' : 'max-sm:sr-only',
            content: 'min-w-48',
          }"
        />
      </UTooltip>
    </div>

    <div v-if="activeFilters.length" class="flex flex-wrap items-center gap-1.5" :class="compact ? 'px-3 pt-2' : 'mb-2'">
      <UButton
        v-for="filter in activeFilters"
        :key="`${filter.key}:${filter.value}`"
        size="xs"
        color="neutral"
        variant="soft"
        trailing-icon="i-lucide-x"
        class="pointer-coarse:min-h-11 pointer-coarse:px-3"
        :label="filter.text"
        :aria-label="t('characters.list.filters.remove', { filter: filter.text })"
        @click="toggle(filter.key, filter.value, false)"
      />
    </div>

    <div :class="compact ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2 pb-6' : ''">
      <CharactersCreateRow
        v-if="creating"
        :importance="createImportance"
        class="mb-3"
        :class="compact ? 'mx-1' : ''"
        @cancel="creating = false"
        @created="onCreated"
      />

      <!-- The groups by importance. -->
      <template v-if="!empty">
        <section
          v-for="importance in sections"
          :key="importance"
          class="mt-4 first:mt-2"
          :aria-labelledby="`${uid}-${importance}`"
        >
          <h2 :id="`${uid}-${importance}`" class="flex items-baseline gap-2 px-2 pb-1 text-sm font-medium text-muted" :class="compact ? '' : 'ps-7'">
            {{ label('importancePlural', importance) }}
            <span class="tabular text-xs font-normal text-dimmed">{{ number(order[importance].length) }}</span>
          </h2>
          <VueDraggable
            v-model="order[importance]"
            tag="ul"
            role="list"
            handle=".characters-row-handle"
            :disabled="!canReorder"
            :animation="150"
            :delay="200"
            :delay-on-touch-only="true"
            ghost-class="opacity-40"
            @end="onDragEnd(importance)"
          >
            <CharactersRow
              v-for="(entry, index) in order[importance]"
              :key="entry.character.id"
              :character="entry.character"
              :epithet="entry.alias ?? (entry.character.tagline || undefined)"
              :appearances="appearances.get(entry.character.id) ?? 0"
              :compact="compact"
              :active="entry.character.id === activeId"
              :movable="canReorder"
              :first="index === 0"
              :last="index === order[importance].length - 1"
              @move="(delta: number) => move(entry.character, delta)"
              @move-to="(to: CharacterImportance) => moveTo(entry.character, to)"
              @trash="trash(entry.character)"
            />
          </VueDraggable>
        </section>

        <div v-if="!sections.length" class="px-2 py-6" :class="compact ? 'text-sm' : ''">
          <p class="text-muted">{{ t('characters.list.noMatch') }}</p>
          <UButton class="mt-2 px-0" variant="link" color="neutral" :label="t('characters.list.filters.clear')" @click="clearFilters" />
        </div>
      </template>

      <!-- Nobody yet: the shape of the list, then what it is for and how to begin. -->
      <div v-else-if="!creating" :class="compact ? 'px-2 py-4 text-sm' : 'mt-2'">
        <ul v-if="!compact" aria-hidden="true" class="space-y-1 opacity-70">
          <li v-for="width in ['w-40', 'w-28']" :key="width" class="flex min-h-11 items-center gap-3 ps-7 pe-2">
            <span class="h-8 w-6 rounded-[1.5px] bg-elevated" />
            <span class="h-3 rounded-full bg-elevated" :class="width" />
            <span class="leader self-center!" />
            <span class="h-3 w-14 rounded-full bg-elevated" />
          </li>
        </ul>
        <div class="max-w-prose" :class="compact ? '' : 'mt-8 ps-7'">
          <p class="text-pretty text-highlighted" :class="compact ? '' : 'text-base'">{{ t('characters.list.empty.title') }}</p>
          <p v-if="guidance && !compact" class="mt-2 text-sm text-muted text-pretty">
            {{ t(store.isGame ? 'characters.list.empty.body.game' : 'characters.list.empty.body.novel') }}
          </p>
          <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <UButton
              class="hidden lg:inline-flex"
              color="primary"
              variant="solid"
              icon="i-lucide-plus"
              :label="t('characters.list.empty.action')"
              @click="startCreate('main')"
            />
            <UButton
              class="lg:hidden pointer-coarse:min-h-11"
              color="primary"
              variant="outline"
              icon="i-lucide-plus"
              :label="t('characters.list.empty.action')"
              @click="startCreate('main')"
            />
            <UButton
              v-if="!compact"
              variant="link"
              color="neutral"
              class="px-0 underline"
              :to="`${base}/manuscript`"
              :label="t('characters.list.empty.write')"
            />
          </div>
        </div>
      </div>
    </div>

    <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
  </div>
</template>
