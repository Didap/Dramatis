<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import type { Character } from '#shared/types/entities'

/**
 * A line of dialogue in script form (spec 5.6): who speaks (a character, or a free label for an
 * unnamed voice), how (the direction, optional) and the line itself, which is ordinary editable text.
 * Tab goes from speaker to direction to line; the id (S014-L003) shows on hover and focus.
 */
const props = defineProps(nodeViewProps)

const store = useProjectStore()
const { t } = useI18n()
const { label: enumLabel } = useEnums()
const toast = useToast()
const route = useRoute()

const uid = useId()
const speakerId = computed(() => (props.node.attrs.speakerId as string | null) || null)
const speakerName = computed(() => String(props.node.attrs.speakerName ?? ''))
const direction = computed(() => String(props.node.attrs.direction ?? ''))
const lineId = computed(() => (props.node.attrs.lineId as string | null) || null)
const character = computed(() => store.get('characters', speakerId.value))
const label = computed(() => character.value?.name ?? speakerName.value)
const editable = computed(() => props.editor.isEditable)
const isFree = computed(() => !character.value && !!speakerName.value)

const speakerInput = useTemplateRef<HTMLInputElement>('speakerInput')
const directionInput = useTemplateRef<HTMLInputElement>('directionInput')
const speakerDraft = ref(label.value)
const directionDraft = ref(direction.value)
const editingSpeaker = ref(false)
const editingDirection = ref(false)
const open = ref(false)
const active = ref(0)

watch(label, (value) => {
  if (!editingSpeaker.value) speakerDraft.value = value
})
watch(direction, (value) => {
  if (!editingDirection.value) directionDraft.value = value
})

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

/** The characters of the scene first, then everyone else; filtered by what is typed. */
const options = computed(() => {
  const sceneId = String(route.params.sceneId ?? '')
  const inScene = new Set(store.get('scenes', sceneId)?.characterIds ?? [])
  const query = fold(speakerDraft.value.trim())
  const all = [...store.rows.characters].sort((a, b) => Number(inScene.has(b.id)) - Number(inScene.has(a.id)))
  const matches = (c: Character) => !query || query === fold(label.value) || [c.name, ...c.aliases].some(n => fold(n).includes(query))
  return all.filter(matches).slice(0, 12).map(c => ({ character: c, inScene: inScene.has(c.id) }))
})

type Option = { kind: 'character', character: Character } | { kind: 'free', name: string } | { kind: 'create', name: string }

const choices = computed<Option[]>(() => {
  const list: Option[] = options.value.map(o => ({ kind: 'character' as const, character: o.character }))
  const typed = speakerDraft.value.trim()
  const exact = store.rows.characters.some(c => fold(c.name) === fold(typed))
  if (typed && !exact) list.push({ kind: 'free', name: typed }, { kind: 'create', name: typed })
  return list
})

watch(choices, () => {
  if (active.value >= choices.value.length) active.value = 0
})

function setSpeaker(attrs: { speakerId: string | null, speakerName: string }) {
  if (attrs.speakerId === speakerId.value && attrs.speakerName === speakerName.value) return
  props.updateAttributes(attrs)
}

/** What is typed becomes the speaker: a character when the name (or an alias) matches, a free label otherwise. */
function commitSpeaker() {
  const typed = speakerDraft.value.trim()
  if (typed === label.value) return
  if (!typed) return setSpeaker({ speakerId: null, speakerName: '' })
  const match = store.rows.characters.find(c => fold(c.name) === fold(typed)) ?? store.rows.characters.find(c => c.aliases.some(a => fold(a) === fold(typed)))
  if (match) setSpeaker({ speakerId: match.id, speakerName: match.name })
  else setSpeaker({ speakerId: null, speakerName: typed })
}

