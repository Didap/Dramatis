<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { Suggestion, exitSuggestion } from '@tiptap/suggestion'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import type { EntityRef, RefType } from '#shared/types/domain'
import { CHARACTER_IMPORTANCES } from '#shared/utils/constants'
import { mentionId } from '#shared/utils/richtext'

/**
 * The @ menu (spec 5.3): characters first (main, secondary, minor), then locations, objects, groups and
 * codex entries. Names and aliases match, accents and case aside ("@nic" finds "Nicolò"); a match on an
 * alias inserts the alias. The last items create a character (a minor one), a location or an object.
 *
 * Whenever the query changes the highlight goes back to the best match, and the pointer moves it only
 * when it really moves: a list that opens or changes under a resting pointer chooses nothing by itself.
 */
const props = defineProps<{ editor: Editor }>()
const emit = defineEmits<{ openEntity: [ref: EntityRef] }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label: enumLabel } = useEnums()
const toast = useToast()
const uid = useId()

const pluginKey = new PluginKey('sceneMentionMenu')
const query = ref('')
const open = ref(false)
const active = ref(0)
const position = ref<{ x: number, y: number } | null>(null)
const mounted = ref(false)
const menuEl = useTemplateRef<HTMLElement>('menu')
const listEl = useTemplateRef<HTMLElement>('list')
const listId = `${uid}-mentions`
const optionId = (index: number) => `${listId}-${index}`

/** Words of the app are translated when the menu draws, never kept: the menu outlives a change of language. */
type Text = () => string

interface Candidate {
  ref: EntityRef
  name: string
  aliases: string[]
  description: Text
  color?: string
}

type Row =
  | { kind: 'entity', key: string, index: number, ref: EntityRef, label: string, name: string, followsName: boolean, description: Text, color?: string }
  | { kind: 'create', key: string, index: number, entityType: 'character' | 'location' | 'object', name: string, text: Text }

interface Section { key: string, label: Text, rows: Row[] }

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

