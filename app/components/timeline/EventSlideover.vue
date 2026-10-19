<script setup lang="ts">
import { EVENT_KINDS } from '#shared/utils/constants'
import { isEmptyDoc } from '#shared/utils/richtext'
import type { DurationUnit, EntityRef, EventKind, RichDoc, WorldRefType } from '#shared/types/domain'
import type { CreateInput, StoryEvent } from '#shared/types/entities'

/**
 * An event of the story or of history (spec 7.22): title, kind, story date, the date as written in the
 * story, duration, the characters, places, objects and groups it involves, description. Every change
 * saves on its own. Without an id it edits a new event, created as soon as it has a title, or on close
 * when the author gave it anything beyond its starting values (an event added from a character sheet
 * starts linked to the character, and that alone is not an event yet). "Lascia perdere" leaves nothing
 * behind; a new event the server refused keeps its draft, and the panel comes back with it.
 */
const open = defineModel<boolean>('open', { default: false })
const props = withDefaults(defineProps<{
  eventId?: string | null
  /** Starting values of a new event (an event added from a character sheet is already linked to it). */
  defaults?: CreateInput<'events'>
  /** Offer a link to the timeline (when shown on another page). */
  timelineLink?: boolean
}>(), { eventId: null, defaults: () => ({}), timelineLink: false })
/** `created` only while the panel is still open: once closed, the event must not come back on screen. */
const emit = defineEmits<{ created: [id: string] }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()

type Draft = Required<Pick<StoryEvent, 'title' | 'kind' | 'at' | 'timeLabel' | 'durationValue' | 'durationUnit' | 'refs' | 'description'>>

function blank(): Draft {
  const defaults = props.defaults as Partial<Draft>
  return {
    title: '',
    kind: 'story',
    at: null,
    timeLabel: '',
    durationValue: null,
    durationUnit: null,
    description: null,
    ...defaults,
    refs: [...(defaults.refs ?? [])],
  }
}

const draft = reactive<Draft>(blank())
/** The links the draft started with: what counts is what the author adds. */
let given = new Set<string>()
/** Set as soon as a new event exists, before the parent hands its id back. */
const createdId = ref<string | null>(null)
const creating = ref(false)
/** Each new draft is a session: an answer for an older draft leaves the current one alone. */
let session = 0
/** The panel was asked to close (it may take a moment, when the route closes it). */
let closing = false
/** "Lascia perdere": an event already on its way is thrown away too. */
let discarded = false
/** The last new event could not be saved: the next open shows its draft again. */
let unsaved = false

const refKey = (ref: EntityRef) => `${ref.type}:${ref.id}`

function startDraft() {
  session++
  Object.assign(draft, blank())
  given = new Set(draft.refs.map(refKey))
  createdId.value = null
  creating.value = false
  discarded = false
}

const id = computed(() => props.eventId ?? createdId.value)
const event = computed(() => (id.value ? store.get('events', id.value) : undefined))
const current = computed<Draft>(() => event.value ?? draft)
const missing = computed(() => !!props.eventId && !event.value)

watch(() => [open.value, props.eventId] as const, ([isOpen, eventId], previous) => {
  if (isOpen) closing = false
  if (isOpen && !eventId && (!previous?.[0] || previous[1])) {
    if (unsaved) unsaved = false
    else startDraft()
  }
}, { immediate: true })

function setOpen(value: boolean) {
  if (!value) closing = true
  open.value = value
}

/** The panel comes back (with the draft) once it has finished closing. */
function reopen() {
  if (!open.value) {
    open.value = true
    return
  }
  const stop = watch(open, (isOpen) => {
    if (isOpen) return
    stop()
    open.value = true
  })
}

/** Anything the author gave the new event: a title, a date, a duration, a description, a link of their own. */
function hasContent(d: Draft) {
  return !!(d.title.trim() || d.at || d.timeLabel.trim() || d.durationValue || !isEmptyDoc(d.description)
    || d.refs.some(ref => !given.has(refKey(ref))))
}

