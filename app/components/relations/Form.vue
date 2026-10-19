<script lang="ts">
import type { RelationKind } from '#shared/types/domain'

/** What the author typed in a relationship form that closed without "Salva" or "Annulla". */
export interface RelationDraft {
  sideA: string | null
  sideB: string | null
  /** By side, as in the form: what each side is to the other. */
  labels: Record<string, string>
  same: boolean
  kind: RelationKind | null
  directed: boolean
  directionChosen: boolean
  description: string
}

/**
 * The drafts of this session, by form ("edit:<relationId>", "new:<a>|<b>"): an Esc, a tap outside, a
 * swipe or the back button close the form but never throw away what was typed (spec 0.5).
 */
export const useRelationDrafts = () => useState<Record<string, RelationDraft>>('relations:drafts', () => ({}))
</script>

<script setup lang="ts">
import type { WorldRefType } from '#shared/types/domain'
import type { Relation } from '#shared/types/entities'
import { isDirectedByDefault, isValidRelation, relationKindsFor } from '#shared/utils/relations'
import { parseMentionId } from '#shared/utils/richtext'

/**
 * The relationship form (spec 5.4): the two sides, the relationship read as two sentences
 * ("Tobia è padre di Elsa", "Elsa è figlia di Tobia"), the kind (only those valid for the pair),
 * mutual or directed (default from the kind), a description. Creates or updates a global relationship.
 */
const props = withDefaults(defineProps<{
  /** The relationship being edited; none to create one. */
  relation?: Relation | null
  /** Sides preset for a new relationship ("<type>:<id>"). */
  a?: string | null
  b?: string | null
  /** Kinds not offered here (sheets that list memberships on their own). */
  excludeKinds?: RelationKind[]
  /** Where what is typed waits when the form closes unsaved (see useRelationDrafts). */
  draftKey?: string | null
}>(), { relation: null, a: null, b: null, excludeKinds: () => [], draftKey: null })

const emit = defineEmits<{ saved: [relation: Relation, created: boolean], cancel: [], trashed: [id: string] }>()

const store = useProjectStore()
const { t } = useI18n()
const { label } = useEnums()
const uid = useId()

const keyOf = (type: string, id: string) => `${type}:${id}`
const typeOf = (key: string | null) => (parseMentionId(key)?.type ?? null) as WorldRefType | null
const nameOf = (key: string | null) => store.refLabel(parseMentionId(key))

// ---------------------------------------------------------------- state

const sideA = ref<string | null>(null)
const sideB = ref<string | null>(null)
/** What each side is to the other, by side: the label of the source, the reverse label of the target. */
const labels = reactive<Record<string, string>>({})
/** One label for both sides ("rivali", "sposi"): the reverse label is the label. */
const same = ref(false)
const kind = ref<RelationKind | null>(null)
const directed = ref(false)
/** The author chose the direction: changing the kind no longer resets it. */
const directionChosen = ref(false)
const description = ref('')
const busy = ref(false)
const confirming = ref(false)

function init() {
  const r = props.relation
  if (r) {
    const source = keyOf(r.sourceType, r.sourceId)
    const target = keyOf(r.targetType, r.targetId)
    sideA.value = source
    sideB.value = target
    labels[source] = r.label
    labels[target] = r.reverseLabel
    same.value = !!r.label && r.label === r.reverseLabel
    kind.value = r.kind
    directed.value = r.directed
    description.value = r.description
    return
  }
  sideA.value = props.a
  sideB.value = props.b && props.b !== props.a ? props.b : null
  // Between different kinds of entity the first valid kind is the likely one (a member to its group).
  const preset = samePairKinds.value ? undefined : offered.value[0]?.kind
  if (preset) chooseKind(preset)
}

// ---------------------------------------------------------------- kinds and direction

/**
 * The kinds valid for the pair in either direction (spec 7.12), each with the direction it needs:
 * `swap` means it reads from the second side to the first (a member to its group, an owner to a thing).
 */
