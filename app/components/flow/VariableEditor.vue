<script setup lang="ts">
import type { VariableType } from '#shared/types/domain'
import { VARIABLE_NAME_RE, isInteger, typeDefault, useChoiceText } from './ChoiceSentence.vue'
import { CHOICE_FORM } from './ChoiceForm.vue'

/**
 * One state variable (spec 4.5 Variables, 7.20): name under the name rule, type, starting value,
 * description, and where it is used (the choices that read or change it). Renaming changes nothing
 * else: conditions and effects point to the variable by id.
 */
const props = defineProps<{ variableId: string }>()

const store = useProjectStore()
const { t } = useI18n()
const { label, options } = useEnums()
const toast = useToast()
const { usage } = useFlow()
const text = useChoiceText()
const openChoice = inject(CHOICE_FORM, () => {})

const variable = computed(() => store.get('variables', props.variableId))

// ---------------------------------------------------------------- name

const name = ref(variable.value?.name ?? '')
watch(() => variable.value?.name, (value) => { if (value !== undefined && document.activeElement?.id !== nameId) name.value = value })

const nameProblem = computed(() => {
  const value = name.value.trim()
  if (!value) return t('flow.variables.errorEmpty')
  if (!VARIABLE_NAME_RE.test(value)) return t('flow.variables.errorRule')
  if (store.rows.variables.some(v => v.id !== props.variableId && v.name === value)) return t('flow.variables.errorTaken', { name: value })
  return ''
})

function commitName() {
  const value = name.value.trim()
  if (!variable.value || value === variable.value.name) return
  if (nameProblem.value) return
  store.update('variables', props.variableId, { name: value }).catch(() => { name.value = variable.value?.name ?? '' })
}

function revertName() {
  name.value = variable.value?.name ?? ''
}

// ---------------------------------------------------------------- type, value, description

const typeItems = computed(() => options('variableType'))

/** The starting value carried over to a new type when it still means something there (3 as a number or a text). */
function carriedDefault(from: VariableType, to: VariableType, value: string) {
  if (from === 'boolean' || to === 'boolean') return typeDefault(to)
  if (to === 'number') return isInteger(value) ? value.trim() : typeDefault(to)
  return value
}

/** A new type keeps what still fits; the rules that no longer fit are flagged, and Annulla puts everything back. */
async function setType(type: VariableType) {
  const current = variable.value
  if (!current || type === current.type) return
  const before = { type: current.type, defaultValue: current.defaultValue }
  const defaultValue = carriedDefault(before.type, type, before.defaultValue)
  const updated = await store.update('variables', props.variableId, { type, defaultValue }).catch(() => null)
  // Worth an Undo when choices use it, or when a starting value the author chose is gone.
  const lost = before.defaultValue !== '' && before.defaultValue !== typeDefault(before.type) && defaultValue !== before.defaultValue
  if (!updated || (!uses.value.length && !lost)) return
  toast.add({
    title: t('flow.variables.typeSet', { name: current.name, type: label('variableType', type) }),
    icon: 'i-lucide-variable',
    actions: [{ label: t('common.actions.undo'), onClick: () => { store.update('variables', props.variableId, before).catch(() => {}) } }],
  })
}

const defaultValue = computed(() => variable.value?.defaultValue ?? '')
const defaultProblem = computed(() => (variable.value?.type === 'number' && defaultValue.value !== '' && !isInteger(defaultValue.value) ? t('flow.rules.errorNumber') : ''))

function setDefault(value: string) {
  if (!variable.value) return
  if (variable.value.type === 'number' && value !== '' && !isInteger(value)) {
    store.patchLocal('variables', props.variableId, { defaultValue: value })
    return
  }
  store.patchSoon('variables', props.variableId, { defaultValue: value.trim() })
}

function setDescription(value: string) {
  store.patchSoon('variables', props.variableId, { description: value.slice(0, 1000) })
}

// ---------------------------------------------------------------- where it is used

