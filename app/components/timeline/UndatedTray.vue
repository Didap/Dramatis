<script setup lang="ts">
import { useEntryLook } from './entry-look'
import type { SceneDatePatch, TimelineEntry } from './timeline-model'

/**
 * "Senza data" (spec 4.5): the scenes and events not yet on the timeline. A scene gets its date right
 * here; an event opens in its panel.
 */
const props = withDefaults(defineProps<{
  entries: TimelineEntry[]
  editing?: string | null
  /** What the open editor starts from after a save that failed. */
  draft?: SceneDatePatch | null
  suggest?: (sceneId: string) => string | null
  /** The project has scenes at all (otherwise the tray has nothing to say). */
  hasScenes?: boolean
  /** Filters are on: an empty tray says nothing about the whole project. */
  filtered?: boolean
}>(), { editing: null, draft: null, suggest: () => null, hasScenes: false, filtered: false })

const emit = defineEmits<{ edit: [sceneId: string], save: [sceneId: string, patch: SceneDatePatch], cancel: [], open: [eventId: string] }>()

const store = useProjectStore()
const { t } = useI18n()
const { scenes } = useFormat()
const { icon, kindLabel, showsKind, code } = useEntryLook()

const LIMIT = 5
const expanded = ref(false)
const shown = computed(() => {
  if (expanded.value || props.entries.length <= LIMIT + 1) return props.entries
  const first = props.entries.slice(0, LIMIT)
  const open = props.entries.find(e => e.id === props.editing)
  return open && !first.includes(open) ? [...first, open] : first
})

const counts = computed(() => {
  const sceneCount = props.entries.filter(e => e.type === 'scene').length
  const eventCount = props.entries.length - sceneCount
  return [sceneCount ? scenes(sceneCount) : '', eventCount ? t('timeline.units.events', { n: eventCount }, eventCount) : ''].filter(Boolean).join(', ')
})

const chapterOf = (entry: TimelineEntry) => (entry.scene ? store.get('chapters', entry.scene.chapterId) : undefined)
const titleOf = (entry: TimelineEntry) => entry.title || (entry.scene ? t('common.untitled.scene') : t('common.untitled.event'))
</script>

<template>
  <section id="undated" aria-labelledby="undated-heading" class="scroll-mt-20">
    <div class="flex items-baseline gap-3">
      <h2 id="undated-heading" class="text-base font-semibold text-highlighted">{{ t('timeline.undated.title') }}</h2>
      <template v-if="entries.length">
        <DLeader />
        <span class="shrink-0 text-sm text-muted">{{ counts }}</span>
      </template>
    </div>

    <p v-if="!entries.length" class="mt-2 flex items-center gap-1.5 text-sm text-muted">
      <UIcon name="i-lucide-check" class="size-4 shrink-0 text-dimmed" />
      {{ filtered ? t('timeline.undated.noneFiltered') : hasScenes ? t('timeline.undated.none') : t('timeline.undated.nothing') }}
    </p>
    <template v-else>
      <p class="mt-1 text-sm text-muted">{{ t('timeline.undated.hint') }}</p>
      <ul class="mt-2">
        <li
          v-for="entry in shown"
          :key="entry.key"
          :data-timeline-key="entry.key"
          class="border-b border-default/60 py-2 last:border-b-0"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 grid size-6 shrink-0 place-items-center border bg-default text-muted"
              :class="entry.type === 'scene' ? 'rounded-full border-default' : 'rounded-[calc(var(--ui-radius)*1.5)] border-(--ui-border-accented)'"
              aria-hidden="true"
            >
              <UIcon :name="icon(entry)" class="size-3.5" />
            </span>
            <div class="min-w-0 flex-1 pt-0.5">
              <p>
                <span v-if="code(entry)" class="me-1.5 font-mono text-xs text-dimmed">{{ code(entry) }}</span>
                <NuxtLink
                  v-if="entry.scene"
                  :to="store.refPath({ type: 'scene', id: entry.id })"
                  class="voice-author font-semibold! text-highlighted underline-offset-3 hover:underline"
                >{{ titleOf(entry) }}</NuxtLink>
                <button
                  v-else
                  type="button"
                  class="voice-author text-start font-semibold! text-highlighted underline-offset-3 hover:underline"
                  @click="emit('open', entry.id)"
                >{{ titleOf(entry) }}</button>
                <span v-if="chapterOf(entry)" class="voice-author text-muted italic">, {{ chapterOf(entry)!.title || t('common.untitled.chapter') }}</span>
                <template v-if="showsKind(entry)">{{ ' ' }}<span class="text-xs whitespace-nowrap text-muted">{{ kindLabel(entry) }}</span></template>
                <span v-else class="sr-only">. {{ kindLabel(entry) }}</span>
              </p>
              <p v-if="entry.label" class="voice-author mt-0.5 text-sm text-muted italic">{{ entry.label }}</p>
              <UButton
                v-if="editing !== entry.id"
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-calendar-plus"
                :label="t('timeline.undated.give')"
                :aria-label="t('timeline.undated.giveTo', { title: titleOf(entry) })"
                class="-ms-0.5 mt-0.5 px-0 max-lg:min-h-11"
                @click="entry.type === 'scene' ? emit('edit', entry.id) : emit('open', entry.id)"
              />
            </div>
          </div>
          <TimelineSceneDateEditor
            v-if="editing === entry.id && entry.scene"
            :scene-id="entry.id"
            :suggest="suggest(entry.id)"
            :initial="draft"
            @save="emit('save', entry.id, $event)"
            @cancel="emit('cancel')"
          />
        </li>
      </ul>
      <UButton
        v-if="shown.length < entries.length"
        color="neutral"
        variant="link"
        size="sm"
        class="mt-1 px-0 max-lg:min-h-11"
        :label="t('timeline.undated.showAll', { n: entries.length })"
        @click="expanded = true"
      />
    </template>
  </section>
</template>
