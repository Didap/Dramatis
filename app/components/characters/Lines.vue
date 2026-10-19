<script setup lang="ts">
import type { Character } from '#shared/types/entities'

interface SpokenLine {
  sceneId: string
  lineId: string | null
  direction: string
  text: string
  words: number
}

/**
 * What the character says (module script, spec 4.4 P1): the lines spoken, with their words, scene by
 * scene in reading order, each with its line id for the voice-over script.
 */
const props = defineProps<{ character: Character }>()

const store = useProjectStore()
const { t } = useI18n()
const { words, number } = useFormat()

const SHOWN_PER_SCENE = 3

const lines = ref<SpokenLine[] | null>(null)
const failed = ref(false)
const expanded = ref(new Set<string>())

async function load() {
  failed.value = false
  try {
    const result = await $fetch<{ lines: SpokenLine[] }>(`/api/projects/${store.projectId}/dialogue/lines`, { query: { characterId: props.character.id } })
    lines.value = result.lines
  }
  catch {
    failed.value = true
  }
}
watch(() => props.character.id, load, { immediate: true })

const scenes = computed(() => {
  const byScene = new Map<string, SpokenLine[]>()
  for (const line of lines.value ?? []) {
    const list = byScene.get(line.sceneId)
    if (list) list.push(line)
    else byScene.set(line.sceneId, [line])
  }
  return store.orderedScenes
    .filter(scene => byScene.has(scene.id))
    .map(scene => ({ scene, lines: byScene.get(scene.id)!, words: byScene.get(scene.id)!.reduce((n, l) => n + l.words, 0) }))
})

const totals = computed(() => {
  const list = scenes.value.flatMap(s => s.lines)
  return { lines: list.length, words: list.reduce((n, l) => n + l.words, 0) }
})

/** "5 battute, 29 parole": one message, so a language can order the two as it likes. */
const summary = (lineCount: number, wordCount: number) =>
  t('characters.lines.summary', { lines: t('characters.lines.count', { n: number(lineCount) }, lineCount), words: words(wordCount) })

function toggle(sceneId: string) {
  const next = new Set(expanded.value)
  if (next.has(sceneId)) next.delete(sceneId)
  else next.add(sceneId)
  expanded.value = next
}
</script>

<template>
  <CharactersSection :title="t('characters.lines.title')">
    <template v-if="totals.lines" #actions>
      <span class="text-sm text-muted">{{ summary(totals.lines, totals.words) }}</span>
    </template>

    <div v-if="lines === null && !failed" class="space-y-2" aria-busy="true">
      <USkeleton class="h-5 w-2/3" />
      <USkeleton class="h-4 w-1/2" />
    </div>
    <p v-else-if="failed" class="flex flex-wrap items-center gap-2 text-sm text-muted">
      {{ t('characters.lines.failed') }}
      <UButton variant="link" color="neutral" size="sm" class="px-0 pointer-coarse:min-h-11" :label="t('common.actions.retry')" @click="load" />
    </p>
    <p v-else-if="!scenes.length" class="text-sm text-muted text-pretty">{{ t('characters.lines.empty') }}</p>

    <ol v-else role="list" class="space-y-4">
      <li v-for="{ scene, lines: spoken, words: count } in scenes" :key="scene.id">
        <NuxtLink
          :to="store.refPath({ type: 'scene', id: scene.id })"
          class="group -mx-2 flex min-h-9 items-baseline gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1 hover:bg-elevated focus-visible:bg-elevated"
        >
          <span class="font-mono text-xs text-dimmed">{{ scene.code }}</span>
          <span class="voice-author min-w-0 truncate font-semibold text-highlighted">{{ scene.title || t('common.untitled.scene') }}</span>
          <DLeader class="hidden sm:block" />
          <span class="ms-auto shrink-0 text-sm text-muted sm:ms-0">{{ summary(spoken.length, count) }}</span>
        </NuxtLink>
        <ul role="list" class="mt-1 space-y-1.5 ps-1">
          <li
            v-for="(line, index) in (expanded.has(scene.id) ? spoken : spoken.slice(0, SHOWN_PER_SCENE))"
            :key="line.lineId ?? index"
            class="grid grid-cols-[auto_1fr] items-baseline gap-x-3"
          >
            <span class="font-mono text-xs text-dimmed">{{ line.lineId ?? '' }}</span>
            <p class="voice-author text-[0.9375rem] leading-snug text-default">
              <span v-if="line.direction" class="italic text-muted">({{ line.direction }}) </span>{{ line.text }}
            </p>
          </li>
        </ul>
        <UButton
          v-if="spoken.length > SHOWN_PER_SCENE"
          variant="link"
          color="neutral"
          size="xs"
          class="mt-1 px-0 ps-1 pointer-coarse:min-h-11"
          :label="expanded.has(scene.id) ? t('common.actions.showLess') : t('characters.lines.more', { n: spoken.length - SHOWN_PER_SCENE }, spoken.length - SHOWN_PER_SCENE)"
          @click="toggle(scene.id)"
        />
      </li>
    </ol>
  </CharactersSection>
</template>