const offered = computed<{ kind: RelationKind, swap: boolean }[]>(() => {
  const ta = typeOf(sideA.value)
  const tb = typeOf(sideB.value)
  if (!ta || !tb) return []
  const out = new Map<RelationKind, boolean>()
  const there = relationKindsFor(ta, tb)
  const back = relationKindsFor(tb, ta)
  for (const k of there.kinds) out.set(k, there.swap)
  for (const k of back.kinds) if (!out.has(k)) out.set(k, !back.swap)
  return [...out]
    .filter(([k, swap]) => (!props.excludeKinds.includes(k) || k === props.relation?.kind) && (swap ? isValidRelation(tb, ta, k) : isValidRelation(ta, tb, k)))
    .map(([k, swap]) => ({ kind: k, swap }))
})

/** Two entities of the same kind: no kind is obvious, the author picks one. */
const samePairKinds = computed(() => typeOf(sideA.value) === typeOf(sideB.value) && offered.value.length > 2)

/** Which side the relationship reads from, given the kind (some kinds only go one way). */
const order = computed<{ from: string, to: string } | null>(() => {
  const a = sideA.value
  const b = sideB.value
  if (!a || !b) return null
  const ta = typeOf(a)!
  const tb = typeOf(b)!
  if (!kind.value) return offered.value.length && offered.value.every(o => o.swap) ? { from: b, to: a } : { from: a, to: b }
  return isValidRelation(ta, tb, kind.value) ? { from: a, to: b } : { from: b, to: a }
})

/** Both directions are possible for this kind: the author may turn the relationship around. */
const canSwap = computed(() => {
  const ta = typeOf(sideA.value)
  const tb = typeOf(sideB.value)
  return !!(ta && tb && kind.value && isValidRelation(ta, tb, kind.value) && isValidRelation(tb, ta, kind.value))
})

function chooseKind(next: RelationKind) {
  kind.value = next
  if (!directionChosen.value) directed.value = isDirectedByDefault(next)
}

function chooseDirection(value: boolean) {
  directed.value = value
  directionChosen.value = true
}

function swapSides() {
  ;[sideA.value, sideB.value] = [sideB.value, sideA.value]
}

// A side that changes keeps the kind only when it still fits the new pair.
watch([sideA, sideB], () => {
  if (kind.value && !offered.value.some(o => o.kind === kind.value)) kind.value = null
  if (!kind.value && offered.value.length && !samePairKinds.value) chooseKind(offered.value[0]!.kind)
})

// ---------------------------------------------------------------- the two labels

const labelText = computed(() => (order.value ? labels[order.value.from] ?? '' : ''))

/** The second sentence: its own words, or the first label when it is the same for both. */
const reverseText = computed({
  get: () => (order.value ? (same.value ? labelText.value : labels[order.value.to] ?? '') : ''),
  set: (value: string) => { if (order.value && !same.value) labels[order.value.to] = value },
})

/** Ticking or unticking "Vale per entrambi" starts the second label from the first. */
function setSame(value: boolean | 'indeterminate') {
  if (order.value) labels[order.value.to] = labelText.value
  same.value = value === true
}

// While it is the same for both, both sides keep the same words (turning the sides around included).
watch(labelText, (value) => { if (same.value && order.value) labels[order.value.to] = value })

/**
 * An example in each label field, by kind and medium ("es. padre"). None before the kind is chosen,
 * and none in the second field once the first has words of its own: "figlia" after "suocera" misleads.
 */
function example(side: 'label' | 'reverse') {
  if (!kind.value || (side === 'reverse' && labelText.value.trim())) return undefined
  const text = t(`relations.form.examples.${store.kind}.${kind.value}.${side}`)
  return text ? t('relations.form.example', { text }) : undefined
}

const ready = computed(() => !!(order.value && kind.value && offered.value.some(o => o.kind === kind.value)))

/** A new relationship needs two sides: in a project with fewer, the form says where to make them. */
const tooFew = computed(() => !props.relation && store.worldEntities.length < 2)

// ---------------------------------------------------------------- drafts

const drafts = useRelationDrafts()
const restored = ref(false)

