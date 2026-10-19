<script setup lang="ts">
import type { Scene, SceneContent } from '#shared/types/entities'
import { useManuscriptStructure } from './Structure.vue'

/**
 * The reading view of a chapter (spec 4.5, `?view=read`): the active text of every scene in order,
 * read only, in the account's manuscript typography, so the last chapter can be read back on the
 * train. Each scene opens in the editor from its heading, or with a tap on its text. In a game, the
 * choices that close a scene are listed under it, as the player would meet them.
 */
const props = defineProps<{ chapterId: string }>()

const { t } = useI18n()
const store = useProjectStore()
const structure = useManuscriptStructure()

const scenes = computed(() => store.chapterScenes(props.chapterId))

interface Loaded { status: 'loading' | 'ready' | 'error', content: SceneContent['content'], stamp: string }
const texts = reactive(new Map<string, Loaded>())

/** A scene's text is fetched again when it was saved since (another device, or the editor). */
const stampOf = (scene: Scene) => `${scene.currentRevisionId}:${scene.editedAt ?? ''}:${scene.wordCount}`

async function load(scene: Scene) {
  const stamp = stampOf(scene)
  texts.set(scene.id, { status: 'loading', content: texts.get(scene.id)?.content ?? null, stamp })
  try {
    const data = await $fetch<SceneContent>(`/api/projects/${store.projectId}/scenes/${scene.id}/content`)
    texts.set(scene.id, { status: 'ready', content: data.content, stamp })
  }
  catch {
    texts.set(scene.id, { status: 'error', content: null, stamp })
  }
}

watch(scenes, async (list) => {
  const stale = list.filter(s => texts.get(s.id)?.stamp !== stampOf(s))
  // A few at a time: a long chapter should not flood the server.
  for (let i = 0; i < stale.length; i += 3) await Promise.all(stale.slice(i, i + 3).map(load))
}, { immediate: true })

// ---------------------------------------------------------------- the account's manuscript typography

// The same preferences as the editor (its "Aa" menu), so a chapter reads back as it was written.
const { prefs: typography, load: loadTypography } = useEditorTypography()
onMounted(() => { void loadTypography() })

const MEASURE = { narrow: 60, medium: 70, wide: 80 } as const
const style = computed(() => {
  const prefs = typography.value
  const sans = prefs.font === 'sans'
  return {
    ...(prefs.font ? { '--manuscript-font': sans ? 'var(--font-readable)' : 'var(--font-serif)', '--manuscript-avg-char': sans ? '0.433em' : '0.462em' } : {}),
    ...(prefs.size ? { '--manuscript-size': `${prefs.size / 16}rem` } : {}),
    ...(prefs.lineHeight ? { '--manuscript-leading': String(prefs.lineHeight) } : {}),
    ...(prefs.width ? { '--manuscript-measure': String(MEASURE[prefs.width] ?? 70) } : {}),
  }
})

// ---------------------------------------------------------------- choices (module branching)

function choicesOf(sceneId: string) {
  if (!store.modules.branching) return []
  return store.rows.links
    .filter(l => l.fromSceneId === sceneId)
    .sort((a, b) => a.position - b.position)
    .map(link => ({
      id: link.id,
      text: link.label.trim(),
      target: store.get('scenes', link.toSceneId),
      conditional: link.conditions.clauses.length > 0,
    }))
}

function openScene(event: MouseEvent, scene: Scene) {
  // A tap on the text opens the scene, unless the reader was selecting words.
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) return
  if ((event.target as HTMLElement).closest('a, button')) return
  void navigateTo(store.refPath({ type: 'scene', id: scene.id }))
}

/** Between scenes and at a break inside one, the separator the exports print (Settings, Writing), or three spaced asterisks. */
const separator = computed(() => store.project?.settings.sceneSeparator?.trim() || '*  *  *')

const nextChapter = computed(() => {
  const order = store.orderedChapters
  return order[order.findIndex(c => c.id === props.chapterId) + 1]
})

/** "Capitolo IV, «Il mercato»", numbered as the project numbers its chapters. */
const nextLabel = computed(() => {
  if (!nextChapter.value) return ''
  const title = structure.chapterTitle(nextChapter.value)
  const position = structure.chapterPosition(store.chapterNumber(nextChapter.value.id))
  return position ? t('manuscript.page.chapterLabel', { n: position, title }) : t('manuscript.quoted', { text: title })
})
</script>

