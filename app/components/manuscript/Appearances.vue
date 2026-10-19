<script setup lang="ts">
import type { Scene } from '#shared/types/entities'
import { STATUS_TEXT, useManuscriptStructure } from './Structure.vue'

/**
 * CONTRACT (owned by the manuscript feature): the scenes where an entity appears, grouped by chapter
 * in reading order, embedded as <ManuscriptAppearances> in character, location, object, group and
 * strand pages. A character appears where it is tagged (by hand, mentioned, or speaking) and where it
 * is the point of view; a group where any of its members appears; a strand where scenes belong to it.
 * Each scene says why it is listed, and the summary says where the entity first appears.
 */
const props = defineProps<{ entityType: 'character' | 'location' | 'object' | 'strand' | 'group', entityId: string }>()

const { t } = useI18n()
const store = useProjectStore()
const { scenes: sceneCount, chapters: chapterCount, words } = useFormat()
const { label } = useEnums()
const structure = useManuscriptStructure()

interface Appearance {
  scene: Scene
  pov: boolean
  mentions: number
  lines: number
  manual: boolean
  /** Group: the members who appear in the scene. */
  members: { type: string, id: string, name: string, color: string }[]
}

/** Members of a group: membership relationships from the member to the group (spec 0.3). */
const members = computed(() => {
  if (props.entityType !== 'group') return []
  return store.rows.relations
    .filter(r => r.kind === 'membership' && r.targetType === 'group' && r.targetId === props.entityId)
    .map(r => ({ type: r.sourceType, id: r.sourceId, item: store.getRef({ type: r.sourceType, id: r.sourceId }) as { name?: string, color?: string } | undefined }))
    .filter(m => m.item)
    .map(m => ({ type: m.type, id: m.id, name: m.item!.name ?? '', color: m.item!.color ?? '' }))
})

function appearanceIn(scene: Scene): Appearance | null {
  const base = { scene, pov: false, mentions: 0, lines: 0, manual: false, members: [] as Appearance['members'] }
  switch (props.entityType) {
    case 'character':
    case 'location':
    case 'object': {
      const tag = scene.tags[`${props.entityType}:${props.entityId}`]
      const pov = props.entityType === 'character' && scene.povCharacterId === props.entityId
      if (!tag && !pov) return null
      return { ...base, pov, mentions: tag?.mentions ?? 0, lines: tag?.lines ?? 0, manual: !!tag?.manual }
    }
    case 'strand':
      return scene.strandIds.includes(props.entityId) ? base : null
    case 'group': {
      const present = members.value.filter(m => scene.tags[`${m.type}:${m.id}`] || (m.type === 'character' && scene.povCharacterId === m.id))
      return present.length ? { ...base, members: present } : null
    }
  }
  return null
}

const appearances = computed(() => store.orderedScenes.map(appearanceIn).filter((a): a is Appearance => !!a))

const chapters = computed(() => {
  const groups: { chapterId: string, items: Appearance[] }[] = []
  for (const item of appearances.value) {
    const last = groups.at(-1)
    if (last?.chapterId === item.scene.chapterId) last.items.push(item)
    else groups.push({ chapterId: item.scene.chapterId, items: [item] })
  }
  return groups
})

const first = computed(() => {
  const scene = appearances.value[0]?.scene
  const chapter = scene ? store.get('chapters', scene.chapterId) : undefined
  return chapter ? { n: store.chapterNumber(chapter.id), title: structure.chapterTitle(chapter) } : null
})

const LIMIT = 8
const expanded = ref(false)
watch(() => props.entityId, () => { expanded.value = false })

/** The chapter groups to show: everything, or the first scenes up to the limit. */
const shown = computed(() => {
  if (expanded.value || appearances.value.length <= LIMIT + 2) return chapters.value
  let left = LIMIT
  const out: typeof chapters.value = []
  for (const group of chapters.value) {
    if (left <= 0) break
    out.push({ chapterId: group.chapterId, items: group.items.slice(0, left) })
    left -= group.items.length
  }
  return out
})

const showCode = computed(() => store.modules.branching || store.modules.script)

const emptyText = computed(() => {
  if (props.entityType === 'strand') return t(`manuscript.appearances.empty.strand.${store.kind}`)
  return t(`manuscript.appearances.empty.${props.entityType}`, { at: '@' })
})
</script>

