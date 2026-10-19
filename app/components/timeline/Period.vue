<script setup lang="ts">
import { useStoryCalendar } from './story-calendar'
import type { Overlap, SceneDatePatch, TimelineEntry, TimelineSection } from './timeline-model'

/**
 * A year, month or day of the timeline: its heading, its items, then its own periods. Every heading
 * stays in sight while its period scrolls by, the year at the top and the month or the day below it.
 */
const props = withDefaults(defineProps<{
  section: TimelineSection
  depth?: number
  editing?: string | null
  /** What the open editor starts from after a save that failed. */
  draft?: SceneDatePatch | null
  suggest?: (sceneId: string) => string | null
  overlaps?: Map<string, Overlap[]>
  /** Keys of the items on screen (the filters may hide the other side of an overlap). */
  shown?: Set<string> | null
  flashbacks?: Set<string>
  narrative?: (entry: TimelineEntry) => string | undefined
}>(), { depth: 0, editing: null, draft: null, suggest: () => null, overlaps: () => new Map(), shown: null, flashbacks: () => new Set(), narrative: () => undefined })

const emit = defineEmits<{ edit: [sceneId: string], save: [sceneId: string, patch: SceneDatePatch], cancel: [], open: [eventId: string], undate: [key: string] }>()

const { t } = useI18n()
const { scenes } = useFormat()
const { heading } = useStoryCalendar()

const tag = computed(() => (['h2', 'h3', 'h4'] as const)[Math.min(props.depth, 2)])
const headingId = computed(() => `tl-${props.section.id}`)
/** Items dated in the story's own words: the weekday of the real calendar would contradict them. */
const title = computed(() => heading(props.section, { weekday: !props.section.entries.some(entry => entry.label) }))

/** Scenes and events in the period, for the year line. */
const totals = computed(() => {
  const count = { scene: 0, event: 0 }
  const walk = (section: TimelineSection) => {
    for (const entry of section.entries) count[entry.type]++
    section.sections.forEach(walk)
  }
  walk(props.section)
  return count
})
const totalsText = computed(() => [
  totals.value.scene ? scenes(totals.value.scene) : '',
  totals.value.event ? t('timeline.units.events', { n: totals.value.event }, totals.value.event) : '',
].filter(Boolean).join(', '))
</script>

<template>
  <section :aria-labelledby="headingId" :class="depth === 0 ? 'mt-8 first:mt-0' : 'mt-4'">
    <!-- Sticky under the page bar (3.5rem); the year line is 2.625rem tall, a month or day heading 1.75rem. -->
    <div
      v-if="depth === 0"
      class="sticky top-14 z-15 -mx-2 flex items-baseline gap-3 bg-default px-2 pt-2 pb-1.5"
    >
      <component :is="tag" :id="headingId" class="text-lg font-semibold text-highlighted">{{ title }}</component>
      <DLeader />
      <span class="shrink-0 text-sm text-muted">{{ totalsText }}</span>
    </div>
    <component
      :is="tag"
      v-else
      :id="headingId"
      class="sticky z-12 -mx-2 bg-default px-2 py-1 text-sm"
      :class="[
        depth === 1 ? 'top-[6.125rem]' : 'top-[7.875rem]',
        section.level === 'day' && depth === 2 ? 'font-medium text-muted' : 'font-semibold text-toned',
      ]"
    >
      {{ title }}
    </component>

    <ol v-if="section.entries.length" class="mt-1">
      <TimelineItem
        v-for="entry in section.entries"
        :key="entry.key"
        :entry="entry"
        :context="section.level"
        :editing="editing === entry.id"
        :draft="editing === entry.id ? draft : null"
        :suggest="suggest"
        :overlaps="overlaps.get(entry.key)"
        :shown="shown"
        :flashback="flashbacks.has(entry.id)"
        :narrative="narrative(entry)"
        @edit="emit('edit', entry.id)"
        @save="emit('save', entry.id, $event)"
        @cancel="emit('cancel')"
        @open="emit('open', entry.id)"
        @undate="emit('undate', entry.key)"
      />
    </ol>

    <TimelinePeriod
      v-for="child in section.sections"
      :key="child.id"
      :section="child"
      :depth="depth + 1"
      :editing="editing"
      :draft="draft"
      :suggest="suggest"
      :overlaps="overlaps"
      :shown="shown"
      :flashbacks="flashbacks"
      :narrative="narrative"
      @edit="emit('edit', $event)"
      @save="(sceneId: string, patch: SceneDatePatch) => emit('save', sceneId, patch)"
      @cancel="emit('cancel')"
      @open="emit('open', $event)"
      @undate="emit('undate', $event)"
    />
  </section>
</template>
