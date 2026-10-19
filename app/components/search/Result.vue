<script lang="ts">
import type { SearchMatch } from '~~/server/api/projects/[projectId]/search.get'

/** The page of a search result; a scene opens the editor on its find bar holding the query. */
export function searchLink(projectId: string, match: Pick<SearchMatch, 'type' | 'id' | 'field' | 'section'>, query: string): string {
  const base = `/p/${projectId}`
  switch (match.type) {
    case 'scene': return `${base}/manuscript/scenes/${match.id}?panel=find&q=${encodeURIComponent(query)}`
    case 'chapter': return `${base}/manuscript/chapters/${match.id}`
    case 'part': return `${base}/manuscript`
    case 'architecture': return `${base}/architecture/${match.id}`
    case 'character': return match.field === 'profile' && match.section ? `${base}/characters/${match.id}/${match.section}` : `${base}/characters/${match.id}`
    case 'group': return `${base}/groups/${match.id}`
    case 'location': return `${base}/locations/${match.id}`
    case 'object': return `${base}/objects/${match.id}`
    case 'strand': return `${base}/strands/${match.id}`
    case 'event': return `${base}/timeline?event=${match.id}`
    case 'note': return `${base}/notes/${match.id}`
    case 'codex': return `${base}/codex/${match.id}`
    case 'variable': return `${base}/variables`
  }
}
</script>

<script setup lang="ts">
/**
 * One search result: the item's name in the author's voice, where the words were found, the passage
 * with the words marked. A scene also says where it sits and its status, and opens the editor on
 * the find bar with the query.
 */
const props = defineProps<{
  match: SearchMatch
  query: string
}>()

const store = useProjectStore()
const { t, te } = useI18n()
const { term } = useTerms()
const { number } = useFormat()

const to = computed(() => searchLink(store.projectId, props.match, props.query))

const title = computed(() => {
  if (props.match.type === 'architecture') return term(props.match.id as 'premise' | 'fabula' | 'setting')
  return props.match.title.trim() || t(`search.untitled.${props.match.type}`)
})

/** "Capitolo 3 · S014". */
const place = computed(() => {
  if (props.match.type !== 'scene' || !props.match.chapterId) return ''
  const n = store.chapterNumber(props.match.chapterId)
  const chapter = store.get('chapters', props.match.chapterId)
  const chapterText = n ? `${term('chapter')} ${n}${chapter?.title ? `, ${chapter.title}` : ''}` : ''
  return [chapterText, props.match.code].filter(Boolean).join(' · ')
})

/** Where the words were found, when it is not the obvious place. */
const field = computed(() => {
  const m = props.match
  if (m.field === 'profile' && m.section) {
    const section = t(`profile.sections.${m.section}.title`)
    const question = m.question && te(`profile.sections.${m.section}.questions.${m.question}.label`)
      ? t(`profile.sections.${m.section}.questions.${m.question}.label`)
      : ''
    return question ? t('search.fields.profileQuestion', { section, question }) : t('search.fields.profile', { section })
  }
  if (m.field === 'title' || m.field === 'text') return ''
  return te(`search.fields.${m.field}`) ? t(`search.fields.${m.field}`) : ''
})
</script>

<template>
  <NuxtLink :to="to" class="search-result group block rounded-[calc(var(--ui-radius)*2)] px-2 py-2.5 hover:bg-elevated focus-visible:bg-elevated">
    <span class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span class="voice-author font-semibold text-highlighted"><SearchHighlighted :text="title" :marks="match.titleMarks" /></span>
      <span v-if="place" class="text-xs text-muted">{{ place }}</span>
      <DStatusBadge v-if="match.type === 'scene' && match.status" :value="match.status" kind="scene" class="text-xs" />
      <!-- The name meets its number along the leader (below 40rem the count just follows). -->
      <template v-if="match.count > 1">
        <DLeader class="hidden sm:block" />
        <span class="tabular text-xs text-dimmed">{{ t('search.occurrences', { n: number(match.count) }, match.count) }}</span>
      </template>
    </span>
    <span v-if="match.snippet" class="mt-1 block text-pretty">
      <span v-if="field" class="me-1.5 text-xs font-medium text-muted">{{ field }}</span>
      <span class="voice-author text-[0.9375rem] leading-relaxed text-toned"><SearchHighlighted :text="match.snippet" :marks="match.marks" /></span>
    </span>
  </NuxtLink>
</template>