/** 0 the start of the name, 1 the start of a word, 2 anywhere; null no match. */
function score(text: string, q: string): number | null {
  const folded = fold(text)
  if (folded.startsWith(q)) return 0
  if (folded.split(/[\s'’-]+/).some(word => word.startsWith(q))) return 1
  return folded.includes(q) ? 2 : null
}

const groups = computed(() => {
  const importance = (key: string) => CHARACTER_IMPORTANCES.indexOf(key as never)
  const characters = [...store.rows.characters]
    .sort((a, b) => importance(a.importance) - importance(b.importance) || a.position - b.position)
    .map<Candidate>(c => ({ ref: { type: 'character', id: c.id }, name: c.name, aliases: c.aliases, description: () => enumLabel('importance', c.importance), color: c.color }))
  const list: { key: string, label: Text, entries: Candidate[] }[] = [
    { key: 'character', label: () => term('characters'), entries: characters },
    { key: 'location', label: () => term('locations'), entries: store.rows.locations.map(l => ({ ref: { type: 'location', id: l.id }, name: l.name, aliases: [], description: () => [l.city, l.region, l.nation].filter(Boolean).join(', ') || term('location') })) },
    { key: 'object', label: () => term('objects'), entries: store.rows.objects.map(o => ({ ref: { type: 'object', id: o.id }, name: o.name, aliases: [], description: () => o.kind || term('object') })) },
    { key: 'group', label: () => term('groups'), entries: store.rows.groups.map(g => ({ ref: { type: 'group', id: g.id }, name: g.name, aliases: [], description: () => enumLabel('groupKind', g.kind), color: g.color })) },
  ]
  if (store.modules.codex) {
    list.push({ key: 'codex', label: () => term('codex'), entries: store.rows.codexEntries.map(e => ({ ref: { type: 'codex', id: e.id }, name: e.title, aliases: [], description: () => store.get('codexCategories', e.categoryId)?.name ?? term('codexEntry') })) })
  }
  return list
})

/** The rows by kind; `index` counts the rows across kinds, entities before the "Crea" rows. */
const sections = computed<Section[]>(() => {
  const raw = query.value.trim()
  const q = fold(raw)
  const out: Section[] = []
  let index = 0
  for (const group of groups.value) {
    const matches: { row: Row, score: number }[] = []
    for (const entry of group.entries) {
      let best: number | null = 0
      let label = entry.name
      if (q) {
        best = score(entry.name, q)
        for (const alias of entry.aliases) {
          const s = score(alias, q)
          if (s !== null && (best === null || s < best)) {
            best = s
            label = alias
          }
        }
      }
      if (best === null) continue
      const followsName = label === entry.name
      const description = followsName ? entry.description : () => entry.name
      matches.push({ row: { kind: 'entity', key: `${entry.ref.type}:${entry.ref.id}`, index: 0, ref: entry.ref, label, name: entry.name, followsName, description, color: entry.color }, score: best })
    }
    // Without a query every kind gets a few rows, so the list shows its shape.
    const shown = matches.sort((a, b) => a.score - b.score).slice(0, q ? 12 : 6)
    for (const match of shown) match.row.index = index++
    if (shown.length) out.push({ key: group.key, label: group.label, rows: shown.map(m => m.row) })
  }
  const exact = groups.value.some(g => g.entries.some(e => fold(e.name) === q))
  if (raw && !exact) {
    out.push({
      key: 'create',
      label: () => t('editor.mention.createTitle'),
      rows: (['character', 'location', 'object'] as const).map(entityType => ({
        kind: 'create' as const,
        key: `create:${entityType}`,
        index: index++,
        entityType,
        name: raw,
        text: () => t('editor.mention.createAs', { name: raw, what: term(entityType).toLocaleLowerCase() }),
      })),
    })
  }
  return out
})

const rows = computed(() => sections.value.flatMap(section => section.rows))

const iconOf = (type: RefType) => REF_ICONS[type] ?? 'i-lucide-at-sign'

/** Inserts the mention and a space, unless the text already continues with one or with punctuation. */
function insertMention(editor: Editor, range: { from: number, to: number }, attrs: { id: string, label: string, followsName: boolean }) {
  const next = editor.state.doc.textBetween(range.to, Math.min(range.to + 1, editor.state.doc.content.size), '', '')
  const space = !/^[\s.,;:!?…»”’)\]]/.test(next)
  editor.chain().focus().insertContentAt(range, [{ type: 'mention', attrs }, ...(space ? [{ type: 'text', text: ' ' }] : [])]).run()
}

const COLLECTIONS = { character: 'characters', location: 'locations', object: 'objects' } as const

/**
 * "Crea «Ivan» come personaggio": the mention goes in at once with a temporary id, so typing can go on,
 * and takes the new entity's id when the server answers (plain text again if it fails).
 */
async function createAndMention(editor: Editor, range: { from: number, to: number }, type: 'character' | 'location' | 'object', name: string) {
  const temporary = `pending:${Math.random().toString(36).slice(2)}`
  insertMention(editor, range, { id: temporary, label: name, followsName: true })
  const replace = (make: (pos: number, node: { attrs: Record<string, unknown>, nodeSize: number }) => void) => {
    if (editor.isDestroyed) return
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'mention' && node.attrs.id === temporary) make(pos, node)
    })
  }
  try {
    const row = await store.create(COLLECTIONS[type], { name, ...(type === 'character' ? { importance: 'minor' } : {}) } as never)
    const ref = { type, id: row.id }
    replace((pos, node) => editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: mentionId(type, row.id) })))
    toast.add({
      title: type === 'character' ? t('editor.mention.createdMinor', { name }) : t('editor.mention.createdAs', { name, what: term(type).toLocaleLowerCase() }),
      icon: REF_ICONS[type],
      actions: [{ label: t('editor.mention.openSheet'), onClick: () => emit('openEntity', ref) }],
    })
  }
  catch {
    replace((pos, node) => editor.view.dispatch(editor.state.tr.insertText(name, pos, pos + node.nodeSize)))
  }
}