<template>
  <div class="manuscript-appearances text-sm">
    <p v-if="!appearances.length" class="text-muted">{{ emptyText }}</p>

    <template v-else>
      <p class="mb-3 text-muted">
        {{ t('manuscript.appearances.summary', { scenes: sceneCount(appearances.length), chapters: chapterCount(chapters.length) }) }}
        <template v-if="first">{{ t(`manuscript.appearances.first.${entityType}`, first) }}</template>
      </p>

      <div class="space-y-3">
        <section v-for="group in shown" :key="group.chapterId" :aria-label="t('manuscript.appearances.chapter', { n: store.chapterNumber(group.chapterId) })">
          <NuxtLink
            :to="store.refPath({ type: 'chapter', id: group.chapterId })"
            class="flex items-baseline gap-2 rounded-[calc(var(--ui-radius)*2)] px-2 py-1 text-xs text-muted hover:text-default max-lg:min-h-11 max-lg:items-center"
          >
            <span class="tabular shrink-0">{{ t('manuscript.appearances.chapter', { n: store.chapterNumber(group.chapterId) }) }}</span>
            <span class="voice-author truncate text-sm text-toned">{{ structure.chapterTitle(store.get('chapters', group.chapterId)) }}</span>
          </NuxtLink>
          <ul>
            <!-- Why the scene is listed, then its words; the status (icon plus label) closes the row,
                 as in the outline. On a phone the numbers and the status move under the title. -->
            <li v-for="item in group.items" :key="item.scene.id">
              <NuxtLink
                :to="store.refPath({ type: 'scene', id: item.scene.id })"
                class="group flex min-h-11 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1 transition-colors duration-150 hover:bg-elevated sm:min-h-9"
              >
                <span class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
                  <span class="flex min-w-0 items-baseline gap-2">
                    <span v-if="showCode" class="shrink-0 font-mono text-xs text-dimmed">{{ item.scene.code }}</span>
                    <span class="voice-author truncate font-medium" :class="item.scene.title.trim() ? 'text-highlighted' : 'italic text-muted'">{{ structure.sceneTitle(item.scene) }}</span>
                  </span>
                  <DLeader class="hidden sm:block" />
                  <span class="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
                    <span class="inline-flex items-center gap-1 text-toned sm:hidden">
                      <UIcon :name="statusIcon('scene', item.scene.status)" class="size-3.5 shrink-0" :class="STATUS_TEXT[item.scene.status]" aria-hidden="true" />{{ label('sceneStatus', item.scene.status) }}
                    </span>
                    <span v-if="item.pov" class="inline-flex items-center gap-1"><UIcon name="i-lucide-eye" class="size-3.5" aria-hidden="true" />{{ t('manuscript.appearances.pov') }}</span>
                    <span v-if="item.mentions" class="inline-flex items-center gap-1"><UIcon name="i-lucide-at-sign" class="size-3.5" aria-hidden="true" />{{ t('manuscript.appearances.mentions', { n: item.mentions }, item.mentions) }}</span>
                    <span v-if="item.lines" class="inline-flex items-center gap-1"><UIcon name="i-lucide-message-square-quote" class="size-3.5" aria-hidden="true" />{{ t('manuscript.appearances.lines', { n: item.lines }, item.lines) }}</span>
                    <span v-if="item.manual && !item.mentions && !item.lines && !item.pov">{{ t('manuscript.appearances.manual') }}</span>
                    <span v-for="member in item.members" :key="member.id" class="inline-flex items-center gap-1">
                      <DColorDot :color="member.color || null" size="xs" /><span class="voice-author">{{ member.name }}</span>
                    </span>
                    <ManuscriptFigures class="whitespace-nowrap sm:min-w-20 sm:text-end sm:text-sm" :class="item.scene.wordCount ? '' : 'text-dimmed'" :text="words(item.scene.wordCount)" />
                  </span>
                </span>
                <span class="hidden w-28 shrink-0 items-center gap-1.5 sm:inline-flex">
                  <UIcon :name="statusIcon('scene', item.scene.status)" class="size-4 shrink-0" :class="STATUS_TEXT[item.scene.status]" aria-hidden="true" />
                  <span class="truncate text-sm text-toned">{{ label('sceneStatus', item.scene.status) }}</span>
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </div>

      <UButton
        v-if="appearances.length > LIMIT + 2"
        class="mt-2"
        size="sm"
        color="neutral"
        variant="ghost"
        :icon="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :label="expanded ? t('manuscript.appearances.showLess') : t('manuscript.appearances.showAll', { n: appearances.length })"
        @click="expanded = !expanded"
      />
    </template>
  </div>
</template>
