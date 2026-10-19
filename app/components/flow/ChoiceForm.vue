<script lang="ts">
import type { InjectionKey } from 'vue'

export interface ChoiceFormRequest {
  linkId?: string | null
  fromSceneId?: string | null
  toSceneId?: string | null
}

/** Provided by the flow page, which owns one form for every view; elsewhere each panel opens its own. */
export const CHOICE_FORM: InjectionKey<(request: ChoiceFormRequest) => void> = Symbol('flow:choice-form')
</script>

<script setup lang="ts">
import { createReusableTemplate, useMediaQuery } from '@vueuse/core'
import type { LinkCondition, LinkEffect } from '#shared/types/domain'
import type { SceneLink } from '#shared/types/entities'
import { booleanOp, clauseProblem, effectProblem } from '#shared/utils/flow'
import { useChoiceText } from './ChoiceSentence.vue'
import { NEW_SCENE } from './ScenePicker.vue'

/**
 * The choice form (spec 5.5): where it leads ("Porta a", with "Nuova scena..."), what the player
 * reads, the condition and the effects (with the variables module), and the whole choice as a
 * sentence at the bottom. A slideover on desktop, a drawer on the phone.
 * Edits an existing choice (`linkId`) or creates one from `fromSceneId` and/or to `toSceneId`.
 * Nothing typed is lost: a form closed without saving (Esc, a tap outside, Back) keeps its draft in
 * the tab and offers it back; Annulla discards it, with the variables created inside it.
 */
const open = defineModel<boolean>('open', { default: false })
const props = withDefaults(defineProps<{
  linkId?: string | null
  fromSceneId?: string | null
  toSceneId?: string | null
  /** Inside another drawer on the phone. */
  nested?: boolean
}>(), { linkId: null, fromSceneId: null, toSceneId: null, nested: false })

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const text = useChoiceText()
const toast = useToast()
const desktop = useMediaQuery('(min-width: 1024px)')
const reopen = inject(CHOICE_FORM, null)
const [DefineBody, ReuseBody] = createReusableTemplate()
const [DefineFooter, ReuseFooter] = createReusableTemplate()

const link = computed(() => (props.linkId ? store.get('links', props.linkId) : undefined))
const editing = computed(() => !!props.linkId)

interface Draft {
  fromSceneId: string | null
  toSceneId: string | null
  newTitle: string | null
  label: string
  conditions: LinkCondition
  effects: LinkEffect[]
  alsoNext: boolean
  alsoNextLabel: string
}

const empty = (): Draft => ({ fromSceneId: null, toSceneId: null, newTitle: null, label: '', conditions: { mode: 'all', clauses: [] }, effects: [], alsoNext: false, alsoNextLabel: '' })
const draft = reactive<Draft>(empty())
const showErrors = ref(false)
const saving = ref(false)
const textField = ref<{ textareaRef?: HTMLTextAreaElement } | null>(null)
const targetField = ref<HTMLElement | null>(null)

/**
 * What a save interrupted by an error already did, so trying again goes on from there: where the
 * source continued before (creating the first choice, or a new scene right after the source,
 * changes it) and the choice already created.
 */
const saved = reactive<{ started: boolean, next: string | null, linkId: string | null }>({ started: false, next: null, linkId: null })
/** Variables created from the pickers of this form, removed again by Annulla when no choice uses them. */
let createdVariables = new Set<string>()
const remember = (id: string) => createdVariables.add(id)

// ---------------------------------------------------------------- the draft kept in the tab

/**
 * What opened the form, kept while it is open (the page may clear its query before the form hears
 * it closed). The same choice, or a new one from the same place, finds its unsaved draft again.
 */
let request: ChoiceFormRequest = {}
const keptKey = () => `dramatis:choice-draft:${store.projectId}:${request.linkId ?? `new:${request.fromSceneId ?? ''}:${request.toSceneId ?? ''}`}`
const snapshot = () => JSON.stringify(draft)
/** The draft as the form opened, and the choice it edits as it was then (a newer choice drops an older draft). */
let opened = ''
let base = ''
const resumed = ref(false)

const linkBase = (current: SceneLink) => JSON.stringify([current.toSceneId, current.label, current.conditions, current.effects])

function readKept(): { draft: Draft, base: string } | null {
  try {
    const raw = sessionStorage.getItem(keptKey())
    return raw ? JSON.parse(raw) : null
  }
  catch {
    return null
  }
}
function writeKept() {
  try {
    sessionStorage.setItem(keptKey(), JSON.stringify({ draft: toRaw(draft), base }))
  }
  catch {}
}
function dropKept() {
  try {
    sessionStorage.removeItem(keptKey())
  }
  catch {}
}