async function choose(option: Option) {
  open.value = false
  if (option.kind === 'character') {
    speakerDraft.value = option.character.name
    setSpeaker({ speakerId: option.character.id, speakerName: option.character.name })
  }
  else if (option.kind === 'free') {
    speakerDraft.value = option.name
    setSpeaker({ speakerId: null, speakerName: option.name })
  }
  else {
    await createSpeaker(option.name)
  }
  focusText('end')
}

/** "Crea come comparsa": the free label becomes a minor character, and this line its line. */
async function createSpeaker(name = speakerName.value) {
  if (!name.trim()) return
  const row = await store.create('characters', { name: name.trim(), importance: 'minor' }).catch(() => null)
  if (!row) return
  speakerDraft.value = row.name
  setSpeaker({ speakerId: row.id, speakerName: row.name })
  toast.add({ title: t('editor.line.createdMinor', { name: row.name }), icon: 'i-lucide-user-round-plus' })
}

function focusText(at: 'start' | 'end') {
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  const offset = at === 'end' ? props.node.content.size : 0
  props.editor.chain().focus().setTextSelection(pos + 1 + offset).run()
}

function onSpeakerFocus() {
  editingSpeaker.value = true
  speakerDraft.value = label.value
  active.value = 0
}

function onSpeakerBlur() {
  editingSpeaker.value = false
  open.value = false
  commitSpeaker()
}

function onSpeakerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) {
      open.value = true
      return
    }
    const n = choices.value.length
    if (n) active.value = (active.value + (event.key === 'ArrowDown' ? 1 : n - 1)) % n
  }
  else if (event.key === 'Enter') {
    event.preventDefault()
    const option = open.value ? choices.value[active.value] : undefined
    if (option) void choose(option)
    else {
      commitSpeaker()
      focusText('end')
    }
  }
  else if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault()
    // Like Enter, Tab takes the character highlighted in the list; then the direction.
    const option = open.value ? choices.value[active.value] : undefined
    if (option?.kind === 'character') {
      speakerDraft.value = option.character.name
      setSpeaker({ speakerId: option.character.id, speakerName: option.character.name })
    }
    else {
      commitSpeaker()
    }
    open.value = false
    startDirection()
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    if (open.value) open.value = false
    else {
      speakerDraft.value = label.value
      focusText('end')
    }
  }
}

function onSpeakerInput() {
  open.value = true
  active.value = 0
}

function commitDirection() {
  const value = directionDraft.value.trim()
  if (value !== direction.value) props.updateAttributes({ direction: value })
}

/** The direction shows as text that wraps with the line; it becomes a field while it is edited. */
function startDirection() {
  if (!editable.value) return
  directionDraft.value = direction.value
  editingDirection.value = true
  nextTick(() => directionInput.value?.focus())
}

function endDirection() {
  commitDirection()
  editingDirection.value = false
}

function onDirectionKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
    event.preventDefault()
    endDirection()
    focusText('start')
  }
  else if (event.key === 'Tab' && event.shiftKey) {
    event.preventDefault()
    endDirection()
    speakerInput.value?.focus()
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    directionDraft.value = direction.value
    editingDirection.value = false
    focusText('end')
  }
}

async function copyId() {
  if (!lineId.value) return
  try {
    await navigator.clipboard.writeText(lineId.value)
    toast.add({ title: t('editor.line.copied', { id: lineId.value }), icon: 'i-lucide-copy-check' })
  }
  catch {}
}

const wrapper = useTemplateRef<{ $el: HTMLElement }>('wrapper')

/** A line just created by the editor (/ Battuta, the toolbar, Enter) asks for its speaker. */
onMounted(() => {
  // Shift+Tab in the line's text comes back to the direction (see ScriptLine in Surface.vue).
  wrapper.value?.$el.addEventListener('d-line-direction', startDirection)
  const storage = (props.editor.storage as unknown as Record<string, { focusSpeakerAt: number | null } | undefined>).dialogueLine
  if (!storage || storage.focusSpeakerAt === null || storage.focusSpeakerAt !== props.getPos()) return
  storage.focusSpeakerAt = null
  requestAnimationFrame(() => speakerInput.value?.focus())
})