function onSelect(editor: Editor, range: { from: number, to: number }, row: Row) {
  if (row.kind === 'create') void createAndMention(editor, range, row.entityType, row.name)
  else insertMention(editor, range, { id: mentionId(row.ref.type, row.ref.id), label: row.label, followsName: row.followsName })
}

// ---------------------------------------------------------------- the menu's life

/** The suggestion as last reported: its range and its command. */
let current: SuggestionProps<Row, Row> | null = null
let unmount: (() => void) | null = null
/** Set once the pointer really moves over the list; until then the pointer highlights nothing. */
let pointerMoved = false

function restart(value: string) {
  query.value = value
  active.value = 0
  pointerMoved = false
  if (listEl.value) listEl.value.scrollTop = 0
}

function place({ x, y }: { x: number, y: number }) {
  // Floating UI keeps the menu by the caret, above it when there is no room below; this keeps it
  // inside the width of the window too.
  const width = menuEl.value?.offsetWidth ?? 0
  const room = document.documentElement.clientWidth - width - 8
  position.value = { x: Math.max(8, Math.min(x, room)), y }
}

function onStart(suggestion: SuggestionProps<Row, Row>) {
  current = suggestion
  restart(suggestion.query)
  position.value = null
  open.value = true
  nextTick(() => {
    if (!open.value || unmount || !menuEl.value || !current) return
    unmount = current.mount(menuEl.value, { onPosition: place })
  })
}

function onUpdate(suggestion: SuggestionProps<Row, Row>) {
  current = suggestion
  if (suggestion.query !== query.value) restart(suggestion.query)
}

function onExit() {
  unmount?.()
  unmount = null
  current = null
  open.value = false
  position.value = null
  query.value = ''
}

function choose(row: Row) {
  current?.command(row)
}

/** Keeps the highlighted row in sight, with its heading when it is the first of its kind. */
function reveal() {
  const list = listEl.value
  const row = list?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)
  if (!list || !row) return
  const before = row.previousElementSibling as HTMLElement | null
  const top = (before && before.getAttribute('role') !== 'option' ? before : row).offsetTop - 4
  const bottom = row.offsetTop + row.offsetHeight + 4
  if (top < list.scrollTop) list.scrollTop = top
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
}

function onKeyDown({ event }: SuggestionKeyDownProps): boolean {
  const count = rows.value.length
  if (!open.value || !count || event.isComposing) return false
  // Esc: the plugin closes the menu and leaves the @ as typed.
  if (event.key === 'Escape') return true
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    active.value = (active.value + (event.key === 'ArrowDown' ? 1 : count - 1)) % count
    nextTick(reveal)
    return true
  }
  if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
    const row = rows.value[active.value]
    if (row) choose(row)
    return true
  }
  return false
}

function onPointerMove(event: PointerEvent, index: number) {
  if (event.pointerType === 'touch') return
  if (!pointerMoved) {
    if (!event.movementX && !event.movementY) return
    pointerMoved = true
  }
  active.value = index
}

function onRowDown(event: MouseEvent, row: Row) {
  if (event.button === 0) choose(row)
}

/** Leaving the text (another window, a field elsewhere) closes the menu. */
function onBlur() {
  setTimeout(() => {
    if (open.value && !props.editor.isDestroyed && !props.editor.view.hasFocus()) exitSuggestion(props.editor.view, pluginKey)
  })
}

// The text keeps the focus while the list is open: the highlighted row is its active descendant.
watchPostEffect(() => {
  if (!mounted.value || props.editor.isDestroyed) return
  const dom = props.editor.view.dom
  const row = open.value ? rows.value[active.value] : undefined
  if (row) {
    dom.setAttribute('aria-controls', listId)
    dom.setAttribute('aria-activedescendant', optionId(row.index))
  }
  else {
    dom.removeAttribute('aria-controls')
    dom.removeAttribute('aria-activedescendant')
  }
})

