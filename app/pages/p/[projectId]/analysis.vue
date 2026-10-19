<script setup lang="ts">
import { CHARACTER_IMPORTANCES, POINTS_OF_VIEW, SCENE_STATUSES, STRAND_KINDS } from '#shared/utils/constants'
import { chapterColumns, columnGroups, distribute, lengths, rowTotal, sceneCharacters } from '~/components/analysis/analysis-model'
import type { MatrixRow } from '~/components/analysis/analysis-model'

/**
 * The analysis (spec 4.6): how the story is spread across the chapters. Tabs in the query (?tab=):
 * lengths, characters, locations, objects, strands, pov, status, and game for the game modules. The
 * tabs are links (each one is an address), wrapping onto a second line rather than cutting a label;
 * a select on a phone. Every chart is HTML and CSS with its numbers written; a matrix cell opens its scenes.
 */
const route = useRoute()
const router = useRouter()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const { scenes: scenesText, words, chapters: chaptersText, localeTag } = useFormat()
/** One solid control per view: on a phone it is the bar's "Aggiungi". */
const desktop = useIsDesktop()

const guidance = computed(() => store.project?.settings.guidance !== false)
const hasGameTab = computed(() => store.modules.branching || store.modules.script || store.modules.scene_kinds)

const tabs = computed(() => [
  { value: 'lengths', label: t('analysis.tabs.lengths'), icon: 'i-lucide-ruler' },
  { value: 'characters', label: term('characters'), icon: REF_ICONS.character },
  { value: 'locations', label: term('locations'), icon: REF_ICONS.location },
  { value: 'objects', label: term('objects'), icon: REF_ICONS.object },
  { value: 'strands', label: term('strands'), icon: REF_ICONS.strand },
  { value: 'pov', label: t('analysis.tabs.pov'), icon: 'i-lucide-eye' },
  { value: 'status', label: t('analysis.tabs.status'), icon: 'i-lucide-stamp' },
  ...(hasGameTab.value ? [{ value: 'game', label: t('analysis.tabs.game'), icon: 'i-lucide-gamepad-2' }] : []),
])

const tabQuery = (value: string) => ({ query: { ...route.query, tab: value === 'lengths' ? undefined : value } })

const tab = computed({
  get: () => {
    const value = String(route.query.tab ?? '')
    return tabs.value.some(item => item.value === value) ? value : 'lengths'
  },
  set: (value: string) => {
    void router.replace(tabQuery(value))
  },
})
const tabLabel = computed(() => tabs.value.find(item => item.value === tab.value)?.label ?? '')

// ---------------------------------------------------------------- the work, in reading order

const scenes = computed(() => store.orderedScenes)
const columns = computed(() => chapterColumns(store.orderedChapters))
const groups = computed(() => columnGroups(columns.value, store.orderedParts, t('common.untitled.part')))
const chapterScenes = computed(() => new Map(columns.value.map(c => [c.id, store.chapterScenes(c.id).length])))
const hasWork = computed(() => columns.value.length > 0 && scenes.value.length > 0)

const lengthSummary = computed(() => lengths(columns.value, id => store.chapterScenes(id)))

const showMinor = ref(false)
const minorCount = computed(() => store.rows.characters.filter(c => c.importance === 'minor').length)

const characterRows = computed<MatrixRow[]>(() => {
  const spread = distribute(scenes.value, sceneCharacters)
  const rank = Object.fromEntries(CHARACTER_IMPORTANCES.map((key, i) => [key, i])) as Record<string, number>
  return [...store.rows.characters]
    .filter(c => showMinor.value || c.importance !== 'minor')
    .sort((a, b) => (rank[a.importance] ?? 9) - (rank[b.importance] ?? 9) || a.position - b.position)
    .map(c => ({ id: c.id, label: c.name, color: c.color || null, section: label('importancePlural', c.importance), to: store.refPath({ type: 'character', id: c.id }), cells: spread.get(c.id) ?? new Map(), total: rowTotal(spread.get(c.id)) }))
})

