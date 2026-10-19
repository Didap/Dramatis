<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useEntryLook } from './entry-look'
import { useStoryCalendar } from './story-calendar'
import type { DateContext } from './story-calendar'
import type { Overlap, SceneDatePatch, TimelineEntry } from './timeline-model'

/**
 * One scene or event on the timeline: when it happens, a marker on the spine (round for scenes, square
 * for events), the title in the author's voice with its chapter or kind, the duration on the leader,
 * then who is there and where. "When" is the date as written in the story when there is one (spec
 * 7.16: it is read instead of the date), else the part of the date the heading above does not say.
 * On a phone it sits above the title.
 */
const props = withDefaults(defineProps<{
  entry: TimelineEntry
  context: DateContext
  /** The inline date editor is open on this scene. */
  editing?: boolean
  /** What the editor starts from after a save that failed (else the scene's own values). */
  draft?: SceneDatePatch | null
  /** A date to start from; asked only when the editor opens. */
  suggest?: (sceneId: string) => string | null
  overlaps?: Overlap[]
  /** Keys of the items on screen: a contradiction with an item the filters hide says so. */
  shown?: Set<string> | null
  flashback?: boolean
  /** Where the scene sits in the manuscript ("Capitolo 3, scena 2"), when narrative order is shown. */
  narrative?: string
}>(), { editing: false, draft: null, suggest: () => null, overlaps: () => [], shown: null, flashback: false, narrative: undefined })

const emit = defineEmits<{ edit: [], save: [patch: SceneDatePatch], cancel: [], open: [], undate: [] }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { localeTag } = useFormat()
const { fullDate, dateUnder, durationText } = useStoryCalendar()
const { icon, kindLabel, showsKind, code } = useEntryLook()

const scene = computed(() => props.entry.scene)
const chapter = computed(() => (scene.value ? store.get('chapters', scene.value.chapterId) : undefined))
const title = computed(() => props.entry.title || (scene.value ? t('common.untitled.scene') : t('common.untitled.event')))
const when = computed(() => (props.entry.parts ? dateUnder(props.entry.parts, props.context) : { main: '', time: '' }))
const whenLine = computed(() => [when.value.main, when.value.time].filter(Boolean).join(' · '))
const duration = computed(() => durationText(props.entry.durationValue, props.entry.durationUnit))

const MAX_PEOPLE = 5
const people = computed(() => props.entry.characterIds
  .map(id => store.get('characters', id))
  .filter(c => !!c)
  .map(c => ({ id: c.id, name: c.name, color: c.color, pov: c.id === props.entry.povCharacterId })))
const places = computed(() => props.entry.locationIds.map(id => store.get('locations', id)).filter(l => !!l))
const hiddenPeople = computed(() => people.value.slice(MAX_PEOPLE).map(p => p.name).join(', '))

const isStart = computed(() => !!scene.value && store.modules.branching && store.project?.startSceneId === scene.value.id)
const isEnding = computed(() => !!scene.value?.ending && store.modules.branching)

const listFormat = computed(() => new Intl.ListFormat(localeTag.value, { type: 'conjunction' }))

const conflicts = computed(() => props.overlaps.map((overlap) => {
  const [type, id] = overlap.key.split(':') as ['scene' | 'event', string]
  const other = type === 'scene' ? store.get('scenes', id) : store.get('events', id)
  const names = overlap.characterIds.map(c => store.get('characters', c)?.name).filter((n): n is string => !!n)
  return {
    key: overlap.key,
    names: listFormat.value.format(names),
    count: names.length,
    title: other?.title || t(type === 'scene' ? 'common.untitled.scene' : 'common.untitled.event'),
    to: other ? store.refPath({ type, id }) : undefined,
    outside: !!props.shown && !props.shown.has(overlap.key),
  }
}))

// ---------------------------------------------------------------- the row menu

const root = useTemplateRef<HTMLElement>('root')
/**
 * Set by a menu item that places the keyboard itself (the date editor it opens, the tray the item
 * moves to): the menu, closing, must not take focus back to its button.
 */
let keepFocus: (() => HTMLElement | null | undefined) | null = null

function onMenuCloseAutoFocus(event: Event) {
  if (!keepFocus) return
  event.preventDefault()
  const target = keepFocus
  keepFocus = null
  void nextTick(() => {
    const el = target()
    if (!el) return
    el.focus()
    if (el instanceof HTMLInputElement) el.select()
  })
}

