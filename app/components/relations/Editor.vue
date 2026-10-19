<script setup lang="ts">
import type { RelationKind } from '#shared/types/domain'
import type { Relation } from '#shared/types/entities'
import { parseMentionId } from '#shared/utils/richtext'
import { useRelationDrafts } from './Form.vue'

/**
 * The relationship form in a slideover on desktop and a bottom drawer on a phone ("Nuova relazione",
 * or an existing relationship to edit or trash). Open it with `show()`. With `routed`, its state lives
 * in the query string (?relation=<id>|new&a=&b=), so the back button closes it (spec 1.5).
 * Closing it any other way than "Salva" or "Annulla" keeps what was typed as a draft for the next opening.
 */
const props = withDefaults(defineProps<{
  excludeKinds?: RelationKind[]
  routed?: boolean
}>(), { excludeKinds: () => [], routed: false })

const emit = defineEmits<{ saved: [relation: Relation, created: boolean], trashed: [id: string] }>()

const store = useProjectStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useToast()
// The window's width is read at once (a media query only answers after mounting): no phone flash on desktop.
const { width } = useWindowSize()
const desktop = computed(() => width.value >= 1024)
const form = ref<{ focusFirst: () => void } | null>(null)

interface EditorState { relationId: string | null, a: string | null, b: string | null }
const local = reactive({ open: false, relationId: null as string | null, a: null as string | null, b: null as string | null })

const query = (name: string) => (typeof route.query[name] === 'string' ? route.query[name] as string : null)
const state = computed<EditorState & { open: boolean }>(() => {
  if (!props.routed) return local
  const relation = query('relation')
  return { open: !!relation, relationId: relation && relation !== 'new' ? relation : null, a: query('a'), b: query('b') }
})

/** Whether this editor added the history entry it is open on (then closing goes back). */
let pushed = false
watch(() => route.query.relation, (value) => { if (!value) pushed = false })

function show(next: Partial<EditorState> = {}) {
  if (!props.routed) {
    Object.assign(local, { relationId: next.relationId ?? null, a: next.a ?? null, b: next.b ?? null, open: true })
    return
  }
  const wasOpen = !!route.query.relation
  const target = { query: { ...route.query, relation: next.relationId ?? 'new', a: next.a ?? undefined, b: next.b ?? undefined } }
  if (wasOpen) void router.replace(target)
  else {
    pushed = true
    void router.push(target)
  }
}

function close() {
  if (!props.routed) {
    local.open = false
    return
  }
  if (!route.query.relation) return
  if (pushed) {
    pushed = false
    router.back()
  }
  else {
    void router.replace({ query: { ...route.query, relation: undefined, a: undefined, b: undefined } })
  }
}

const open = computed({
  get: () => state.value.open,
  set: (value: boolean) => { if (!value) close() },
})

const relation = computed(() => (state.value.relationId ? store.get('relations', state.value.relationId) ?? null : null))
const missing = computed(() => !!state.value.relationId && !relation.value)
const title = computed(() => (state.value.relationId ? t('relations.form.titleEdit') : t('relations.form.titleNew')))
const description = computed(() => {
  const r = relation.value
  if (!r) return undefined
  return t('relations.form.between', {
    a: store.refLabel({ type: r.sourceType, id: r.sourceId }),
    b: store.refLabel({ type: r.targetType, id: r.targetId }),
  })
})

// A fresh form each time it opens: it starts from the relationship, or from the draft left last time.
const opened = ref(0)
watch(open, (value) => { if (value) opened.value++ }, { immediate: true })
const formKey = computed(() => `${opened.value}:${state.value.relationId ?? 'new'}:${state.value.a ?? ''}:${state.value.b ?? ''}`)

// ---------------------------------------------------------------- drafts

const drafts = useRelationDrafts()
const draftKeyOf = (s: EditorState) => (s.relationId ? `edit:${s.relationId}` : `new:${s.a ?? ''}|${s.b ?? ''}`)
const draftKey = computed(() => draftKeyOf(state.value))

/** Closed by "Salva", "Annulla" or the trash: nothing was left behind. */
let settled = false
let lastState: EditorState | null = null
let draftToast: string | number | null = null

// Closed by Esc, a tap outside, a swipe or the back button with words typed: say that they are kept.
watch(open, (now, before) => {
  if (now) {
    settled = false
    lastState = { relationId: state.value.relationId, a: state.value.a, b: state.value.b }
    if (draftToast !== null) toast.remove(draftToast)
    draftToast = null
    return
  }
  if (!before || settled || !lastState) return
  const draft = drafts.value[draftKeyOf(lastState)]
  if (!draft || !(draft.description.trim() || Object.values(draft.labels).some(v => v.trim()))) return
  const reopen = lastState
  draftToast = toast.add({
    title: t('relations.form.draftKept'),
    description: t('relations.form.draftKeptBody'),
    icon: 'i-lucide-history',
    actions: [{ label: t('relations.form.draftReopen'), onClick: () => show(reopen) }],
  }).id
}, { immediate: true })

onBeforeUnmount(() => { if (draftToast !== null) toast.remove(draftToast) })

/** A side that is not (or no longer) in the project is left empty. */
const known = (key: string | null) => (key && store.getRef(parseMentionId(key)) ? key : null)

function onSaved(row: Relation, created: boolean) {
  settled = true
  emit('saved', row, created)
  close()
}

function onCancel() {
  settled = true
  close()
}

function onTrashed(id: string) {
  settled = true
  emit('trashed', id)
  close()
}

/** The dialog focuses the first field to fill instead of its first control. */
function onOpenAutoFocus(event: Event) {
  if (!form.value) return
  event.preventDefault()
  form.value.focusFirst()
}

defineExpose({ show, close })
</script>

<template>
  <USlideover
    v-if="desktop"
    v-model:open="open"
    :title="title"
    :description="description"
    :content="{ onOpenAutoFocus }"
    :ui="{ content: 'max-w-lg', body: missing ? 'pb-8' : 'pb-0 sm:pb-0' }"
  >
    <template #body>
      <p v-if="missing" class="text-sm text-muted">{{ t('relations.form.missing') }}</p>
      <RelationsForm
        v-else
        :key="formKey"
        ref="form"
        :relation="relation"
        :a="known(state.a)"
        :b="known(state.b)"
        :exclude-kinds="excludeKinds"
        :draft-key="draftKey"
        @saved="onSaved"
        @cancel="onCancel"
        @trashed="onTrashed"
      />
    </template>
  </USlideover>
  <UDrawer
    v-else
    v-model:open="open"
    :title="title"
    :description="description"
    :ui="{ container: missing ? 'pb-[calc(1.5rem+env(safe-area-inset-bottom))]' : 'pb-0' }"
  >
    <template #body>
      <p v-if="missing" class="text-sm text-muted">{{ t('relations.form.missing') }}</p>
      <RelationsForm
        v-else
        :key="formKey"
        :relation="relation"
        :a="known(state.a)"
        :b="known(state.b)"
        :exclude-kinds="excludeKinds"
        :draft-key="draftKey"
        @saved="onSaved"
        @cancel="onCancel"
        @trashed="onTrashed"
      />
    </template>
  </UDrawer>
</template>