const uses = computed(() => store.rows.links
  .map((link) => {
    const reads = link.conditions.clauses.filter(c => c.variableId === props.variableId).length
    const writes = link.effects.filter(e => e.variableId === props.variableId).length
    return { link, reads, writes }
  })
  .filter(u => u.reads || u.writes))

const reads = computed(() => usage.value.read.get(props.variableId) ?? 0)
const writes = computed(() => usage.value.written.get(props.variableId) ?? 0)
const usageLine = computed(() => [
  reads.value ? t('flow.variables.conditionsCount', { n: reads.value }, reads.value) : '',
  writes.value ? t('flow.variables.effectsCount', { n: writes.value }, writes.value) : '',
].filter(Boolean).join(' · '))

const nameId = useId()
/** The type when the editor opened: the warning below shows while the type differs from it. */
const openedType = variable.value?.type
const typeChanged = computed(() => !!variable.value && variable.value.type !== openedType)
</script>

<template>
  <div v-if="variable" class="@container space-y-5">
    <div class="grid gap-4 @lg:grid-cols-[minmax(0,1fr)_10rem_9rem]">
      <UFormField :label="t('flow.variables.name')" :error="nameProblem || undefined" :help="nameProblem ? undefined : t('flow.variables.nameHelp')">
        <UInput
          :id="nameId"
          v-model="name"
          :maxlength="40"
          autocomplete="off"
          spellcheck="false"
          class="w-full"
          :ui="{ base: 'font-mono max-lg:h-11' }"
          @blur="commitName"
          @keydown.enter.prevent="commitName"
          @keydown.escape="revertName"
        />
      </UFormField>
      <UFormField :label="t('flow.variables.type')">
        <USelect :model-value="variable.type" :items="typeItems" class="w-full max-lg:h-11" @update:model-value="(v: unknown) => setType(v as VariableType)" />
      </UFormField>
      <UFormField :label="t('flow.variables.default')" :error="defaultProblem || undefined">
        <FlowValueInput :type="variable.type" :model-value="defaultValue" @update:model-value="setDefault" />
      </UFormField>
    </div>

    <p v-if="typeChanged && uses.length" class="flex items-start gap-2 text-sm text-warning" role="status">
      <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
      {{ t('flow.variables.typeChanged', { n: uses.length }, uses.length) }}
    </p>

    <UFormField :label="t('flow.variables.description')" :help="t('flow.variables.descriptionHelp')">
      <UTextarea
        :model-value="variable.description"
        :maxlength="1000"
        :rows="2"
        autoresize
        class="w-full"
        :ui="{ base: 'voice-author' }"
        @update:model-value="(v: string | number) => setDescription(String(v))"
      />
    </UFormField>

    <section class="space-y-2" :aria-label="t('flow.variables.usedIn')">
      <h3 class="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-highlighted">
        {{ t('flow.variables.usedIn') }}
        <span v-if="reads || writes" class="tabular text-sm font-normal text-muted">{{ usageLine }}</span>
      </h3>
      <ul v-if="uses.length" class="space-y-0.5">
        <li v-for="use in uses" :key="use.link.id">
          <button
            type="button"
            class="flex w-full min-w-0 flex-col justify-center gap-0.5 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 text-start outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-(--ui-primary) max-lg:min-h-11"
            @click="openChoice({ linkId: use.link.id })"
          >
            <span class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
              <span class="voice-author text-toned">{{ text.sceneTitle(use.link.fromSceneId) }}</span>
              <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0 self-center text-dimmed" />
              <span v-if="use.link.label.trim()" class="voice-author italic text-highlighted">{{ use.link.label.trim() }}</span>
              <span v-else class="text-muted">{{ t('flow.text.continue') }}</span>
              <span class="text-xs text-muted">
                {{ [use.reads ? t('flow.variables.reads') : '', use.writes ? t('flow.variables.writes') : ''].filter(Boolean).join(' · ') }}
              </span>
            </span>
            <span class="text-sm"><FlowChoiceSentence :link="use.link" variant="rules" /></span>
          </button>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('flow.variables.unused') }}</p>
    </section>
  </div>
</template>