const optionLabel = (option: Option) => {
  if (option.kind === 'character') return option.character.name
  if (option.kind === 'free') return t('editor.line.freeLabel', { name: option.name })
  return t('editor.line.createAs', { name: option.name })
}
</script>

<template>
  <NodeViewWrapper
    ref="wrapper"
    class="d-line"
    :class="{ 'is-free': isFree, 'has-speaker': !!label }"
    :data-line-id="lineId ?? undefined"
  >
    <span class="d-line__meta" contenteditable="false">
      <span class="d-line__speaker d-line__field">
        <span class="d-line__sizer" aria-hidden="true">{{ speakerDraft || t('editor.line.speakerPlaceholder') }}</span>
        <input
          ref="speakerInput"
          v-model="speakerDraft"
          class="d-line__input"
          type="text"
          size="1"
          role="combobox"
          autocomplete="off"
          spellcheck="false"
          :readonly="!editable"
          :placeholder="t('editor.line.speakerPlaceholder')"
          :aria-label="t('editor.line.speaker')"
          aria-autocomplete="list"
          :aria-expanded="open && choices.length > 0"
          :aria-controls="`${uid}-speakers`"
          :aria-activedescendant="open && choices.length ? `${uid}-option-${active}` : undefined"
          @focus="onSpeakerFocus"
          @blur="onSpeakerBlur"
          @keydown="onSpeakerKeydown"
          @input="onSpeakerInput"
          @click="open = editable"
        >
        <ul
          v-show="open && choices.length"
          :id="`${uid}-speakers`"
          role="listbox"
          class="d-line__options"
          :aria-label="t('editor.line.speakers')"
        >
          <li
            v-for="(option, i) in choices"
            :id="`${uid}-option-${i}`"
            :key="option.kind === 'character' ? option.character.id : `${option.kind}:${option.name}`"
            role="option"
            :aria-selected="i === active"
            class="d-line__option"
            :class="{ 'is-active': i === active }"
            @mousedown.prevent="choose(option)"
            @mouseenter="active = i"
          >
            <DEntityAvatar
              v-if="option.kind === 'character'"
              :name="option.character.name"
              :image-id="store.primaryImage('character', option.character.id)"
              :color="option.character.color"
              size="xs"
            />
            <UIcon v-else :name="option.kind === 'free' ? 'i-lucide-type' : 'i-lucide-user-round-plus'" class="size-4 shrink-0 text-dimmed" />
            <span class="min-w-0 flex-1 truncate" :class="option.kind === 'character' ? 'voice-author' : ''">{{ optionLabel(option) }}</span>
            <span v-if="option.kind === 'character'" class="shrink-0 text-xs text-muted">{{ enumLabel('importance', option.character.importance) }}</span>
          </li>
        </ul>
      </span>
      <span class="d-line__direction" :class="{ 'is-empty': !direction && !editingDirection }">
        <template v-if="editingDirection">
          <span aria-hidden="true">(</span><span class="d-line__field"><span class="d-line__sizer" aria-hidden="true">{{ directionDraft || t('editor.line.directionPlaceholder') }}</span><input
            ref="directionInput"
            v-model="directionDraft"
            class="d-line__input"
            type="text"
            size="1"
            autocomplete="off"
            :readonly="!editable"
            :placeholder="t('editor.line.directionPlaceholder')"
            :aria-label="t('editor.line.direction')"
            @blur="endDirection"
            @keydown="onDirectionKeydown"
          ></span><span aria-hidden="true">)</span>
        </template>
        <span
          v-else-if="direction"
          class="d-line__direction-text"
          role="button"
          :tabindex="editable ? 0 : -1"
          :aria-label="t('editor.line.editDirection', { direction })"
          @click="startDirection"
          @keydown.enter.prevent="startDirection"
          @keydown.space.prevent="startDirection"
        >({{ direction }})</span>
      </span>
    </span>
    <NodeViewContent as="span" class="d-line__text" />
    <span class="d-line__aside" contenteditable="false">
      <button
        v-if="isFree && editable"
        type="button"
        class="d-line__create"
        :aria-label="t('editor.line.createMinorAria', { name: speakerName })"
        @click="createSpeaker()"
      >
        <UIcon name="i-lucide-user-round-plus" class="size-3.5" />
        <span>{{ t('editor.line.createMinor') }}</span>
      </button>
      <span class="d-line__id">{{ lineId ?? t('editor.line.idPending') }}</span>
      <button
        v-if="lineId"
        type="button"
        class="d-line__copy"
        :aria-label="t('editor.line.copyId', { id: lineId })"
        @click="copyId"
      >
        <UIcon name="i-lucide-copy" class="size-3.5" />
      </button>
      <!-- Without Tab (a phone, the mouse) the direction is added from here; the text does not move. -->
      <button
        v-if="editable && !direction && !editingDirection"
        type="button"
        class="d-line__add-direction"
        :aria-label="t('editor.script.addDirection')"
        @click="startDirection"
      >
        <UIcon name="i-lucide-plus" class="size-3.5" />
        <span>{{ t('editor.line.direction') }}</span>
      </button>
    </span>
  </NodeViewWrapper>