<template>
  <!-- The frame clips what would stick out sideways (line ids in the margin, with a very wide measure). -->
  <div class="manuscript-reading-frame">
    <div class="manuscript-reading mx-auto" :style="style" :lang="store.project?.language || undefined" :data-sized="typography.size ? '' : undefined">
      <p v-if="!scenes.length" class="py-10 text-center text-muted">{{ t('manuscript.reading.empty') }}</p>

      <article
        v-for="(scene, index) in scenes"
        :key="scene.id"
        class="manuscript-reading-scene"
        :aria-labelledby="`reading-${scene.id}`"
      >
        <header class="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="position-line">{{ t('manuscript.position.scene', { n: index + 1 }) }}</span>
          <NuxtLink
            :id="`reading-${scene.id}`"
            :to="store.refPath({ type: 'scene', id: scene.id })"
            class="group/open inline-flex min-w-0 items-baseline gap-1.5 text-sm text-toned hover:text-highlighted max-lg:min-h-11 max-lg:items-center"
          >
            <span class="voice-author truncate" :class="scene.title.trim() ? '' : 'italic'">{{ structure.sceneTitle(scene) }}</span>
            <UIcon name="i-lucide-square-pen" class="size-3.5 shrink-0 self-center text-dimmed group-hover/open:text-primary" aria-hidden="true" />
            <span class="sr-only">{{ t('manuscript.reading.open') }}</span>
          </NuxtLink>
          <DStatusBadge :value="scene.status" class="text-xs" />
        </header>

        <div class="cursor-text" @click="openScene($event, scene)">
          <ManuscriptProse v-if="texts.get(scene.id)?.status === 'ready' && texts.get(scene.id)?.content && scene.wordCount" :doc="texts.get(scene.id)!.content" :separator="separator" :line-ids="store.modules.script" />
          <div v-else-if="!texts.get(scene.id) || (texts.get(scene.id)?.status === 'loading' && !texts.get(scene.id)?.content)" class="space-y-2.5" :aria-label="t('manuscript.reading.loading')" role="status">
            <USkeleton v-for="i in 4" :key="i" class="h-4" :class="i === 4 ? 'w-2/3' : 'w-full'" />
          </div>
          <div v-else-if="texts.get(scene.id)?.status === 'error'" class="flex flex-wrap items-center gap-3 text-sm text-error">
            <UIcon name="i-lucide-circle-alert" class="size-4" aria-hidden="true" />
            {{ t('manuscript.reading.error') }}
            <UButton size="xs" color="neutral" variant="outline" class="max-lg:min-h-11" :label="t('common.actions.retry')" @click.stop="load(scene)" />
          </div>
          <div v-else class="space-y-2 text-muted">
            <p class="text-sm">{{ t('manuscript.reading.unwritten') }}</p>
            <p v-if="scene.synopsis.trim()" class="voice-author italic">{{ scene.synopsis }}</p>
          </div>
        </div>

        <!-- In a game: how the scene ends for the player. -->
        <footer v-if="store.modules.branching && (choicesOf(scene.id).length || scene.ending)" class="mt-5 space-y-1.5 text-sm">
          <p v-if="scene.ending" class="inline-flex items-center gap-1.5 font-medium text-toned">
            <UIcon name="i-lucide-flag" class="size-4 text-muted" aria-hidden="true" />
            {{ t('manuscript.reading.ending') }}<template v-if="scene.endingLabel.trim()">: <span class="voice-author font-normal italic">{{ scene.endingLabel }}</span></template>
          </p>
          <template v-if="choicesOf(scene.id).length">
            <p class="text-xs font-medium text-muted">{{ t('manuscript.reading.choices') }}</p>
            <ul class="space-y-1">
              <li v-for="choice in choicesOf(scene.id)" :key="choice.id" class="flex items-baseline gap-2">
                <UIcon name="i-lucide-corner-down-right" class="size-3.5 shrink-0 self-center text-dimmed" aria-hidden="true" />
                <span class="min-w-0">
                  <span v-if="choice.text" class="voice-author italic text-default">{{ t('manuscript.quoted', { text: choice.text }) }}</span>
                  <span v-else class="text-toned">{{ t('manuscript.reading.continue') }}</span>
                  <span v-if="choice.target" class="text-muted">
                    {{ ' ' }}
                    <NuxtLink :to="store.refPath({ type: 'scene', id: choice.target.id })" class="underline decoration-dotted underline-offset-3 hover:text-highlighted">
                      {{ t('manuscript.reading.towards', { title: structure.sceneTitle(choice.target) }) }}
                    </NuxtLink>
                  </span>
                  <span v-if="choice.conditional" class="ms-1.5 inline-flex items-center gap-1 text-xs text-dimmed">
                    <UIcon name="i-lucide-lock" class="size-3" aria-hidden="true" />{{ t('manuscript.reading.conditional') }}
                  </span>
                </span>
              </li>
            </ul>
          </template>
        </footer>

        <p v-if="index < scenes.length - 1" class="manuscript-reading-break" aria-hidden="true">{{ separator }}</p>
      </article>

      <footer v-if="scenes.length" class="mt-14 flex flex-col items-center gap-3 text-center">
        <p class="position-line">{{ t('manuscript.reading.end') }}</p>
        <UButton
          v-if="nextChapter"
          :to="{ path: store.refPath({ type: 'chapter', id: nextChapter.id }), query: { view: 'read' } }"
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-arrow-right"
          class="max-w-full max-lg:min-h-11"
          :ui="{ label: 'truncate' }"
          :label="t('manuscript.reading.nextChapter', { title: nextLabel })"
        />
      </footer>
    </div>
  </div>
</template>

<style>
.manuscript-reading-frame {
  overflow-x: clip;
}
/* The measure is counted in characters of the manuscript face, at the manuscript size (DESIGN.md). */
.manuscript-reading {
  font-size: var(--manuscript-size);
  max-width: calc(var(--manuscript-measure) * var(--manuscript-avg-char));
}
@media (max-width: 639.98px) {
  .manuscript-reading:not([data-sized]) {
    font-size: 1.125rem;
  }
}
.manuscript-reading-break {
  margin: 2.5rem 0;
  text-align: center;
  white-space: pre;
  letter-spacing: 0.3em;
  color: var(--ui-text-muted);
  font-family: var(--manuscript-font);
}
</style>
