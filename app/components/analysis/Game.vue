<script setup lang="ts">
import { SCENE_KINDS } from '#shared/utils/constants'
import { chapterColumns, distribute, rowTotal } from './analysis-model'
import type { ChapterColumn, MatrixRow } from './analysis-model'
import { useDialogueStats } from './dialogue-stats'

/**
 * The game tab (spec 4.6, P1): scene kinds per act, choices per scene, the endings, lines and words
 * per speaker. Each part shows only with its module (scene_kinds, branching, script).
 */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const { words, scenes: scenesText } = useFormat()
const { analysis } = useFlow()

const NO_ACT = '__none'

// ---------------------------------------------------------------- scene kinds per act

const byAct = computed(() => store.orderedChapters.some(c => c.partId))

const actColumns = computed<ChapterColumn[]>(() => {
  if (!byAct.value) return chapterColumns(store.orderedChapters)
  const columns: ChapterColumn[] = store.orderedParts.map((part, i) => ({ id: part.id, number: i + 1, title: part.title, partId: part.id }))
  if (store.orderedChapters.some(c => !c.partId)) columns.push({ id: NO_ACT, number: columns.length + 1, title: t('analysis.game.noAct'), partId: null })
  return columns
})

const columnOf = (scene: { chapterId: string }) => (byAct.value ? (store.get('chapters', scene.chapterId)?.partId ?? NO_ACT) : scene.chapterId)

const kindRows = computed<MatrixRow[]>(() => {
  const spread = distribute(store.orderedScenes, s => [s.kind], columnOf)
  return SCENE_KINDS.filter(kind => spread.has(kind)).map(kind => ({
    id: kind,
    label: label('sceneKind', kind),
    icon: SCENE_KIND_ICONS[kind],
    cells: spread.get(kind)!,
    total: rowTotal(spread.get(kind)),
  }))
})

const scenesPerColumn = computed(() => {
  const counts = new Map<string, number>(actColumns.value.map(c => [c.id, 0]))
  for (const scene of store.orderedScenes) {
    const column = columnOf(scene)
    counts.set(column, (counts.get(column) ?? 0) + 1)
  }
  return counts
})

// ---------------------------------------------------------------- choices and endings

const choiceRows = computed(() => {
  const flow = analysis.value
  const out = new Map<string, number>()
  const incoming = new Map<string, number>()
  for (const edge of flow?.edges ?? []) {
    // Ways in count the continuation too; choices out are the explicit ones.
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
    if (edge.linkId) out.set(edge.from, (out.get(edge.from) ?? 0) + 1)
  }
  const continues = new Set((flow?.edges ?? []).filter(e => !e.linkId).map(e => e.from))
  return store.orderedScenes.map(scene => ({
    scene,
    out: out.get(scene.id) ?? 0,
    incoming: incoming.get(scene.id) ?? 0,
    continues: continues.has(scene.id),
    start: store.project?.startSceneId === scene.id,
    unreachable: !!flow?.unreachable.includes(scene.id),
    deadEnd: !!flow?.deadEnds.includes(scene.id),
  }))
})

const choiceTotal = computed(() => choiceRows.value.reduce((n, r) => n + r.out, 0))
const branchPoints = computed(() => choiceRows.value.filter(r => r.out >= 2).length)

const endings = computed(() => {
  const flow = analysis.value
  return choiceRows.value
    .filter(r => r.scene.ending)
    .map(r => ({ ...r, reachable: flow?.hasStart ? flow.reachable.has(r.scene.id) : null }))
})

// ---------------------------------------------------------------- lines and words per speaker

const { load, speakers, unattributed, totalLines, loading, failed } = useDialogueStats(() => store.modules.script)
const maxLines = computed(() => Math.max(1, ...speakers.value.map(s => s.lines)))

const barWidth = (value: number, max: number) => `${Math.max(value ? 3 : 0, (value / max) * 100)}%`

// Resolved here, where Nuxt turns it into an import (resolved in the template it renders a dead tag).
const Link = resolveComponent('NuxtLink')
</script>