</template>

<style>
/* A line of dialogue (DESIGN.md, the manuscript): speaker in tracked capitals, direction in italic and
   in parentheses, the line in roman, wrapped lines hanging 2em. */
.d-line {
  position: relative;
  padding-inline-start: 2em;
  text-indent: -2em;
  margin-block: 0.25em;
}
.d-line__meta {
  user-select: none;
}
/* A text field as wide as its text: an invisible copy of the text sizes the cell the input fills. */
.d-line__field {
  position: relative;
  display: inline-grid;
  vertical-align: baseline;
  text-indent: 0;
}
.d-line__field > .d-line__sizer,
.d-line__field > .d-line__input {
  grid-area: 1 / 1;
  min-width: 0;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  white-space: pre;
}
.d-line__sizer {
  visibility: hidden;
}
.d-line__input {
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: inherit;
  outline: none;
}
.d-line__input::placeholder {
  color: var(--ui-text-dimmed);
}
.d-line__input:focus-visible {
  box-shadow: 0 1px 0 var(--ui-primary);
}
.d-line__speaker {
  margin-inline-end: 0.5em;
  font-family: var(--manuscript-font);
  font-size: 0.8125em;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-toned);
}
.d-line__speaker .d-line__input::placeholder {
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}
.d-line.is-free .d-line__speaker .d-line__input {
  text-decoration: underline dotted var(--ui-border-accented);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.22em;
}
.d-line__direction {
  margin-inline-end: 0.4em;
  font-style: italic;
  color: var(--ui-text-muted);
}
.d-line__direction .d-line__field {
  max-width: 100%;
}
.d-line__direction-text {
  border-radius: 2px;
  cursor: text;
  outline: none;
}
.d-line__direction-text:focus-visible {
  box-shadow: 0 0 0 2px var(--ui-primary);
}
/* An empty direction takes no room until it is focused (Tab from the speaker). */
.d-line__direction.is-empty {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
/* Below 16px a focused field makes iOS zoom the page: while it is edited on a phone, the speaker grows. */
@media (pointer: coarse) {
  .d-line__speaker:focus-within,
  .d-line__direction:focus-within {
    font-size: max(1rem, 0.8125em);
  }
}
.d-line__options {
  position: absolute;
  inset-inline-start: 0;
  top: calc(100% + 0.35rem);
  z-index: 30;
  width: max-content;
  min-width: 14rem;
  max-width: min(20rem, 80vw);
  max-height: 14rem;
  overflow-y: auto;
  padding: 0.25rem;
  text-indent: 0;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-style: normal;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.35;
  text-transform: none;
  white-space: normal;
  color: var(--ui-text);
  background: var(--ui-bg-floating);
  box-shadow: var(--shadow-floating);
  border-radius: 6px;
  outline: 1px solid var(--ui-border);
}
.d-line__option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 4.5px;
  cursor: pointer;
}
.d-line__option.is-active {
  background: var(--ui-bg-elevated);
  color: var(--ui-text-highlighted);
}
/* "Crea come comparsa" for a free label and "+ Indicazione" for a line without one, in the margin
   with the id. */