const dirty = () => open.value && snapshot() !== opened

function reset(options: { resume?: boolean } = {}) {
  request = { linkId: props.linkId, fromSceneId: props.fromSceneId, toSceneId: props.toSceneId }
  const current = link.value
  Object.assign(draft, empty(), current
    ? {
        fromSceneId: current.fromSceneId,
        toSceneId: current.toSceneId,
        label: current.label,
        conditions: structuredClone(toRaw(current.conditions)),
        effects: structuredClone(toRaw(current.effects)),
      }
    : { fromSceneId: props.fromSceneId, toSceneId: props.toSceneId })
  opened = snapshot()
  base = current ? linkBase(current) : ''
  const kept = options.resume === false ? null : readKept()
  resumed.value = !!kept && kept.base === base
  if (resumed.value) Object.assign(draft, kept!.draft)
  else dropKept()
  Object.assign(saved, { started: false, next: null, linkId: null })
  createdVariables = new Set()
  showErrors.value = false
}

function startOver() {
  dropKept()
  reset({ resume: false })
}

watch(draft, () => {
  if (dirty()) writeKept()
  else if (open.value) dropKept()
}, { deep: true })

/** How the form is closing: by Salva or Annulla nothing is kept; any other way keeps the draft. */
let closing: 'save' | 'cancel' | null = null

watch(open, (value, before) => {
  if (value) return reset()
  if (!before) return
  // After a save that got halfway (the scene or the first choice exists), resuming would repeat it.
  if (saved.started) dropKept()
  else if (!closing && snapshot() !== opened) offerResume()
  closing = null
}, { immediate: true })
watch(() => props.linkId, () => { if (open.value) reset() })

function offerResume() {
  const again = { ...request }
  toast.add({
    title: t('flow.form.notSaved'),
    description: t('flow.form.notSavedHelp'),
    icon: 'i-lucide-file-clock',
    actions: [{ label: t('flow.form.resume'), onClick: () => { if (reopen) reopen(again); else open.value = true } }],
  })
}

// ---------------------------------------------------------------- the choice

const source = computed(() => store.get('scenes', draft.fromSceneId))
const sourceFixed = computed(() => editing.value || !!props.fromSceneId)

/** The scene this one used to continue to, when this is its first explicit choice (spec 5.5 step 3). */
const continuation = computed(() => {
  if (saved.started) return store.get('scenes', saved.next) ?? null
  const scene = source.value
  if (editing.value || !scene || scene.ending) return null
  if (store.rows.links.some(l => l.fromSceneId === scene.id)) return null
  const scenes = store.orderedScenes
  return scenes[scenes.findIndex(s => s.id === scene.id) + 1] ?? null
})

/** The choice leads to a scene in the trash: flagged until another is chosen or the scene comes back. */
const targetTrashed = computed(() => !!draft.toSceneId && draft.toSceneId !== NEW_SCENE && !store.get('scenes', draft.toSceneId))

const variablesOn = computed(() => store.modules.variables)
/** Conditions or effects kept while the variables module is off: never shown, never lost. */
const hiddenRules = computed(() => !variablesOn.value && !!link.value && (link.value.conditions.clauses.length > 0 || link.value.effects.length > 0))

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** Rules are only sent when they changed, so untouched ones never block saving the rest. */
const conditionsChanged = computed(() => !link.value || !same(draft.conditions, link.value.conditions))
const effectsChanged = computed(() => !link.value || !same(draft.effects, link.value.effects))

const errors = computed(() => {
  const list: string[] = []
  if (!draft.fromSceneId) list.push(t('flow.form.errorFrom'))
  if (!draft.toSceneId) list.push(t('flow.form.errorTo'))
  if (draft.toSceneId === NEW_SCENE && !source.value) list.push(t('flow.form.errorNewWithoutSource'))
  if (variablesOn.value) {
    const vars = (id: string) => store.get('variables', id)
    if (conditionsChanged.value && draft.conditions.clauses.some(c => !c.variableId || clauseProblem(c, vars(c.variableId)))) list.push(t('flow.form.errorConditions'))
    if (effectsChanged.value && draft.effects.some(e => !e.variableId || effectProblem(e, vars(e.variableId)))) list.push(t('flow.form.errorEffects'))
  }
  return list
})