function entityRows(collection: 'locations' | 'objects', keysOf: (scene: (typeof scenes.value)[number]) => string[]): MatrixRow[] {
  const spread = distribute(scenes.value, keysOf)
  const type = collection === 'locations' ? 'location' : 'object'
  return store.rows[collection].map(item => ({ id: item.id, label: item.name, to: store.refPath({ type, id: item.id }), cells: spread.get(item.id) ?? new Map(), total: rowTotal(spread.get(item.id)) }))
}
const locationRows = computed(() => entityRows('locations', s => s.locationIds))
const objectRows = computed(() => entityRows('objects', s => s.objectIds))

const strandRows = computed<MatrixRow[]>(() => {
  const spread = distribute(scenes.value, s => s.strandIds)
  const kinds = new Set(store.rows.strands.map(s => s.kind))
  return [...store.rows.strands]
    .sort((a, b) => STRAND_KINDS.indexOf(a.kind) - STRAND_KINDS.indexOf(b.kind) || a.position - b.position)
    .map(s => ({ id: s.id, label: s.name, color: s.color || null, section: kinds.size > 1 ? label('strandKind', s.kind) : undefined, to: store.refPath({ type: 'strand', id: s.id }), cells: spread.get(s.id) ?? new Map(), total: rowTotal(spread.get(s.id)) }))
})

const NONE = '__none'

const povRows = computed<MatrixRow[]>(() => {
  const spread = distribute(scenes.value, s => [s.pov ?? NONE])
  return [...POINTS_OF_VIEW, NONE]
    .filter(key => spread.has(key))
    .map(key => ({ id: key, label: key === NONE ? t('analysis.pov.unset') : label('pov', key), cells: spread.get(key)!, total: rowTotal(spread.get(key)) }))
})

const povCharacterRows = computed<MatrixRow[]>(() => {
  const spread = distribute(scenes.value, s => [s.povCharacterId && store.get('characters', s.povCharacterId) ? s.povCharacterId : NONE])
  const rows: MatrixRow[] = store.rows.characters
    .filter(c => spread.has(c.id))
    .map(c => ({ id: c.id, label: c.name, color: c.color || null, to: store.refPath({ type: 'character', id: c.id }), cells: spread.get(c.id)!, total: rowTotal(spread.get(c.id)) }))
    .sort((a, b) => b.total - a.total)
  if (spread.has(NONE)) rows.push({ id: NONE, label: t('analysis.pov.nobody'), cells: spread.get(NONE)!, total: rowTotal(spread.get(NONE)) })
  return rows
})

const statusRows = computed<MatrixRow[]>(() => {
  const spread = distribute(scenes.value, s => [s.status])
  return SCENE_STATUSES.map(key => ({
    id: key,
    label: label('sceneStatus', key),
    icon: statusIcon('scene', key),
    iconColor: `var(--status-${key})`,
    cells: spread.get(key) ?? new Map(),
    total: rowTotal(spread.get(key)),
  }))
})

// ---------------------------------------------------------------- one line of facts per tab

const listFormat = computed(() => new Intl.ListFormat(localeTag.value, { type: 'conjunction' }))

/** Who is in the work at all; `feminine` agrees "altre" with linee narrative, trame e missioni. */
function presence(rows: MatrixRow[], feminine = false) {
  const absent = rows.filter(r => !r.total)
  const names = absent.slice(0, 6).map(r => r.label)
  if (absent.length > 6) names.push(t(feminine ? 'analysis.matrix.moreFeminine' : 'analysis.matrix.more', { n: absent.length - 6 }, absent.length - 6))
  return {
    text: t('analysis.matrix.presence', { present: rows.length - absent.length, total: rows.length }, rows.length - absent.length),
    absent: absent.length ? t('analysis.matrix.absent', { names: listFormat.value.format(names) }) : '',
  }
}

/** The rows of the entity tab on screen, and what they say at a glance. */
const entityTabRows = computed(() => (tab.value === 'locations' ? locationRows.value : tab.value === 'objects' ? objectRows.value : strandRows.value))
const entityPresence = computed(() => presence(entityTabRows.value, tab.value === 'strands'))
const characterPresence = computed(() => presence(characterRows.value))

const statusLine = computed(() => listFormat.value.format(SCENE_STATUSES
  .map(key => ({ key, n: statusRows.value.find(r => r.id === key)?.total ?? 0 }))
  .filter(item => item.n)
  .map(item => t(`analysis.status.count.${item.key}`, { n: item.n }, item.n))))

