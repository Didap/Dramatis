<script setup lang="ts">
import type { RefType } from '#shared/types/domain'
import { compareStoryTime } from '#shared/utils/time'
import { useStoryCalendar } from './story-calendar'

/**
 * CONTRACT (owned by the timeline feature): the timeline events linked to an entity, with add,
 * embedded as <TimelineEntityEvents> in character, location, object and group pages. Events open in
 * their panel right here; a new one starts already linked to the entity (spec 4.4).
 */
const props = defineProps<{ entityType: RefType, entityId: string }>()

const store = useProjectStore()
const { t } = useI18n()
const { label } = useEnums()
const { fullDate } = useStoryCalendar()

const guidance = computed(() => store.project?.settings.guidance !== false)
const name = computed(() => store.refLabel({ type: props.entityType, id: props.entityId }))

/** In story order; the undated ones last, as on the timeline's tray. */
const events = computed(() => store.rows.events
  .filter(e => e.refs.some(r => r.type === props.entityType && r.id === props.entityId))
  .sort((a, b) => compareStoryTime(a.at, b.at) || a.title.localeCompare(b.title)))

const panelOpen = ref(false)
const panelEventId = ref<string | null>(null)
const defaults = computed(() => ({ refs: [{ type: props.entityType, id: props.entityId }] }))

function open(id: string | null) {
  panelEventId.value = id
  panelOpen.value = true
}

const icon = (kind: string) => (kind === 'historical' ? 'i-lucide-landmark' : REF_ICONS.event!)
</script>

<template>
  <!-- relative: its sr-only text stays inside the host page's scroller. -->
  <div class="d-entity-events relative">
    <ul v-if="events.length" class="-mx-2">
      <li v-for="event in events" :key="event.id">
        <button
          type="button"
          class="d-row group flex min-h-11 w-full items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 text-start outline-none transition-colors duration-150 hover:bg-elevated focus-visible:bg-elevated"
          @click="open(event.id)"
        >
          <span class="grid size-6 shrink-0 place-items-center rounded-[calc(var(--ui-radius)*1.5)] border border-(--ui-border-accented) text-muted" aria-hidden="true">
            <UIcon :name="icon(event.kind)" class="size-3.5" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
            <span class="min-w-0 truncate">
              <span class="voice-author font-semibold! text-highlighted">{{ event.title || t('common.untitled.event') }}</span>
              <span class="sr-only">, {{ label('eventKind', event.kind) }},</span>
            </span>
            <DLeader class="hidden sm:block" />
            <!-- The date as written in the story is read instead of the date (spec 7.16); dimmed while the event has no place on the timeline. -->
            <span class="text-sm sm:max-w-[50%] sm:shrink-0 sm:truncate" :class="event.at ? 'text-muted' : 'text-dimmed'" :title="event.timeLabel || undefined">
              <span v-if="event.timeLabel" class="voice-author italic">{{ event.timeLabel }}<span v-if="!event.at" class="sr-only">, {{ t('timeline.entity.undated') }}</span></span>
              <template v-else>{{ event.at ? fullDate(event.at, { style: 'short' }) : t('timeline.entity.undated') }}</template>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <div v-else class="text-sm text-muted">
      <p>{{ t('timeline.entity.empty', { name }) }}</p>
      <p v-if="guidance" class="mt-1 max-w-prose text-pretty">{{ t('timeline.entity.emptyHint') }}</p>
    </div>

    <UButton
      icon="i-lucide-calendar-plus"
      color="neutral"
      variant="ghost"
      size="sm"
      class="mt-2 -ms-2 max-lg:min-h-11"
      :label="t('timeline.entity.add')"
      @click="open(null)"
    />

    <TimelineEventSlideover
      v-model:open="panelOpen"
      :event-id="panelEventId"
      :defaults="defaults"
      timeline-link
      @created="panelEventId = $event"
    />
  </div>
</template>
