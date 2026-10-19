<script setup lang="ts">
import type { SceneContent, Scene } from '#shared/types/entities'
import { richToPlainText } from '#shared/utils/richtext'

/**
 * "Riprendi" (spec 4.2): the one card of the overview. The scene last written, where it sits in the
 * work, the last words the author left on it, and the way back in. Its button is the view's one
 * solid control on a desktop; on a phone that is the bar's "Aggiungi", so here it is outlined.
 */
const props = defineProps<{
  scene: Scene
  /** Never written yet: the first scene of the work, to begin with. */
  fresh?: boolean
}>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { words, relative, time } = useFormat()
const desktop = useIsDesktop()

const chapter = computed(() => store.get('chapters', props.scene.chapterId))
const position = computed(() => {
  const pieces: string[] = []
  const partIndex = chapter.value?.partId ? store.orderedParts.findIndex(p => p.id === chapter.value!.partId) : -1
  if (partIndex >= 0) pieces.push(`${term('part')} ${partIndex + 1}`)
  const chapterNumber = store.chapterNumber(props.scene.chapterId)
  if (chapterNumber) pieces.push(`${term('chapter')} ${chapterNumber}`)
  pieces.push(`${term('scene')} ${store.chapterScenes(props.scene.chapterId).findIndex(s => s.id === props.scene.id) + 1}`)
  return pieces.join(' · ')
})

const to = computed(() => store.refPath({ type: 'scene', id: props.scene.id }))

/** "ieri, 22:14", "3 ore fa". */
const edited = computed(() => {
  if (!props.scene.editedAt) return ''
  const age = Date.now() - new Date(props.scene.editedAt).getTime()
  if (age < 45_000) return t('overview.resume.editedNow')
  const when = age >= 86_400_000 && age < 7 * 86_400_000 ? `${relative(props.scene.editedAt)}, ${time(props.scene.editedAt)}` : relative(props.scene.editedAt)
  return t('overview.resume.edited', { when })
})

// The last words written, to pick up the thread: the end of the text must show, so the excerpt
// keeps as many trailing characters as three lines hold at the card's width.
const text = ref('')
watch(() => [props.scene.id, props.scene.editedAt], async () => {
  text.value = ''
  if (!props.scene.wordCount) return
  try {
    const content = await $fetch<SceneContent>(`/api/projects/${store.projectId}/scenes/${props.scene.id}/content`)
    text.value = richToPlainText(content.content, { speakers: false }).replace(/\s+/g, ' ').trim().slice(-600)
  }
  catch {}
}, { immediate: true })

const box = useTemplateRef<HTMLElement>('box')
const { width } = useElementSize(box)
/** Characters per line from the manuscript face's average character (DESIGN.md "The manuscript"), with room for wrapping. */
const room = computed(() => {
  const fontSize = box.value ? Number.parseFloat(getComputedStyle(box.value).fontSize) || 17 : 17
  const perLine = width.value ? width.value / (fontSize * 0.462) : 60
  return Math.max(60, Math.floor(perLine * 3 * 0.85))
})
const excerpt = computed(() => {
  if (text.value.length <= room.value) return text.value
  const tail = text.value.slice(-room.value)
  const space = tail.indexOf(' ')
  return `…${tail.slice(space > 0 && space < 30 ? space + 1 : 0)}`
})
</script>

<template>
  <article class="overview-resume rounded-[calc(var(--ui-radius)*2)] border border-default bg-muted/60 p-5 sm:p-6">
    <p class="position-line">{{ position }}</p>
    <h2 class="voice-author mt-2 text-2xl leading-tight font-semibold text-balance text-highlighted">
      {{ scene.title || t('common.untitled.scene') }}
    </h2>
    <!-- At most three lines, aligned to the bottom: if the estimate runs long, the start is what hides. -->
    <div v-if="excerpt" ref="box" class="voice-author mt-3 flex max-h-[4.875em] flex-col justify-end overflow-hidden text-[1.0625rem] leading-[1.625]">
      <p class="shrink-0 text-pretty text-toned">{{ excerpt }}</p>
    </div>
    <p v-else-if="scene.synopsis" class="voice-author mt-3 line-clamp-2 text-pretty text-muted italic">{{ scene.synopsis }}</p>
    <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <UButton
        :to="to"
        color="primary"
        :variant="desktop ? 'solid' : 'outline'"
        size="lg"
        :icon="fresh ? 'i-lucide-pen-line' : 'i-lucide-corner-down-right'"
        :label="fresh ? t('overview.resume.start') : t('overview.resume.action')"
        class="justify-center max-lg:min-h-11 sm:justify-start"
      />
      <p class="text-sm text-muted">
        {{ words(scene.wordCount) }}<template v-if="edited"> · {{ edited }}</template>
      </p>
    </div>
  </article>
</template>