function snapshot(): RelationDraft {
  return {
    sideA: sideA.value,
    sideB: sideB.value,
    labels: { ...labels },
    same: same.value,
    kind: kind.value,
    directed: directed.value,
    directionChosen: directionChosen.value,
    description: description.value,
  }
}

/** A draft as a string, to compare it with the untouched form (empty labels and key order do not count). */
function fingerprint(draft: RelationDraft) {
  const words = Object.entries(draft.labels).filter(([, v]) => v.trim()).sort(([x], [y]) => x.localeCompare(y))
  return JSON.stringify({ ...draft, labels: words, description: draft.description.trim() })
}

/** A side gone to the trash since the draft was left comes back empty. */
const known = (key: string | null) => (key && store.getRef(parseMentionId(key)) ? key : null)

function apply(draft: RelationDraft) {
  sideA.value = known(draft.sideA)
  sideB.value = known(draft.sideB)
  for (const key of Object.keys(labels)) delete labels[key]
  Object.assign(labels, draft.labels)
  same.value = draft.same
  kind.value = draft.kind
  directed.value = draft.directed
  directionChosen.value = draft.directionChosen
  description.value = draft.description
}

function forget() {
  if (props.draftKey) delete drafts.value[props.draftKey]
}

init()
/** The form as it opened, before any draft: what "Scarta la bozza" goes back to. */
const untouched = snapshot()
const untouchedPrint = fingerprint(untouched)
const kept = props.draftKey ? drafts.value[props.draftKey] : undefined
if (kept) {
  apply(kept)
  restored.value = true
}

// What is typed waits in the drafts until "Salva" or "Annulla"; an untouched form leaves none.
watch(snapshot, (now) => {
  if (!props.draftKey) return
  if (fingerprint(now) === untouchedPrint) forget()
  else drafts.value[props.draftKey] = now
})

function discardDraft() {
  forget()
  apply({ ...untouched, labels: { ...untouched.labels } })
  restored.value = false
  focusFirst()
}

function cancel() {
  forget()
  emit('cancel')
}

// ---------------------------------------------------------------- save and trash

async function save() {
  if (!ready.value || busy.value) return
  const { from, to } = order.value!
  const source = parseMentionId(from)!
  const target = parseMentionId(to)!
  const words = (labels[from] ?? '').trim()
  const data = {
    sourceType: source.type as WorldRefType,
    sourceId: source.id,
    targetType: target.type as WorldRefType,
    targetId: target.id,
    kind: kind.value!,
    label: words,
    reverseLabel: same.value ? words : (labels[to] ?? '').trim(),
    directed: directed.value,
    description: description.value.trim(),
  }
  busy.value = true
  try {
    if (props.relation) {
      const row = await store.update('relations', props.relation.id, data)
      forget()
      if (row) emit('saved', row, false)
    }
    else {
      const row = await store.create('relations', data)
      forget()
      emit('saved', row, true)
    }
  }
  catch {
    // The store has already shown the error; the draft stays.
  }
  finally {
    busy.value = false
  }
}

async function trash() {
  if (!props.relation) return
  const id = props.relation.id
  forget()
  emit('trashed', id)
  await store.remove('relations', id).catch(() => {})
}

// ---------------------------------------------------------------- focus

const root = ref<HTMLElement | null>(null)

/** Focuses the first thing to fill: a missing side, or the first sentence. */
function focusFirst() {
  nextTick(() => {
    const selector = !sideA.value ? '[data-side="a"] button' : !sideB.value ? '[data-side="b"] button' : '[data-autofocus]'
    const el = root.value?.querySelector<HTMLElement>(selector) ?? root.value?.querySelector<HTMLElement>('a[href], button:not([disabled])')
    el?.focus()
  })
}

defineExpose({ focusFirst })
</script>