const targetError = computed(() => {
  if (showErrors.value && !draft.toSceneId) return t('flow.form.errorTo')
  if (targetTrashed.value) return t('flow.form.targetTrashed')
  return undefined
})

const targetTitle = computed(() => (draft.toSceneId === NEW_SCENE ? draft.newTitle ?? '' : undefined))
const preview = computed(() => ({
  label: draft.label,
  toSceneId: draft.toSceneId ?? '',
  conditions: variablesOn.value ? draft.conditions : { mode: 'all' as const, clauses: [] },
  effects: variablesOn.value ? draft.effects : [],
}))

/** Clauses and effects as stored: booleans without a value, numbers trimmed. */
function cleanConditions(condition: LinkCondition): LinkCondition {
  return {
    mode: condition.mode,
    clauses: condition.clauses.map((c) => {
      const variable = store.get('variables', c.variableId)
      if (variable?.type === 'boolean') {
        const op = booleanOp(c)
        return op && (c.op === 'is_true' || c.op === 'is_false') ? { variableId: c.variableId, op } : { ...c }
      }
      return { variableId: c.variableId, op: c.op, value: (c.value ?? '').trim() }
    }),
  }
}

function cleanEffects(effects: LinkEffect[]): LinkEffect[] {
  return effects.map((e) => {
    if (e.op === 'toggle') return { variableId: e.variableId, op: e.op }
    return { variableId: e.variableId, op: e.op, value: (e.value ?? '').trim() }
  })
}

/** Creates the scene typed in "Porta a", right after the source in its chapter. */
async function createTargetScene(title: string) {
  const from = source.value!
  const scene = await store.create('scenes', { chapterId: from.chapterId, title, status: 'planned' })
  const order = store.chapterScenes(from.chapterId).map(s => s.id).filter(id => id !== scene.id)
  order.splice(order.indexOf(from.id) + 1, 0, scene.id)
  await store.reorder('scenes', order, { chapterId: from.chapterId }).catch(() => {})
  toast.add({
    title: t('flow.form.sceneCreated', { title }),
    description: t('flow.form.sceneCreatedWhere', { chapter: store.get('chapters', from.chapterId)?.title || t('common.untitled.chapter') }),
    icon: 'i-lucide-file-plus-2',
    actions: [{ label: t('flow.form.openScene'), onClick: () => { navigateTo(store.refPath({ type: 'scene', id: scene.id })) } }],
  })
  return scene.id
}

const formEl = ref<HTMLFormElement | null>(null)

