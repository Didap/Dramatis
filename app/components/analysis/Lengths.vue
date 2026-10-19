<script setup lang="ts">
import type { LengthSummary } from './analysis-model'

/**
 * Lunghezze (spec 4.6): words and scenes per chapter, under their parts, with the average, the longest
 * and the shortest. Rows with the leader and a thin bar, numbers always written (DESIGN.md "Charts").
 */
const props = defineProps<{ summary: LengthSummary }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { words, scenes, number } = useFormat()

const showScenes = ref(false)

const maxSceneWords = computed(() => Math.max(1, ...props.summary.chapters.flatMap(c => c.scenes.map(s => s.wordCount))))
const width = (value: number, max: number) => `${max ? Math.max(value ? 1.5 : 0, (value / max) * 100) : 0}%`

/** Chapters under the heading of their part, when the project uses parts. */
const blocks = computed(() => {
  const list: { id: string, title: string, words: number, scenes: number, chapters: LengthSummary['chapters'] }[] = []
  for (const item of props.summary.chapters) {
    const id = item.chapter.partId ?? ''
    let block = list.at(-1)
    if (!block || block.id !== id) {
      const part = id ? store.get('parts', id) : undefined
      block = { id, title: id ? (part?.title || t('common.untitled.part')) : '', words: 0, scenes: 0, chapters: [] }
      list.push(block)
    }
    block.chapters.push(item)
    block.words += item.words
    block.scenes += item.scenes.length
  }
  return list
})

const quote = (title: string, fallback: string) => title || fallback
const longest = computed(() => props.summary.longestChapter)
const shortest = computed(() => props.summary.shortestChapter)
</script>

<template>
  <div class="max-w-3xl">
    <div class="space-y-1 text-pretty text-default">
      <p v-if="summary.sceneCount">{{ t('analysis.lengths.average', { chapter: words(summary.averagePerChapter), scene: words(summary.averagePerScene) }) }}</p>
      <p v-if="longest && shortest && longest !== shortest" class="text-muted">
        {{ t('analysis.lengths.chapterRange', {
          longest: quote(longest.chapter.title, t('common.untitled.chapter')),
          longestWords: words(longest.words),
          shortest: quote(shortest.chapter.title, t('common.untitled.chapter')),
          shortestWords: words(shortest.words),
        }) }}
      </p>
      <p v-if="summary.longestScene && summary.longestScene.wordCount" class="text-muted">
        {{ t('analysis.lengths.longestScene', { title: quote(summary.longestScene.title, t('common.untitled.scene')), words: words(summary.longestScene.wordCount) }) }}
      </p>
    </div>

    <div class="mt-6 flex items-center justify-between gap-4">
      <h2 class="text-base font-semibold text-highlighted">{{ t('analysis.lengths.byChapter') }}</h2>
      <USwitch
        v-model="showScenes"
        :label="t('analysis.lengths.showScenes', { scenes: term('scene', 2).toLocaleLowerCase() })"
        :ui="{ root: 'items-center', label: 'max-lg:py-3' }"
      />
    </div>

    <div class="mt-3 space-y-6">
      <section v-for="block in blocks" :key="block.id" :aria-label="block.title || undefined">
        <div v-if="block.title" class="flex items-baseline gap-3 border-b border-default pb-1.5">
          <h3 class="voice-author font-semibold! text-highlighted">{{ block.title }}</h3>
          <DLeader />
          <span class="shrink-0 text-sm text-muted">{{ t('analysis.lengths.partTotals', { scenes: scenes(block.scenes), words: words(block.words) }) }}</span>
        </div>
        <ol class="mt-1">
          <li v-for="item in block.chapters" :key="item.chapter.id" class="py-1">
            <NuxtLink
              :to="store.refPath({ type: 'chapter', id: item.chapter.id })"
              class="group flex items-baseline gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 -mx-2 hover:bg-elevated focus-visible:bg-elevated"
            >
              <span class="tabular w-6 shrink-0 text-end text-sm text-muted">{{ number(item.chapter.number) }}</span>
              <span class="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
                <span class="voice-author block truncate font-semibold! text-highlighted sm:min-w-0 sm:flex-initial">{{ item.chapter.title || t('common.untitled.chapter') }}</span>
                <span v-if="item === longest && longest !== shortest" class="me-2 shrink-0 text-xs text-muted">{{ t('analysis.lengths.longest') }}</span>
                <span v-else-if="item === shortest && longest !== shortest" class="me-2 shrink-0 text-xs text-muted">{{ t('analysis.lengths.shortest') }}</span>
                <DLeader class="hidden sm:block" />
                <span class="mt-0.5 flex shrink-0 gap-3 text-sm text-muted sm:mt-0">
                  <span>{{ scenes(item.scenes.length) }}</span>
                  <span class="min-w-20 text-end text-default">{{ words(item.words) }}</span>
                </span>
              </span>
            </NuxtLink>
            <div class="ms-9 h-0.5 rounded-full bg-elevated" aria-hidden="true">
              <div class="h-full rounded-full bg-(--ui-text-dimmed)" :style="{ width: width(item.words, summary.maxChapterWords) }" />
            </div>
            <ol v-if="showScenes && item.scenes.length" class="ms-9 mt-1.5 mb-1 space-y-0.5">
              <li v-for="scene in item.scenes" :key="scene.id">
                <!-- The status in words and glyph (DESIGN.md "Statuses"), after the words; under the title on a phone. -->
                <NuxtLink
                  :to="store.refPath({ type: 'scene', id: scene.id })"
                  class="group -mx-2 flex items-baseline rounded-[calc(var(--ui-radius)*1.5)] px-2 py-1 text-sm hover:bg-elevated focus-visible:bg-elevated max-lg:min-h-11"
                >
                  <span class="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
                    <span class="voice-author block truncate text-default sm:min-w-0">{{ scene.title || t('common.untitled.scene') }}</span>
                    <DLeader class="hidden sm:block" />
                    <span class="mt-0.5 flex shrink-0 items-center gap-3 text-muted sm:mt-0">
                      <span class="sm:min-w-20 sm:text-end">{{ words(scene.wordCount) }}</span>
                      <DStatusBadge :value="scene.status" class="max-sm:order-first sm:w-24" />
                    </span>
                  </span>
                </NuxtLink>
                <div class="h-0.5 rounded-full bg-elevated" aria-hidden="true">
                  <div class="h-full rounded-full bg-(--ui-border-accented)" :style="{ width: width(scene.wordCount, maxSceneWords) }" />
                </div>
              </li>
            </ol>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>
