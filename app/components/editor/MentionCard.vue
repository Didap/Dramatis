<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import type { EntityRef } from '#shared/types/domain'
import { PROFILE_SECTIONS } from '#shared/content/profile'
import { excerpt, isEmptyDoc, parseMentionId } from '#shared/utils/richtext'

/**
 * The card of a mention (spec 5.3): picture, name, importance, one-line description and the first
 * answered questions of the physical profile, so an eye colour is checked without leaving the scene.
 * The surface opens it on hover and tap; from the keyboard, Alt+Down with the caret next to a mention
 * opens it with the focus inside, so Tab reaches "Apri scheda", and Esc goes back to the text.
 */
const props = defineProps<{
  refId: string
  anchor: HTMLElement | null
  touch: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ enter: [], leave: [], openEntity: [ref: EntityRef] }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label: enumLabel } = useEnums()

/** The mention chosen from the keyboard, which wins over the surface's until the pointer takes over. */
const fromKeys = shallowRef<{ refId: string, anchor: HTMLElement, editor: Editor } | null>(null)
const cardRef = computed(() => fromKeys.value?.refId ?? props.refId)
const cardAnchor = computed(() => fromKeys.value?.anchor ?? props.anchor)
const cardEl = useTemplateRef<HTMLElement>('card')
let openingFromKeys = false
/** The text to go back to when the card closes. */
let returnTo: Editor | null = null

watch(() => [props.refId, props.anchor], () => {
  fromKeys.value = null
})
watch(open, (value) => {
  if (!value) return
  if (openingFromKeys) openingFromKeys = false
  else fromKeys.value = null
})

/** The mention the caret touches (or one character away, past the space that follows it). */
function mentionNearCaret(editor: Editor): { pos: number, id: string } | null {
  const { selection } = editor.state
  if (selection instanceof NodeSelection) {
    return selection.node.type.name === 'mention' ? { pos: selection.from, id: String(selection.node.attrs.id ?? '') } : null
  }
  const { $head } = selection
  if (!$head.parent.isTextblock) return null
  const start = $head.start()
  let best: { pos: number, id: string, distance: number } | null = null
  $head.parent.forEach((node, offset) => {
    if (node.type.name !== 'mention') return
    const from = start + offset
    const to = from + node.nodeSize
    const distance = $head.pos < from ? from - $head.pos : $head.pos > to ? $head.pos - to : 0
    if (distance <= 1 && (!best || distance < best.distance)) best = { pos: from, id: String(node.attrs.id ?? ''), distance }
  })
  return best
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' || !event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || event.isComposing) return
  // Only from the text itself: the fields of a dialogue line keep Alt+Down for their own list.
  const dom = event.target as (HTMLElement & { editor?: Editor }) | null
  if (!dom?.classList?.contains('ProseMirror') || !dom.closest('.d-surface')) return
  const editor = dom.editor
  if (!editor || editor.isDestroyed) return
  const found = mentionNearCaret(editor)
  const element = found ? editor.view.nodeDOM(found.pos) : null
  if (!found || !(element instanceof HTMLElement) || element.classList.contains('is-missing') || !parseMentionId(found.id)) return
  event.preventDefault()
  event.stopPropagation()
  fromKeys.value = { refId: found.id, anchor: element, editor }
  if (!open.value) {
    openingFromKeys = true
    open.value = true
  }
  nextTick(() => requestAnimationFrame(() => cardEl.value?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })))
}

/** Tab from the card goes back to the text, as Esc does: the card is a glance, not a place. */
function onCardKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !fromKeys.value) return
  event.preventDefault()
  returnTo = fromKeys.value.editor
  open.value = false
}

/** The pointer on another mention: the surface's card takes over. */
function onMouseOver(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (fromKeys.value && target?.closest?.('.d-surface .mention') && !fromKeys.value.anchor.contains(target)) fromKeys.value = null
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown, true)
  document.addEventListener('mouseover', onMouseOver, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  document.removeEventListener('mouseover', onMouseOver, true)
})

const entity = computed(() => parseMentionId(cardRef.value))