const finalShare = computed(() => {
  const total = scenes.value.length
  const final = statusRows.value.find(r => r.id === 'final')?.total ?? 0
  return total ? Math.round((final / total) * 100) : 0
})

const povLine = computed(() => {
  const top = [...povRows.value].filter(r => r.id !== NONE).sort((a, b) => b.total - a.total)[0]
  if (!top) return ''
  return t('analysis.pov.most', { pov: top.label.toLocaleLowerCase(), n: scenesText(top.total), total: scenes.value.length })
})

const emptyTab = computed(() => {
  const medium = store.isGame ? 'Game' : ''
  switch (tab.value) {
    case 'characters': return store.rows.characters.length ? '' : t('analysis.empty.characters')
    case 'locations': return store.rows.locations.length ? '' : t('analysis.empty.locations')
    case 'objects': return store.rows.objects.length ? '' : t(`analysis.empty.objects${medium}`)
    case 'strands': return store.rows.strands.length ? '' : t(`analysis.empty.strands${medium}`)
    default: return ''
  }
})

const emptyTabLink = computed(() => {
  const base = `/p/${store.projectId}`
  return ({ characters: `${base}/characters`, locations: `${base}/locations`, objects: `${base}/objects`, strands: `${base}/strands` } as Record<string, string>)[tab.value]
})
</script>