async function create(title?: string) {
  if (creating.value || event.value) return
  const mine = session
  creating.value = true
  const sent = { ...draft, refs: [...draft.refs], title: (title ?? draft.title).trim() || t('common.untitled.event') }
  let row: StoryEvent
  try {
    row = await store.create('events', sent)
  }
  catch {
    // The store has said what went wrong. The draft stays; a closed panel comes back with it.
    if (mine !== session) return
    creating.value = false
    if (!discarded && (closing || !open.value)) {
      unsaved = true
      reopen()
    }
    return
  }
  if (mine !== session) return
  if (discarded) {
    void store.remove('events', row.id, { undo: false }).catch(() => {})
    return
  }
  createdId.value = row.id
  creating.value = false
  if (!closing && open.value) emit('created', row.id)
  // Changes made while the request was on its way.
  const late: Partial<Draft> = {}
  for (const key of Object.keys(draft) as (keyof Draft)[]) {
    if (key !== 'title' && JSON.stringify(draft[key]) !== JSON.stringify(sent[key])) (late as Record<string, unknown>)[key] = draft[key]
  }
  if (Object.keys(late).length) await store.update('events', row.id, late).catch(() => {})
}

/** Saves a change: debounced for typing, at once for choices; kept in the draft for a new event. */
function change(patch: Partial<Draft>, soon = true) {
  if (event.value) {
    if (soon) store.patchSoon('events', event.value.id, patch)
    else void store.update('events', event.value.id, patch).catch(() => {})
  }
  else Object.assign(draft, patch)
}

watch(open, (isOpen) => {
  if (!isOpen && !event.value && !discarded && hasContent(draft)) void create()
})

function commitTitle(value: string) {
  if (!event.value && !discarded && value.trim()) void create(value)
}

const kindItems = computed(() => EVENT_KINDS.map(value => ({ value, label: label('eventKind', value) })))

const linkedIds = (type: WorldRefType) => current.value.refs.filter(r => r.type === type).map(r => r.id)

function setLinked(type: WorldRefType, ids: string[] | string | null) {
  const list = Array.isArray(ids) ? ids : ids ? [ids] : []
  change({ refs: [...current.value.refs.filter(r => r.type !== type), ...list.map<EntityRef>(id => ({ type, id }))] }, false)
}

const pickers = computed(() => [
  { type: 'character' as const, label: term('characters') },
  { type: 'location' as const, label: term('locations') },
  { type: 'object' as const, label: term('objects') },
  { type: 'group' as const, label: term('groups') },
])

async function trash() {
  if (!event.value) {
    discarded = true
    setOpen(false)
    return
  }
  const target = event.value.id
  setOpen(false)
  await store.remove('events', target).catch(() => {})
}

const icon = computed(() => (current.value.kind === 'historical' ? 'i-lucide-landmark' : 'i-lucide-calendar-clock'))

const titleField = useTemplateRef<{ $el: HTMLTextAreaElement }>('titleField')

/** Just made elsewhere ("Aggiungi" creates it as "Nuovo evento"): it still wants its real title. */
const justCaptured = computed(() => !!event.value
  && event.value.title === t('common.untitled.event')
  && Date.now() - new Date(event.value.createdAt).getTime() < 120_000)

/**
 * Escape in the title closes the panel and keeps what was typed, as everywhere else in it: here
 * nothing waits for a save button. (DInlineText's own Escape puts the field back as it was at focus,
 * which suits renaming in place, not a panel closing over a new event.)
 */
function closeKeepingTitle(keyEvent: KeyboardEvent) {
  keyEvent.stopPropagation()
  setOpen(false)
}

/** A new event starts from its title; an existing one opens on the close button, as dialogs do. */
function onOpenAutoFocus(focusEvent: Event) {
  if (focusEvent.defaultPrevented || (props.eventId && !justCaptured.value)) return
  focusEvent.preventDefault()
  const field = titleField.value?.$el
  field?.focus()
  if (justCaptured.value) field?.select()
}
</script>