const view = computed(() => {
  const target = entity.value
  if (!target) return null
  switch (target.type) {
    case 'character': {
      const c = store.get('characters', target.id)
      if (!c) return null
      const physical = c.profile?.physical
      const questions = PROFILE_SECTIONS.find(s => s.key === 'physical')?.questions ?? []
      const answers = physical?.mode === 'free'
        ? []
        : questions.filter(q => physical?.answers?.[q]?.trim()).slice(0, 4).map(q => ({ question: t(`profile.sections.physical.questions.${q}.label`), answer: physical!.answers![q]!.trim() }))
      const free = !answers.length && physical?.free && !isEmptyDoc(physical.free) ? excerpt(physical.free, 240) : ''
      return {
        name: c.name,
        kind: [enumLabel('importance', c.importance), c.role ? enumLabel('role', c.role) : ''].filter(Boolean).join(', '),
        tagline: c.tagline,
        aliases: c.aliases,
        answers,
        text: free || (c.description && !isEmptyDoc(c.description) ? excerpt(c.description, 240) : ''),
        imageId: store.primaryImage('character', c.id),
        color: c.color,
        shape: 'portrait' as const,
        icon: undefined,
      }
    }
    case 'location': {
      const l = store.get('locations', target.id)
      if (!l) return null
      return { name: l.name, kind: [term('location'), [l.city, l.region, l.nation].filter(Boolean).join(', ')].filter(Boolean).join(' · '), tagline: '', aliases: [], answers: [], text: excerpt(l.description, 260), imageId: store.primaryImage('location', l.id), color: l.color, shape: 'square' as const, icon: REF_ICONS.location }
    }
    case 'object': {
      const o = store.get('objects', target.id)
      if (!o) return null
      return { name: o.name, kind: [term('object'), o.kind].filter(Boolean).join(' · '), tagline: '', aliases: [], answers: [], text: excerpt(o.description, 260), imageId: store.primaryImage('object', o.id), color: o.color, shape: 'square' as const, icon: REF_ICONS.object }
    }
    case 'group': {
      const g = store.get('groups', target.id)
      if (!g) return null
      return { name: g.name, kind: [term('group'), enumLabel('groupKind', g.kind)].join(' · '), tagline: '', aliases: [], answers: [], text: excerpt(g.description, 260), imageId: store.primaryImage('group', g.id), color: g.color, shape: 'square' as const, icon: REF_ICONS.group }
    }
    case 'codex': {
      const e = store.get('codexEntries', target.id)
      if (!e) return null
      return { name: e.title, kind: [term('codexEntry'), store.get('codexCategories', e.categoryId)?.name].filter(Boolean).join(' · '), tagline: '', aliases: [], answers: [], text: excerpt(e.body, 260), imageId: null, color: '', shape: 'square' as const, icon: REF_ICONS.codex }
    }
  }
  return null
})

const content = {
  side: 'bottom' as const,
  align: 'start' as const,
  sideOffset: 6,
  collisionPadding: 12,
  // Opened by the pointer, the caret stays in the text; opened from the keyboard, the card takes the
  // focus once drawn (onKeydown) and gives it back to the text on Esc or Tab.
  onOpenAutoFocus: (event: Event) => event.preventDefault(),
  onCloseAutoFocus: (event: Event) => {
    event.preventDefault()
    const editor = returnTo
    returnTo = null
    if (editor && !editor.isDestroyed) editor.view.focus()
  },
  onEscapeKeyDown: () => {
    if (fromKeys.value && cardEl.value?.contains(document.activeElement)) returnTo = fromKeys.value.editor
  },
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :reference="cardAnchor ?? undefined"
    :content="content"
    :ui="{ content: 'p-0' }"
  >
    <template #content>
      <div
        v-if="view && entity"
        ref="card"
        class="w-80 max-w-[calc(100vw-2rem)] p-4"
        @mouseenter="emit('enter')"
        @mouseleave="emit('leave')"
        @keydown="onCardKeydown"
      >
        <div class="flex items-start gap-3">
          <DEntityAvatar :name="view.name" :image-id="view.imageId" :color="view.color || null" :shape="view.shape" :icon="view.icon" size="md" />
          <div class="min-w-0 flex-1">
            <p class="voice-author text-lg font-semibold leading-tight text-highlighted">{{ view.name }}</p>
            <p v-if="view.kind" class="mt-0.5 text-xs text-muted">{{ view.kind }}</p>
            <p v-if="view.tagline" class="voice-author mt-1 text-sm italic text-muted">{{ view.tagline }}</p>
          </div>
        </div>
        <p v-if="view.aliases.length" class="mt-2 text-xs text-muted">
          {{ t('editor.mention.aliases') }} <span class="voice-author text-sm text-toned">{{ view.aliases.join(', ') }}</span>
        </p>
        <dl v-if="view.answers.length" class="mt-3 space-y-2 border-t border-default pt-3">
          <div v-for="item in view.answers" :key="item.question">
            <dt class="text-xs text-muted">{{ item.question }}</dt>
            <dd class="voice-author line-clamp-3 text-sm text-default">{{ item.answer }}</dd>
          </div>
        </dl>
        <p v-else-if="view.text" class="voice-author mt-3 line-clamp-5 border-t border-default pt-3 text-sm text-default">{{ view.text }}</p>
        <div class="mt-3 flex justify-end">
          <UButton
            size="sm"
            variant="outline"
            :class="touch ? 'min-h-11' : ''"
            :label="t('editor.mention.openSheet')"
            trailing-icon="i-lucide-arrow-up-right"
            @click="emit('openEntity', entity)"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