<template>
  <!--
    shrink-0: keeps the page bar sticky past the first screen (DPage's root shrinks to the viewport).
    relative: keeps absolutely positioned bits (sr-only text) inside the scrolling page, so focusing
    a row never shifts the whole workspace frame.
  -->
  <DPage :title="term('analysis')" width="wide" class="relative shrink-0">
    <DPageHeader :title="term('analysis')" :description="guidance ? t(store.isGame ? 'analysis.descriptionGame' : 'analysis.description') : undefined">
      <template v-if="hasWork" #meta>
        <span>{{ t('analysis.meta', { chapters: chaptersText(columns.length), scenes: scenesText(scenes.length), words: words(store.totalWords) }) }}</span>
      </template>
    </DPageHeader>

    <div v-if="!hasWork" class="max-w-xl">
      <ol class="pointer-events-none mb-6 select-none opacity-60" aria-hidden="true">
        <li v-for="ghost in [10, 6]" :key="ghost" class="flex items-center gap-3 py-2.5">
          <span class="h-3 w-5 rounded-sm bg-elevated" />
          <span class="h-3 rounded-sm bg-elevated" :style="{ width: `${ghost}rem` }" />
          <span class="leader" />
          <span class="h-2.5 w-16 rounded-sm bg-elevated" />
        </li>
      </ol>
      <p class="text-pretty text-highlighted">{{ t(store.isGame ? 'analysis.empty.titleGame' : 'analysis.empty.title') }}</p>
      <p v-if="guidance" class="mt-2 max-w-prose text-pretty text-sm text-muted">{{ t('analysis.empty.guide') }}</p>
      <UButton
        class="mt-5 max-lg:min-h-11"
        color="primary"
        :variant="desktop ? 'solid' : 'outline'"
        :to="`/p/${store.projectId}/manuscript`"
        icon="i-lucide-arrow-right"
        trailing
        :label="t('analysis.empty.toManuscript', { manuscript: term('manuscript').toLocaleLowerCase() })"
      />
    </div>

    <template v-else>
      <div class="mb-6">
        <nav :aria-label="t('analysis.tabs.label')" class="hidden border-b border-default md:block">
          <ul class="-mb-px flex flex-wrap gap-x-6">
            <li v-for="item in tabs" :key="item.value">
              <NuxtLink
                :to="tabQuery(item.value)"
                replace
                :aria-current="tab === item.value ? 'page' : undefined"
                class="inline-flex min-h-11 items-center gap-1.5 border-b-2 text-sm font-medium whitespace-nowrap transition-colors duration-150"
                :class="tab === item.value ? 'border-primary text-highlighted' : 'border-transparent text-muted hover:text-default'"
              >
                <!-- Icons only where every label fits beside them. -->
                <UIcon :name="item.icon!" class="hidden size-4 shrink-0 xl:block" :class="tab === item.value ? 'text-primary' : ''" />
                {{ item.label }}
              </NuxtLink>
            </li>
          </ul>
        </nav>
        <USelect
          v-model="tab"
          :items="tabs"
          value-key="value"
          :icon="tabs.find(item => item.value === tab)?.icon"
          :aria-label="t('analysis.tabs.label')"
          class="w-full md:hidden"
          size="lg"
          :ui="{ base: 'text-base min-h-11' }"
        />
      </div>

      <AnalysisLengths v-if="tab === 'lengths'" :summary="lengthSummary" />

      <div v-else-if="emptyTab" class="max-w-xl">
        <p class="text-pretty text-default">{{ emptyTab }}</p>
        <UButton v-if="emptyTabLink" class="mt-3 px-0 max-lg:min-h-11" variant="link" color="neutral" trailing-icon="i-lucide-arrow-right" :to="emptyTabLink" :label="tabLabel" />
      </div>

      <section v-else-if="tab === 'characters'" aria-labelledby="analysis-characters">
        <h2 id="analysis-characters" class="sr-only">{{ term('characters') }}</h2>
        <div class="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div class="max-w-prose text-pretty">
            <p class="text-default">{{ characterPresence.text }}</p>
            <p v-if="characterPresence.absent" class="text-sm text-muted">{{ characterPresence.absent }}</p>
          </div>
          <USwitch
            v-if="minorCount"
            v-model="showMinor"
            :label="t('analysis.characters.showMinor', { n: minorCount }, minorCount)"
            :ui="{ root: 'items-center max-lg:-my-3', label: 'max-lg:py-3' }"
          />
        </div>
        <AnalysisMatrix
          :rows="characterRows"
          :columns="columns"
          :groups="groups"
          :row-header="term('character')"
          :caption="t('analysis.matrix.caption', { what: term('characters') })"
          :chapter-scenes="chapterScenes"
        />
      </section>

      <section v-else-if="tab === 'locations' || tab === 'objects' || tab === 'strands'" :aria-label="tabLabel">
        <div class="mb-4 max-w-prose text-pretty">
          <p class="text-default">{{ entityPresence.text }}</p>
          <p v-if="entityPresence.absent" class="text-sm text-muted">{{ entityPresence.absent }}</p>
        </div>
        <AnalysisMatrix
          :rows="entityTabRows"
          :columns="columns"
          :groups="groups"
          :row-header="term(tab === 'locations' ? 'location' : tab === 'objects' ? 'object' : 'strand')"
          :caption="t('analysis.matrix.caption', { what: tabLabel })"
          :chapter-scenes="chapterScenes"
        />
      </section>

      <section v-else-if="tab === 'pov'" class="space-y-10" :aria-label="t('analysis.tabs.pov')">
        <div>
          <h2 class="text-base font-semibold text-highlighted">{{ t('analysis.pov.values') }}</h2>
          <p v-if="povLine" class="mt-1 mb-4 max-w-prose text-pretty text-muted">{{ povLine }}</p>
          <AnalysisMatrix
            :rows="povRows"
            :columns="columns"
            :groups="groups"
            :row-header="t('analysis.pov.value')"
            :caption="t('analysis.pov.values')"
            :chapter-scenes="chapterScenes"
            :legend="false"
          />
        </div>
        <div>
          <h2 class="mb-4 text-base font-semibold text-highlighted">{{ t('analysis.pov.characters') }}</h2>
          <AnalysisMatrix
            :rows="povCharacterRows"
            :columns="columns"
            :groups="groups"
            :row-header="term('character')"
            :caption="t('analysis.pov.characters')"
            :chapter-scenes="chapterScenes"
          />
        </div>
      </section>

      <section v-else-if="tab === 'status'" :aria-label="t('analysis.tabs.status')">
        <div class="mb-4 max-w-prose text-pretty">
          <p class="text-default">{{ statusLine }}.</p>
          <p class="text-sm text-muted">{{ t('analysis.status.final', { n: finalShare }) }}</p>
        </div>
        <AnalysisMatrix
          :rows="statusRows"
          :columns="columns"
          :groups="groups"
          :row-header="t('analysis.status.header')"
          :caption="t('analysis.status.caption')"
          :chapter-scenes="chapterScenes"
        />
      </section>

      <AnalysisGame v-else-if="tab === 'game'" />
    </template>
  </DPage>
</template>