<template>
  <USlideover
    :open="open"
    :title="event ? term('event') : t('timeline.event.new')"
    :description="t('timeline.event.panelDescription')"
    :ui="{ description: 'sr-only', body: 'space-y-6', footer: 'justify-between gap-2', close: 'max-lg:size-11 max-lg:justify-center' }"
    :content="{ onOpenAutoFocus }"
    @update:open="setOpen"
  >
    <template #actions>
      <DSaveIndicator compact />
    </template>

    <template #body>
      <p v-if="missing" class="text-muted">{{ t('timeline.event.missing') }}</p>
      <template v-else>
        <div class="flex items-start gap-3" @keydown.esc.capture="closeKeepingTitle">
          <span class="mt-1 grid size-8 shrink-0 place-items-center rounded-[calc(var(--ui-radius)*2)] bg-elevated text-muted max-lg:mt-2" aria-hidden="true">
            <UIcon :name="icon" class="size-4.5" />
          </span>
          <DInlineText
            ref="titleField"
            :model-value="current.title"
            :placeholder="t('timeline.event.titlePlaceholder')"
            :aria-label="t('timeline.event.title')"
            :required="!!event"
            :maxlength="200"
            :multiline="true"
            variant="heading"
            class="voice-author font-semibold! max-lg:py-2"
            @update:model-value="change({ title: $event })"
            @commit="commitTitle"
          />
        </div>

        <URadioGroup
          :model-value="current.kind"
          :items="kindItems"
          value-key="value"
          orientation="horizontal"
          :legend="t('timeline.event.kind')"
          :ui="{ legend: 'mb-2 text-sm font-medium text-default', fieldset: 'gap-x-5 gap-y-2 flex-wrap', item: 'items-center', label: 'max-lg:py-3 max-lg:pe-1' }"
          @update:model-value="change({ kind: $event as EventKind }, false)"
        />

        <div class="space-y-4">
          <TimelineStoryTimeField
            :model-value="current.at"
            @update:model-value="change({ at: $event })"
          />
          <UFormField :label="t('timeline.when.label')" :help="t('timeline.when.labelHelp')">
            <UInput
              :model-value="current.timeLabel"
              :maxlength="120"
              :placeholder="t('timeline.when.labelPlaceholder')"
              class="w-full"
              :ui="{ base: 'voice-author text-base max-lg:min-h-11' }"
              @update:model-value="change({ timeLabel: String($event ?? '') })"
            />
          </UFormField>
          <TimelineDurationField
            :value="current.durationValue"
            :unit="current.durationUnit"
            default-unit="days"
            @update:value="change({ durationValue: $event })"
            @update:unit="change({ durationUnit: $event as DurationUnit | null })"
          />
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-medium text-default">{{ t('timeline.event.links') }}</h3>
          <UFormField v-for="picker in pickers" :key="picker.type" :label="picker.label" :ui="{ label: 'text-muted font-normal' }">
            <DEntityPicker
              :model-value="linkedIds(picker.type)"
              :type="picker.type"
              multiple
              creatable
              :placeholder="t('timeline.event.pick')"
              :aria-label="picker.label"
              class="max-lg:min-h-11"
              @update:model-value="setLinked(picker.type, $event)"
            />
          </UFormField>
        </div>

        <div>
          <h3 class="mb-1.5 text-sm font-medium text-default">{{ t('common.fields.description') }}</h3>
          <DRichText
            :model-value="current.description"
            :placeholder="t('timeline.event.descriptionPlaceholder')"
            prose
            class="tl-long-field min-h-24 px-0.5 py-1.5"
            @update:model-value="change({ description: $event as RichDoc })"
          />
        </div>
      </template>
    </template>

    <template #footer>
      <UButton
        v-if="!missing"
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        class="max-lg:min-h-11"
        :label="event ? t('timeline.event.trash') : t('timeline.event.discard')"
        @click="trash"
      />
      <UButton
        v-if="timelineLink && event"
        :to="store.refPath({ type: 'event', id: event.id })"
        trailing-icon="i-lucide-arrow-right"
        color="neutral"
        variant="link"
        class="max-lg:min-h-11"
        :label="t('timeline.event.showInTimeline')"
      />
    </template>
  </USlideover>
</template>

<style scoped>
/* Long fields look like the page (DESIGN.md "Inputs"): a dotted baseline at rest, the full frame on focus. */
.tl-long-field {
  border-bottom: 1px dotted var(--ui-border-accented);
  transition: border-color 150ms var(--ease-out-expo);
}
.tl-long-field:focus-within {
  border-bottom-color: transparent;
  border-radius: calc(var(--ui-radius) * 1.5);
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}
</style>
