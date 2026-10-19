<script setup lang="ts">
import type { Character } from '#shared/types/entities'
import { CHARACTER_IMPORTANCES } from '#shared/utils/constants'
import { useWorldIntro } from '~/components/world/Intro.vue'

/**
 * The world hub (the phone "Mondo" tab, spec 4.4; on desktop a page outside the sidebar). It opens on
 * the characters, the cast with the main ones in view, then races (module), groups, locations, objects, relationships
 * and the codex (module) as rows with their counts and the item edited last.
 */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { relative, scenes: scenesText } = useFormat()
const mt = (key: string) => t(`world.hub.${store.kind}.${key}`)
const base = computed(() => `/p/${store.projectId}`)
const { visible: introVisible } = useWorldIntro('world')
// On a phone the bottom bar's Aggiungi is the screen's one solid control.
const desktop = useIsDesktop()

function latest<T extends { updatedAt: string }>(rows: readonly T[]): T | undefined {
  let found: T | undefined
  for (const row of rows) if (!found || row.updatedAt > found.updatedAt) found = row
  return found
}

/** Scenes where each character appears: tagged (manual, mentioned, speaking) or as point of view. */
const sceneCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const scene of store.rows.scenes) {
    const ids = new Set(scene.characterIds)
    if (scene.povCharacterId) ids.add(scene.povCharacterId)
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
})

const CAST_SIZE = 6

/** The main characters (or, without any, the first ones), in the order of the characters page. */
const cast = computed<Character[]>(() => {
  const ordered = [...store.rows.characters].sort((a, b) =>
    CHARACTER_IMPORTANCES.indexOf(a.importance) - CHARACTER_IMPORTANCES.indexOf(b.importance) || a.position - b.position)
  const main = ordered.filter(c => c.importance === 'main')
  return (main.length ? main : ordered).slice(0, CAST_SIZE)
})

/** Relationships whose two ends both exist (a trashed entity hides its relationships). */
const relations = computed(() =>
  store.rows.relations.filter(r => store.getRef({ type: r.sourceType, id: r.sourceId }) && store.getRef({ type: r.targetType, id: r.targetId })))

interface HubSection {
  key: string
  label: string
  icon: string
  to: string
  count: number
  last?: { name: string, when: string }
}

function section<T extends { updatedAt: string }>(key: keyof typeof SECTION_ICONS, label: string, rows: readonly T[], nameOf: (row: T) => string): HubSection {
  const last = latest(rows)
  return {
    key,
    label,
    icon: SECTION_ICONS[key],
    to: `${base.value}/${key}`,
    count: rows.length,
    last: last ? { name: nameOf(last), when: relative(last.updatedAt) } : undefined,
  }
}

const sections = computed<HubSection[]>(() => [
  ...(store.modules.races ? [section('races', term('races'), store.rows.groups.filter(g => store.isRace(g.id)), g => g.name)] : []),
  section('groups', term('groups'), store.rows.groups.filter(g => !store.isRace(g.id)), g => g.name),
  section('locations', term('locations'), store.rows.locations, l => l.name),
  section('objects', term('objects'), store.rows.objects, o => o.name),
  section('relations', term('relations'), relations.value, r => t('world.hub.relation', {
    from: store.refLabel({ type: r.sourceType, id: r.sourceId }),
    to: store.refLabel({ type: r.targetType, id: r.targetId }),
  })),
  ...(store.modules.codex ? [section('codex', term('codex'), store.rows.codexEntries, e => e.title)] : []),
])

const empty = computed(() =>
  !store.rows.characters.length && !store.rows.groups.length && !store.rows.locations.length && !store.rows.objects.length)

/** The way to every character, closing the cast (or first among the sections of an empty world). */
const allCharacters = computed(() =>
  section('characters', empty.value ? term('characters') : t('world.hub.allCharacters'), store.rows.characters, c => c.name))
</script>

<template>
  <DPage :title="term('world')">
    <DPageHeader :title="term('world')">
      <template v-if="introVisible && !empty" #description>
        <WorldIntro topic="world" :text="mt('intro')" />
      </template>
    </DPageHeader>

    <div v-if="empty" class="mb-10">
      <p class="max-w-prose text-pretty text-default">{{ mt('intro') }}</p>
      <p class="mt-1 max-w-prose text-pretty text-muted">{{ mt('question') }}</p>
      <UButton
        :to="`${base}/characters`"
        :color="desktop ? 'primary' : 'neutral'"
        :variant="desktop ? 'solid' : 'outline'"
        icon="i-lucide-user-round-plus"
        :label="t('world.hub.startWithCharacters')"
        class="mt-5 max-lg:min-h-11"
      />
    </div>

    <section v-else class="mb-8" aria-labelledby="world-cast">
      <h2 id="world-cast" class="mb-2 px-2 text-lg font-semibold text-highlighted">{{ term('characters') }}</h2>
      <ul v-if="cast.length" role="list" class="space-y-px">
        <li v-for="character in cast" :key="character.id">
          <DRow :to="store.refPath({ type: 'character', id: character.id })" :name="character.name" :epithet="character.tagline || undefined">
            <template #leading>
              <DEntityAvatar :name="character.name" :image-id="store.primaryImage('character', character.id)" :color="character.color || null" size="sm" alt="" />
            </template>
            <template #numbers>
              <span>{{ scenesText(sceneCounts.get(character.id) ?? 0) }}</span>
            </template>
          </DRow>
        </li>
      </ul>
      <p v-else class="px-2 text-sm text-muted">
        {{ t('world.hub.noCharacters') }}
        <NuxtLink :to="`${base}/characters`" class="ms-1 inline-block underline underline-offset-3 hover:text-default max-lg:-my-3 max-lg:py-3">{{ t('world.hub.addCharacter') }}</NuxtLink>
      </p>
      <WorldHubRow class="mt-1" v-bind="allCharacters" />
    </section>

    <nav :aria-label="term('world')">
      <ul role="list" class="space-y-px">
        <li v-if="empty">
          <WorldHubRow v-bind="allCharacters" />
        </li>
        <li v-for="item in sections" :key="item.key">
          <WorldHubRow v-bind="item" />
        </li>
      </ul>
    </nav>
  </DPage>
</template>