const menu = computed<DropdownMenuItem[][]>(() => {
  const undate = {
    label: t('timeline.row.clearDate'),
    icon: 'i-lucide-calendar-x',
    onSelect: () => {
      keepFocus = () => null
      emit('undate')
    },
  }
  if (scene.value) {
    return [[
      { label: t('timeline.row.openScene'), icon: 'i-lucide-pen-line', to: store.refPath({ type: 'scene', id: scene.value.id }) },
      {
        label: t('timeline.row.changeDate'),
        icon: 'i-lucide-calendar-cog',
        onSelect: () => {
          keepFocus = () => root.value?.querySelector<HTMLElement>('form input') ?? root.value?.querySelector<HTMLElement>('form button')
          emit('edit')
        },
      },
    ], [undate]]
  }
  return [[
    { label: t('common.actions.edit'), icon: 'i-lucide-pencil', onSelect: () => emit('open') },
  ], [
    undate,
    { label: t('timeline.event.trash'), icon: 'i-lucide-trash-2', onSelect: () => { if (props.entry.event) void store.remove('events', props.entry.event.id).catch(() => {}) } },
  ]]
})
</script>

<template>
  <!-- scroll-mt: a row brought into view stays clear of the sticky period headings. -->
  <li
    ref="root"
    :data-timeline-key="entry.key"
    class="tl-item group/item relative grid scroll-mt-36 grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2.5 rounded-[calc(var(--ui-radius)*2)] py-2 pe-1 transition-colors duration-150 hover:bg-elevated/60 sm:grid-cols-[var(--tl-when,5.5rem)_1.5rem_minmax(0,1fr)] sm:gap-x-3 sm:pe-2"
  >
    <div class="hidden pt-0.5 text-end text-sm leading-5 text-muted sm:block" aria-hidden="true">
      <p v-if="entry.label" class="voice-author line-clamp-3 text-[0.8125rem] italic" :title="entry.label">{{ entry.label }}</p>
      <template v-else>
        <p v-if="when.main">{{ when.main }}</p>
        <p v-if="when.time" :class="when.main ? 'text-dimmed' : ''">{{ when.time }}</p>
      </template>
    </div>

    <div class="tl-spine relative flex justify-center" aria-hidden="true">
      <span
        class="relative z-10 grid size-6 place-items-center border bg-default text-muted"
        :class="entry.type === 'scene' ? 'rounded-full border-default' : 'rounded-[calc(var(--ui-radius)*1.5)] border-(--ui-border-accented)'"
      >
        <UIcon :name="icon(entry)" class="size-3.5" />
      </span>
    </div>

    <div class="min-w-0 pb-0.5">
      <p v-if="entry.label || whenLine" class="pt-0.5 text-[0.8125rem] leading-5 text-muted sm:hidden" aria-hidden="true">
        <span v-if="entry.label" class="voice-author italic">{{ entry.label }}</span>
        <template v-else>{{ whenLine }}</template>
      </p>

      <div class="flex items-start gap-2">
        <div class="flex min-w-0 flex-1 items-baseline gap-3">
          <p class="min-w-0">
            <span v-if="code(entry)" class="me-1.5 font-mono text-xs text-dimmed">{{ code(entry) }}</span>
            <!-- On a phone the title's touch area grows to 44px, without moving the text. -->
            <NuxtLink
              v-if="scene"
              :to="store.refPath({ type: 'scene', id: scene.id })"
              class="voice-author relative font-semibold! text-highlighted decoration-(--ui-border-accented) underline-offset-3 hover:underline max-lg:after:absolute max-lg:after:-inset-x-1 max-lg:after:-inset-y-2.5 max-lg:after:content-['']"
            >{{ title }}</NuxtLink>
            <button
              v-else
              type="button"
              class="voice-author relative text-start font-semibold! text-highlighted decoration-(--ui-border-accented) underline-offset-3 hover:underline max-lg:after:absolute max-lg:after:-inset-x-1 max-lg:after:-inset-y-2.5 max-lg:after:content-['']"
              @click="emit('open')"
            >{{ title }}</button>
            <span v-if="chapter" class="voice-author text-muted italic">, {{ chapter.title || t('common.untitled.chapter') }}</span>
            <template v-if="showsKind(entry)">{{ ' ' }}<span class="text-xs whitespace-nowrap text-muted">{{ kindLabel(entry) }}</span></template>
            <span class="sr-only">. {{ showsKind(entry) ? '' : `${kindLabel(entry)}, ` }}{{ entry.label || fullDate(entry.at) }}</span>
          </p>
          <template v-if="duration">
            <DLeader class="hidden sm:block" />
            <span class="hidden shrink-0 text-sm text-muted sm:inline">{{ duration }}</span>
          </template>
        </div>
        <UDropdownMenu :items="menu" :content="{ align: 'end', onCloseAutoFocus: onMenuCloseAutoFocus }">
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="ghost"
            size="sm"
            class="-my-1 shrink-0 max-lg:-my-2.5 max-lg:size-11 max-lg:justify-center lg:opacity-0 lg:group-hover/item:opacity-100 lg:focus-visible:opacity-100 lg:data-[state=open]:opacity-100"
            :aria-label="t('timeline.row.actions', { title })"
          />
        </UDropdownMenu>
      </div>

      <p v-if="isStart || isEnding || flashback || narrative" class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span v-if="narrative">{{ narrative }}</span>
        <span v-if="flashback" class="inline-flex items-center gap-1 font-medium text-toned"><UIcon name="i-lucide-history" class="size-3.5" />{{ t('timeline.order.flashback') }}</span>
        <span v-if="isStart" class="inline-flex items-center gap-1"><UIcon name="i-lucide-play" class="size-3.5" />{{ t('timeline.row.start') }}</span>
        <span v-if="isEnding" class="inline-flex items-center gap-1"><UIcon name="i-lucide-flag" class="size-3.5" />{{ scene!.endingLabel ? t('timeline.row.ending', { label: scene!.endingLabel }) : term('ending') }}</span>
      </p>

      <p v-if="duration || people.length || places.length" class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span v-if="duration" class="sm:hidden">{{ duration }}</span>
        <span v-if="people.length" class="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span class="sr-only">{{ term('characters') }}:</span>
          <span v-for="person in people.slice(0, MAX_PEOPLE)" :key="person.id" class="inline-flex items-center gap-1.5">
            <DColorDot :color="person.color" size="xs" />
            <span class="voice-author">{{ person.name }}</span>
            <UTooltip v-if="person.pov" :text="t('timeline.row.pov')">
              <span class="inline-flex text-dimmed"><UIcon name="i-lucide-eye" class="size-3.5" /><span class="sr-only">({{ t('timeline.row.pov') }})</span></span>
            </UTooltip>
          </span>
          <UTooltip v-if="hiddenPeople" :text="hiddenPeople">
            <span class="tabular text-dimmed">{{ t('timeline.row.more', { n: people.length - MAX_PEOPLE }) }}<span class="sr-only">: {{ hiddenPeople }}</span></span>
          </UTooltip>
        </span>
        <span v-if="places.length" class="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span class="sr-only">{{ term('locations') }}:</span>
          <span v-for="place in places" :key="place.id" class="inline-flex items-center gap-1">
            <UIcon :name="REF_ICONS.location!" class="size-3.5 text-dimmed" />
            <span class="voice-author">{{ place.name }}</span>
          </span>
        </span>
      </p>

      <ul v-if="conflicts.length" class="mt-1.5 space-y-1">
        <li v-for="conflict in conflicts" :key="conflict.key" class="flex items-start gap-1.5 text-sm text-warning">
          <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
          <span>
            <i18n-t keypath="timeline.checks.overlap" :plural="conflict.count" scope="global" tag="span">
              <template #names>{{ conflict.names }}</template>
              <template #title>
                <NuxtLink v-if="conflict.to" :to="conflict.to" class="voice-author underline underline-offset-3">{{ conflict.title }}</NuxtLink>
                <span v-else class="voice-author">{{ conflict.title }}</span>
              </template>
            </i18n-t>
            <span v-if="conflict.outside" class="text-muted">{{ ' ' }}{{ t('timeline.checks.outside') }}</span>
          </span>
        </li>
      </ul>

      <TimelineSceneDateEditor
        v-if="editing && scene"
        :scene-id="scene.id"
        :suggest="suggest(scene.id)"
        :initial="draft"
        @save="emit('save', $event)"
        @cancel="emit('cancel')"
      />
    </div>
  </li>
</template>

<style scoped>
/* The spine joins the markers of a period, from its first marker to its last. */
.tl-spine::before {
  content: '';
  position: absolute;
  inset-block: -0.5rem;
  inset-inline-start: 50%;
  width: 1px;
  background: var(--ui-border);
}
.tl-item:first-child .tl-spine::before {
  inset-block-start: 0.75rem;
}
.tl-item:last-child .tl-spine::before {
  inset-block-end: auto;
  height: calc(0.75rem + 0.5rem);
}
.tl-item:first-child:last-child .tl-spine::before {
  display: none;
}
</style>