<template>
  <form ref="root" class="relations-form flex flex-col gap-6" @submit.prevent="save">
    <RelationsWhereToCreate v-if="tooFew" :text="t(store.isGame ? 'relations.form.tooFewGame' : 'relations.form.tooFew')" />

    <!-- The two sides -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <UFormField :label="t('relations.form.from')" data-side="a">
        <RelationsEntitySelect v-model="sideA" :exclude="sideB ? [sideB] : []" />
      </UFormField>
      <UFormField :label="t('relations.form.to')" data-side="b">
        <RelationsEntitySelect v-model="sideB" :exclude="sideA ? [sideA] : []" />
      </UFormField>
    </div>

    <template v-if="order">
      <!-- The relationship as two sentences -->
      <fieldset class="space-y-3">
        <legend class="mb-2 text-sm font-medium text-default">{{ t('relations.form.labels') }}</legend>
        <i18n-t scope="global" keypath="relations.form.sentence" tag="p" class="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-sm text-toned">
          <template #from><span class="voice-author font-semibold text-highlighted">{{ nameOf(order.from) }}</span></template>
          <template #field>
            <UInput
              v-model="labels[order.from]"
              data-autofocus
              :placeholder="example('label')"
              :maxlength="120"
              size="md"
              class="min-w-28 max-w-56 flex-1 basis-28"
              :ui="{ base: 'voice-author text-base sm:text-sm max-lg:min-h-11' }"
              :aria-label="t('relations.form.labelAria', { from: nameOf(order.from), to: nameOf(order.to) })"
            />
          </template>
          <template #owner>
            <i18n-t scope="global" keypath="relations.form.owner" tag="span">
              <template #name><span class="voice-author font-semibold text-highlighted">{{ nameOf(order.to) }}</span></template>
            </i18n-t>
          </template>
        </i18n-t>
        <i18n-t scope="global" keypath="relations.form.sentence" tag="p" class="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-sm text-toned">
          <template #from><span class="voice-author font-semibold text-highlighted">{{ nameOf(order.to) }}</span></template>
          <template #field>
            <UInput
              v-model="reverseText"
              :placeholder="example('reverse')"
              :maxlength="120"
              :disabled="same"
              size="md"
              class="min-w-28 max-w-56 flex-1 basis-28"
              :ui="{ base: 'voice-author text-base sm:text-sm max-lg:min-h-11' }"
              :aria-label="t('relations.form.labelAria', { from: nameOf(order.to), to: nameOf(order.from) })"
            />
          </template>
          <template #owner>
            <i18n-t scope="global" keypath="relations.form.owner" tag="span">
              <template #name><span class="voice-author font-semibold text-highlighted">{{ nameOf(order.from) }}</span></template>
            </i18n-t>
          </template>
        </i18n-t>
        <UCheckbox
          v-if="labelText.trim() || same"
          :model-value="same"
          :label="t('relations.form.same')"
          class="items-center max-lg:min-h-11"
          @update:model-value="setSame"
        />
        <p class="text-xs text-muted">{{ t('relations.form.labelsHelp') }}</p>
      </fieldset>

      <!-- The kind: only those valid for the pair -->
      <fieldset>
        <legend class="mb-2 text-sm font-medium text-default">{{ t('relations.form.kind') }}</legend>
        <div class="flex flex-wrap gap-1.5">
          <label
            v-for="option in offered"
            :key="option.kind"
            class="relations-chip"
            :class="{ 'is-checked': kind === option.kind }"
          >
            <input
              type="radio"
              class="sr-only"
              :name="`${uid}-kind`"
              :value="option.kind"
              :checked="kind === option.kind"
              @change="chooseKind(option.kind)"
            >
            <RelationsKindLine :kind="option.kind" :width="16" />
            <span>{{ label('relationKind', option.kind) }}</span>
          </label>
        </div>
        <p v-if="!kind" class="mt-2 text-xs text-muted">{{ t('relations.form.kindHelp') }}</p>
      </fieldset>

      <!-- Mutual or directed -->
      <fieldset v-if="kind">
        <legend class="mb-2 text-sm font-medium text-default">{{ t('relations.form.direction') }}</legend>
        <div class="flex flex-wrap items-center gap-1.5">
          <label class="relations-chip" :class="{ 'is-checked': !directed }">
            <input type="radio" class="sr-only" :name="`${uid}-dir`" :checked="!directed" @change="chooseDirection(false)">
            <UIcon name="i-lucide-arrow-left-right" class="size-4 shrink-0" aria-hidden="true" />
            <span>{{ t('relations.form.mutual') }}</span>
          </label>
          <label class="relations-chip" :class="{ 'is-checked': directed }">
            <input type="radio" class="sr-only" :name="`${uid}-dir`" :checked="directed" @change="chooseDirection(true)">
            <UIcon name="i-lucide-move-right" class="size-4 shrink-0" aria-hidden="true" />
            <i18n-t scope="global" keypath="relations.form.directed" tag="span">
              <template #from><span class="voice-author">{{ nameOf(order.from) }}</span></template>
              <template #to><span class="voice-author">{{ nameOf(order.to) }}</span></template>
            </i18n-t>
          </label>
          <UButton
            v-if="directed && canSwap"
            icon="i-lucide-arrow-right-left"
            color="neutral"
            variant="ghost"
            size="sm"
            class="max-lg:min-h-11"
            :label="t('relations.form.swap')"
            @click="swapSides"
          />
        </div>
      </fieldset>

      <UFormField :label="t('relations.form.description')">
        <UTextarea
          v-model="description"
          autoresize
          :rows="2"
          :maxrows="10"
          :maxlength="2000"
          :placeholder="t('relations.form.descriptionPlaceholder')"
          class="w-full"
          :ui="{ base: 'voice-author text-base sm:text-[0.9375rem]' }"
        />
      </UFormField>
    </template>
    <p v-else-if="!tooFew" class="text-sm text-muted">{{ t(store.isGame ? 'relations.form.pickBothGame' : 'relations.form.pickBoth') }}</p>

    <!-- Actions: they stay in sight while a long form scrolls (the phone drawer, mostly). -->
    <div class="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-default bg-(--ui-bg-floating) pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <p v-if="restored && !confirming" class="flex flex-wrap items-center gap-x-2 text-sm text-muted">
        <UIcon name="i-lucide-history" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
        {{ t('relations.form.draftRestored') }}
        <UButton color="neutral" variant="link" size="sm" class="px-0 max-lg:min-h-11" :label="t('relations.form.draftDiscard')" @click="discardDraft" />
      </p>
      <div v-if="confirming" class="space-y-3 rounded-md bg-elevated px-3 py-3" role="alert">
        <p class="flex items-start gap-2 text-sm text-default">
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
          {{ t('relations.form.deleteConfirm') }}
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton color="error" variant="solid" class="max-lg:min-h-11" :label="t('relations.form.deleteYes')" @click="trash" />
          <UButton color="neutral" variant="ghost" class="max-lg:min-h-11" :label="t('common.actions.cancel')" @click="confirming = false" />
        </div>
      </div>
      <div v-else class="flex flex-wrap items-center gap-2">
        <UButton type="submit" color="primary" variant="solid" class="max-lg:min-h-11" :loading="busy" :disabled="!ready" :label="t('common.actions.save')" />
        <UButton color="neutral" variant="ghost" class="max-lg:min-h-11" :label="t('common.actions.cancel')" @click="cancel" />
        <UButton
          v-if="relation"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          class="ms-auto max-lg:min-h-11"
          :label="t('relations.form.delete')"
          @click="confirming = true"
        />
      </div>
    </div>
  </form>
</template>

<style>
/* A choice among a few: a chip with a sample or an icon and a name; checked in the accent. */
.relations-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border-radius: 4.5px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  color: var(--ui-text-toned);
  font-size: 0.875rem;
  cursor: pointer;
  user-select: none;
  transition: background-color 150ms var(--ease-out-expo), border-color 150ms var(--ease-out-expo);
}
.relations-chip:hover {
  background: var(--ui-bg-elevated);
}
.relations-chip.is-checked {
  border-color: var(--ui-primary);
  box-shadow: inset 0 0 0 1px var(--ui-primary);
  color: var(--ui-text-highlighted);
  font-weight: 500;
}
.relations-chip:has(:focus-visible) {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}
@media (min-width: 1024px) {
  .relations-chip {
    min-height: 2rem;
    padding: 0 0.625rem;
  }
}
</style>