<template>
  <div class="space-y-12">
    <section v-if="store.modules.scene_kinds && kindRows.length" aria-labelledby="game-kinds">
      <h2 id="game-kinds" class="text-base font-semibold text-highlighted">
        {{ byAct ? t('analysis.game.kindsByAct', { act: term('part').toLocaleLowerCase() }) : t('analysis.game.kindsByChapter') }}
      </h2>
      <p class="mt-1 mb-4 max-w-prose text-pretty text-muted">{{ t('analysis.game.kindsHint') }}</p>
      <AnalysisMatrix
        :rows="kindRows"
        :columns="actColumns"
        :row-header="t('analysis.game.kind')"
        :caption="byAct ? t('analysis.game.kindsByAct', { act: term('part').toLocaleLowerCase() }) : t('analysis.game.kindsByChapter')"
        :chapter-scenes="scenesPerColumn"
        :column-term="byAct ? term('part') : undefined"
        :footer-label="byAct ? t('analysis.game.actScenes', { act: term('part').toLocaleLowerCase() }) : undefined"
      />
    </section>

    <section v-if="store.modules.branching" aria-labelledby="game-choices" class="max-w-3xl">
      <h2 id="game-choices" class="text-base font-semibold text-highlighted">{{ t('analysis.game.choices') }}</h2>
      <p class="mt-1 max-w-prose text-pretty text-muted">
        {{ t('analysis.game.choicesSummary', { choices: t('analysis.game.choiceCount', { n: choiceTotal }, choiceTotal), scenes: scenesText(choiceRows.length) }) }}
        {{ t('analysis.game.branchPoints', { n: branchPoints }, branchPoints) }}
      </p>
      <ol class="mt-4">
        <li v-for="row in choiceRows" :key="row.scene.id" class="py-0.5">
          <NuxtLink
            :to="store.refPath({ type: 'scene', id: row.scene.id })"
            class="group -mx-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 hover:bg-elevated focus-visible:bg-elevated max-lg:min-h-11 max-lg:content-center sm:flex-nowrap"
          >
            <span class="w-10 shrink-0 font-mono text-xs text-dimmed">{{ row.scene.code }}</span>
            <span class="voice-author min-w-0 truncate font-semibold! text-highlighted">{{ row.scene.title || t('common.untitled.scene') }}</span>
            <span class="flex shrink-0 flex-wrap gap-x-2.5 text-xs text-muted">
              <span v-if="row.start" class="inline-flex items-center gap-1"><UIcon name="i-lucide-play" class="size-3.5" />{{ t('analysis.game.start') }}</span>
              <span v-if="row.scene.ending" class="inline-flex items-center gap-1"><UIcon name="i-lucide-flag" class="size-3.5" />{{ term('ending') }}</span>
              <span v-if="row.continues" class="inline-flex items-center gap-1"><UIcon name="i-lucide-corner-down-right" class="size-3.5" />{{ t('analysis.game.continues') }}</span>
              <span v-if="row.unreachable" class="inline-flex items-center gap-1 text-warning"><UIcon name="i-lucide-unlink" class="size-3.5" />{{ t('analysis.game.unreachable') }}</span>
              <span v-if="row.deadEnd" class="inline-flex items-center gap-1 text-warning"><UIcon name="i-lucide-octagon-x" class="size-3.5" />{{ t('analysis.game.deadEnd') }}</span>
            </span>
            <DLeader class="hidden sm:block" />
            <span class="ms-13 flex shrink-0 gap-3 text-sm sm:ms-0">
              <span :class="row.out ? 'text-default' : 'text-dimmed'">{{ t('analysis.game.choiceCount', { n: row.out }, row.out) }}</span>
              <span class="text-muted">{{ t('analysis.game.incoming', { n: row.incoming }, row.incoming) }}</span>
            </span>
          </NuxtLink>
        </li>
      </ol>
    </section>

    <section v-if="store.modules.branching" aria-labelledby="game-endings" class="max-w-3xl">
      <h2 id="game-endings" class="text-base font-semibold text-highlighted">{{ term('ending', 2) }}</h2>
      <p v-if="!endings.length" class="mt-1 max-w-prose text-pretty text-muted">{{ t('analysis.game.noEndings') }}</p>
      <ul v-else class="mt-3">
        <li v-for="row in endings" :key="row.scene.id">
          <NuxtLink
            :to="store.refPath({ type: 'scene', id: row.scene.id })"
            class="group -mx-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-[calc(var(--ui-radius)*2)] px-2 py-2 hover:bg-elevated focus-visible:bg-elevated max-lg:min-h-11 max-lg:content-center sm:flex-nowrap"
          >
            <UIcon name="i-lucide-flag" class="size-4 shrink-0 self-center text-muted" />
            <span class="min-w-0 truncate">
              <span class="voice-author font-semibold! text-highlighted">{{ row.scene.endingLabel || row.scene.title || t('common.untitled.scene') }}</span>
              <span v-if="row.scene.endingLabel && row.scene.title && row.scene.title !== row.scene.endingLabel" class="voice-author text-muted italic">, {{ row.scene.title }}</span>
            </span>
            <DLeader class="hidden sm:block" />
            <span class="flex shrink-0 items-center gap-3 text-sm">
              <span class="text-muted">{{ t('analysis.game.incoming', { n: row.incoming }, row.incoming) }}</span>
              <span v-if="row.reachable === true" class="inline-flex items-center gap-1 text-toned"><UIcon name="i-lucide-check" class="size-4 text-(--ui-success)" />{{ t('analysis.game.reachable') }}</span>
              <span v-else-if="row.reachable === false" class="inline-flex items-center gap-1 text-warning"><UIcon name="i-lucide-unlink" class="size-4" />{{ t('analysis.game.unreachableEnding') }}</span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section v-if="store.modules.script" aria-labelledby="game-speakers" class="max-w-3xl">
      <h2 id="game-speakers" class="text-base font-semibold text-highlighted">{{ t('analysis.game.speakers') }}</h2>
      <p v-if="loading" class="mt-2 flex items-center gap-2 text-sm text-muted" role="status">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t('analysis.game.reading') }}
      </p>
      <template v-else>
        <p v-if="totalLines || !failed" class="mt-1 max-w-prose text-pretty text-muted">
          {{ totalLines ? t('analysis.game.speakersSummary', { speakers: t('analysis.game.speakerCount', { n: speakers.length }, speakers.length), lines: t('analysis.game.lineCount', { n: totalLines }, totalLines) }) : t('analysis.game.noLines') }}
        </p>
        <p v-if="unattributed" class="mt-1 flex items-center gap-1.5 text-sm text-warning">
          <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
          {{ t('analysis.game.unattributed', { n: unattributed }, unattributed) }}
        </p>
        <p v-if="failed" class="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-error">
          <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />
          {{ t('analysis.game.readFailed') }}
          <UButton size="xs" color="error" variant="link" class="max-lg:min-h-11" :label="t('common.actions.retry')" @click="load" />
        </p>
        <ol v-if="speakers.length" class="mt-4">
          <li v-for="speaker in speakers" :key="speaker.key" class="py-0.5">
            <component
              :is="speaker.characterId ? Link : 'div'"
              :to="speaker.characterId ? store.refPath({ type: 'character', id: speaker.characterId }) : undefined"
              class="group -mx-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 max-lg:min-h-11 max-lg:content-center sm:flex-nowrap"
              :class="speaker.characterId ? 'hover:bg-elevated focus-visible:bg-elevated' : ''"
            >
              <DColorDot :color="speaker.characterId ? store.get('characters', speaker.characterId)?.color : null" size="sm" class="self-center" />
              <span class="voice-author min-w-0 truncate font-semibold! text-highlighted">{{ speaker.name }}</span>
              <span class="shrink-0 text-xs text-muted">{{ t('analysis.game.inScenes', { scenes: scenesText(speaker.scenes) }) }}</span>
              <DLeader class="hidden sm:block" />
              <span class="ms-5 flex shrink-0 gap-3 text-sm sm:ms-0">
                <span class="text-default">{{ t('analysis.game.lineCount', { n: speaker.lines }, speaker.lines) }}</span>
                <span class="min-w-20 text-end text-muted">{{ words(speaker.words) }}</span>
              </span>
            </component>
            <div class="ms-5 h-0.5 rounded-full bg-elevated" aria-hidden="true">
              <div class="h-full rounded-full bg-(--ui-text-dimmed)" :style="{ width: barWidth(speaker.lines, maxLines) }" />
            </div>
          </li>
        </ol>
      </template>
    </section>
  </div>
</template>