async function save() {
  showErrors.value = true
  if (errors.value.length) {
    nextTick(() => formEl.value?.querySelector('.text-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    return
  }
  if (saving.value) return
  saving.value = true
  // Read before anything is created: the first choice, or a new scene put right after the source,
  // changes where the source continues.
  const next = continuation.value?.id ?? null
  try {
    let toSceneId = draft.toSceneId!
    if (toSceneId === NEW_SCENE) {
      toSceneId = await createTargetScene(draft.newTitle!)
      Object.assign(saved, { started: true, next })
      // A retry after a failure below uses the scene already created.
      Object.assign(draft, { toSceneId, newTitle: null })
    }
    const conditions = cleanConditions(draft.conditions)
    const effects = cleanEffects(draft.effects)
    if (editing.value && link.value) {
      const before = link.value
      const patch: Partial<SceneLink> = {}
      if (toSceneId !== before.toSceneId) patch.toSceneId = toSceneId
      if (draft.label.trim() !== before.label) patch.label = draft.label.trim()
      if (variablesOn.value && conditionsChanged.value && !same(conditions, before.conditions)) patch.conditions = conditions
      if (variablesOn.value && effectsChanged.value && !same(effects, before.effects)) patch.effects = effects
      if (Object.keys(patch).length) await store.update('links', before.id, patch)
    }
    else {
      const fields = { toSceneId, label: draft.label.trim(), ...(variablesOn.value ? { conditions, effects } : {}) }
      // A retry after the second choice failed saves what changed in the first one meanwhile.
      if (saved.linkId) await store.update('links', saved.linkId, fields)
      else {
        const row = await store.create('links', { fromSceneId: draft.fromSceneId!, ...fields })
        Object.assign(saved, { started: true, next, linkId: row.id })
      }
      if (draft.alsoNext && next && next !== toSceneId) {
        await store.create('links', { fromSceneId: draft.fromSceneId!, toSceneId: next, label: draft.alsoNextLabel.trim() })
      }
    }
    dropKept()
    closing = 'save'
    open.value = false
  }
  catch {
    // The store has already shown the error; the form stays open with what was typed.
  }
  finally {
    saving.value = false
  }
}

const usesVariable = (l: SceneLink, id: string) => l.conditions.clauses.some(c => c.variableId === id) || l.effects.some(e => e.variableId === id)

/** Annulla: the draft goes, and so do the variables created for it that no choice uses. */
async function cancel() {
  dropKept()
  closing = 'cancel'
  open.value = false
  const unused = [...createdVariables].filter(id => store.get('variables', id) && !store.rows.links.some(l => usesVariable(l, id)))
  if (!unused.length) return
  const names = unused.map(id => store.get('variables', id)!.name)
  const done = await Promise.all(unused.map(id => store.remove('variables', id, { undo: false }).then(() => true, () => false)))
  const removed = unused.filter((_, i) => done[i])
  if (!removed.length) return
  toast.add({
    title: t('flow.form.variablesRemoved', { names: names.filter((_, i) => done[i]).join(', '), n: removed.length }, removed.length),
    icon: 'i-lucide-trash-2',
    actions: [{ label: t('common.actions.undo'), onClick: () => { for (const id of removed) store.restore('variables', id).catch(() => {}) } }],
  })
}

async function trash() {
  if (!link.value) return
  const id = link.value.id
  dropKept()
  closing = 'save'
  open.value = false
  await store.remove('links', id).catch(() => {})
}

const title = computed(() => (editing.value ? t('flow.form.editTitle') : t('flow.form.newTitle')))
const description = computed(() => (source.value ? t('flow.form.from', { scene: text.sceneTitle(source.value.id) }) : t('flow.form.fromUnknown')))
const remaining = computed(() => 300 - draft.label.length)

/** Desktop: the first useful field takes the focus (the target, or the text when the target is set). */
function onOpenAutoFocus(event: Event) {
  if (!desktop.value) return
  event.preventDefault()
  nextTick(() => {
    if (draft.toSceneId) textField.value?.textareaRef?.focus()
    else targetField.value?.querySelector<HTMLElement>('button, [role="combobox"]')?.focus()
  })
}

function onSubmitKey(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    save()
  }
}
</script>

<template>
  <DefineBody>
    <form ref="formEl" class="@container space-y-6" novalidate @submit.prevent="save" @keydown="onSubmitKey">
      <p v-if="resumed" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-toned">
        <UIcon name="i-lucide-file-clock" class="size-4 shrink-0 text-dimmed" />
        <span>{{ t('flow.form.resumed') }}</span>
        <UButton color="neutral" variant="link" size="sm" class="px-0 max-lg:min-h-11" :label="t('flow.form.startOver')" @click="startOver" />
      </p>

      <UFormField v-if="!sourceFixed" :label="t('flow.form.fromLabel')" :error="showErrors && !draft.fromSceneId ? t('flow.form.errorFrom') : undefined">
        <FlowScenePicker v-model="draft.fromSceneId" :placeholder="t('flow.form.fromPlaceholder')" :invalid="showErrors && !draft.fromSceneId" />
      </UFormField>

      <div ref="targetField">
        <UFormField :label="t('flow.form.toLabel')" :error="targetError">
          <FlowScenePicker
            v-model="draft.toSceneId"
            v-model:new-title="draft.newTitle"
            creatable
            :placeholder="t('flow.form.toPlaceholder')"
            :invalid="!!targetError"
          />
          <template v-if="draft.toSceneId === NEW_SCENE && source" #help>
            {{ t('flow.form.newSceneHelp', { chapter: store.get('chapters', source.chapterId)?.title || t('common.untitled.chapter'), scene: text.sceneTitle(source.id) }) }}
          </template>
        </UFormField>
      </div>

      <UFormField :label="t('flow.form.textLabel')" :help="t('flow.form.textHelp', { audience: term('audience') })">
        <UTextarea
          ref="textField"
          v-model="draft.label"
          :maxlength="300"
          :rows="2"
          autoresize
          :placeholder="t('flow.form.textPlaceholder')"
          class="w-full"
          :ui="{ base: 'voice-author text-base' }"
        />
        <template v-if="remaining < 60" #hint>
          <span class="tabular">{{ t('flow.form.remaining', { n: remaining }, remaining) }}</span>
        </template>
      </UFormField>

      <div v-if="continuation" class="space-y-3 border-y border-default py-3 text-sm text-toned">
        <p class="flex items-start gap-2">
          <UIcon name="i-lucide-corner-down-right" class="mt-0.5 size-4 shrink-0 text-dimmed" />
          <i18n-t keypath="flow.form.continuationWas" tag="span" scope="global">
            <template #scene><span class="voice-author text-default">{{ text.sceneTitle(continuation.id) }}</span></template>
          </i18n-t>
        </p>
        <p v-if="draft.toSceneId === continuation.id" class="ps-6 text-muted">{{ t('flow.form.continuationReplaced') }}</p>
        <template v-else>
          <UCheckbox
            v-model="draft.alsoNext"
            class="ps-6"
            :label="t('flow.form.alsoNext', { scene: text.sceneTitle(continuation.id) })"
            :description="t('flow.form.alsoNextHelp')"
            :ui="{ container: 'max-lg:h-11', label: 'max-lg:flex max-lg:min-h-11 max-lg:items-center' }"
          />
          <UFormField v-if="draft.alsoNext" class="ps-12" :label="t('flow.form.alsoNextText')">
            <UInput v-model="draft.alsoNextLabel" :maxlength="300" :placeholder="t('flow.form.textPlaceholder')" class="w-full" :ui="{ base: 'voice-author max-lg:h-11' }" />
          </UFormField>
        </template>
      </div>

      <template v-if="variablesOn">
        <fieldset class="space-y-2">
          <legend class="mb-2 text-sm font-medium text-highlighted">{{ t('flow.form.conditionLabel') }}</legend>
          <p v-if="!draft.conditions.clauses.length" class="text-sm text-muted">{{ t('flow.form.conditionHelp') }}</p>
          <FlowConditionEditor v-model="draft.conditions" :show-errors="showErrors" @created="remember" />
        </fieldset>

        <fieldset class="space-y-2">
          <legend class="mb-2 text-sm font-medium text-highlighted">{{ t('flow.form.effectsLabel') }}</legend>
          <p v-if="!draft.effects.length" class="text-sm text-muted">{{ t('flow.form.effectsHelp') }}</p>
          <FlowEffectsEditor v-model="draft.effects" :show-errors="showErrors" @created="remember" />
        </fieldset>
      </template>
      <p v-else-if="hiddenRules" class="flex items-start gap-2 text-sm text-muted">
        <UIcon name="i-lucide-eye-off" class="mt-0.5 size-4 shrink-0" />
        {{ t('flow.form.hiddenRules') }}
      </p>

      <section v-if="draft.toSceneId" class="border-t border-default pt-4" :aria-label="t('flow.form.previewLabel')">
        <p class="mb-1 text-xs font-medium text-muted">{{ t('flow.form.previewLabel') }}</p>
        <p class="text-[0.9375rem] leading-relaxed">
          <FlowChoiceSentence :link="preview" :target-title="targetTitle" draft />
        </p>
      </section>

      <div v-if="showErrors && errors.length" class="flex items-start gap-2 text-sm text-error" role="alert">
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
        <span>{{ errors[0] }}</span>
      </div>
      <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
    </form>
  </DefineBody>

  <DefineFooter>
    <div class="flex w-full flex-wrap items-center gap-2">
      <UButton
        v-if="editing"
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        :label="t('flow.form.trash')"
        class="me-auto max-lg:min-h-11"
        @click="trash"
      />
      <span v-else class="me-auto" />
      <UButton color="neutral" variant="ghost" :label="t('common.actions.cancel')" class="max-lg:min-h-11" @click="cancel" />
      <UButton color="primary" variant="solid" :label="t('common.actions.save')" :loading="saving" class="max-lg:min-h-11" @click="save" />
    </div>
  </DefineFooter>

  <USlideover
    v-if="desktop"
    v-model:open="open"
    :title="title"
    :description="description"
    :content="{ onOpenAutoFocus }"
    :ui="{ content: 'sm:max-w-lg', body: 'pb-8', footer: 'justify-end' }"
  >
    <template #body><ReuseBody /></template>
    <template #footer><ReuseFooter /></template>
  </USlideover>
  <UDrawer
    v-else
    v-model:open="open"
    :nested="nested"
    :title="title"
    :description="description"
    :ui="{ content: 'max-h-[92dvh]', body: 'pb-4', footer: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }"
  >
    <template #body><ReuseBody /></template>
    <template #footer><ReuseFooter /></template>
  </UDrawer>
</template>