onMounted(async () => {
  await nextTick()
  if (props.editor.isDestroyed) return
  const plugin = Suggestion<Row, Row>({
    editor: props.editor,
    pluginKey,
    char: '@',
    // After a space, at the start of a paragraph, or after an opening quote, bracket or dash.
    allowedPrefixes: [' ', ' ', '«', '“', '"', '(', '—', '–'],
    items: () => [],
    command: ({ editor, range, props: row }) => onSelect(editor, range, row),
    render: () => ({ onStart, onUpdate, onExit, onKeyDown }),
    placement: 'bottom-start',
    offset: { mainAxis: 6 },
    floatingUi: { strategy: 'fixed' },
    container: document.body,
  })
  // First among the plugins, so Enter, Tab and the arrows reach the menu before the text's own keys.
  props.editor.registerPlugin(plugin, (added, plugins) => [added, ...plugins])
  props.editor.view.dom.addEventListener('blur', onBlur)
  mounted.value = true
})

onBeforeUnmount(() => {
  onExit()
  mounted.value = false
  if (props.editor.isDestroyed) return
  const dom = props.editor.view.dom
  dom.removeEventListener('blur', onBlur)
  dom.removeAttribute('aria-controls')
  dom.removeAttribute('aria-activedescendant')
  props.editor.unregisterPlugin(pluginKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      v-show="rows.length"
      ref="menu"
      class="d-mention-menu fixed z-50 flex max-h-80 w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[6px] bg-(--ui-bg-floating) shadow-(--shadow-floating) ring ring-default"
      :style="position ? { left: `${position.x}px`, top: `${position.y}px` } : { left: '0px', top: '0px', visibility: 'hidden' }"
      @mousedown.prevent
    >
      <div
        :id="listId"
        ref="list"
        role="listbox"
        :aria-label="t('editor.script.mentions')"
        class="relative flex-1 scroll-py-1 overflow-y-auto overscroll-contain p-1"
      >
        <div
          v-for="section in sections"
          :key="section.key"
          role="group"
          :aria-labelledby="`${listId}-${section.key}`"
        >
          <div :id="`${listId}-${section.key}`" role="presentation" class="px-2 pt-2 pb-1 text-xs font-medium text-muted">
            {{ section.label() }}
          </div>
          <div
            v-for="row in section.rows"
            :id="optionId(row.index)"
            :key="row.key"
            role="option"
            :aria-selected="row.index === active"
            :data-index="row.index"
            :data-highlighted="row.index === active ? '' : undefined"
            class="flex w-full cursor-pointer select-none items-center gap-2.5 rounded-[4.5px] px-2 py-1.5 text-sm text-default data-highlighted:bg-elevated data-highlighted:text-highlighted pointer-coarse:min-h-11"
            @mousedown="onRowDown($event, row)"
            @pointermove="onPointerMove($event, row.index)"
          >
            <template v-if="row.kind === 'entity'">
              <DEntityAvatar
                v-if="row.ref.type === 'character'"
                :name="row.name"
                :image-id="store.primaryImage('character', row.ref.id)"
                :color="row.color || null"
                size="xs"
              />
              <UIcon v-else :name="iconOf(row.ref.type)" class="size-4 shrink-0 text-dimmed" />
              <span class="flex min-w-0 flex-1 items-baseline gap-2">
                <span class="voice-author max-w-[65%] shrink-0 truncate font-semibold">{{ row.label }}</span>
                <span class="min-w-0 truncate text-xs text-muted">{{ row.description() }}</span>
              </span>
            </template>
            <template v-else>
              <UIcon name="i-lucide-plus" class="size-4 shrink-0 text-dimmed" />
              <span class="min-w-0 flex-1 truncate">{{ row.text() }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