.d-line__create,
.d-line__add-direction {
  display: inline-flex;
  order: 2;
  align-items: center;
  gap: 0.25rem;
  margin-inline-start: -0.35rem;
  padding: 0 0.35rem;
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.6;
  color: var(--ui-primary);
  border-radius: 4.5px;
}
.d-line__add-direction {
  order: 3;
  color: var(--ui-text-muted);
}
.d-line__create:hover,
.d-line__add-direction:hover {
  background: var(--ui-bg-elevated);
  color: var(--ui-text-highlighted);
}
.d-line__create:hover {
  color: var(--ui-primary);
}
.d-line__create:focus-visible,
.d-line__add-direction:focus-visible,
.d-line__copy:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 1px;
}
.d-line__text {
  white-space: pre-wrap;
}
/* The id, in the right margin like the line numbers of a critical edition. */
.d-line__aside {
  position: absolute;
  width: max-content;
  top: 0.15em;
  inset-inline-start: calc(100% + 1.25rem);
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  max-width: 10rem;
  gap: 0.125rem 0.25rem;
  text-indent: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-style: normal;
  font-weight: 400;
  line-height: 1.6;
  color: var(--ui-text-dimmed);
  white-space: nowrap;
  user-select: none;
  background: var(--ui-bg);
  border-radius: 4.5px;
  /* Hidden, it lets the pointer through to the lines below it, which its second row may reach; it
     stays a moment after the pointer leaves the line, long enough to reach it across the margin. */
  opacity: 0;
  visibility: hidden;
  transition: opacity 150ms var(--ease-out-expo) 150ms, visibility 0s linear 300ms;
}
.d-line:hover .d-line__aside,
.d-line:focus-within .d-line__aside,
.d-line.has-caret .d-line__aside {
  z-index: 1;
  opacity: 1;
  visibility: visible;
  transition: opacity 150ms var(--ease-out-expo), visibility 0s;
}
.d-line:hover .d-line__aside {
  z-index: 2;
}
.d-line__copy {
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 4.5px;
  color: var(--ui-text-muted);
}
.d-line__copy:hover {
  background: var(--ui-bg-elevated);
  color: var(--ui-text-highlighted);
}
/* No margin to the right (details open, narrow windows, phones): the id follows the line, only while
   the caret is in it. */
.d-surface--narrow .d-line__aside {
  position: static;
  display: none;
  max-width: 100%;
  margin-inline-start: 0.6rem;
  vertical-align: 0.05em;
}
.d-surface--narrow .d-line.has-caret .d-line__aside {
  display: inline-flex;
  opacity: 1;
}
/* Phones: the line's buttons keep their size and grow an invisible 44px hit area, spaced so the areas
   do not overlap. */
@media (pointer: coarse) {
  .d-line__aside {
    gap: 0.5rem 0.75rem;
  }
  .d-line__create,
  .d-line__add-direction,
  .d-line__copy {
    position: relative;
    z-index: 1;
  }
  .d-line__create::before,
  .d-line__add-direction::before,
  .d-line__copy::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: max(100%, 2.75rem);
    height: max(100%, 2.75rem);
    transform: translate(-50%, -50%);
  }
}
</style>
