<script setup lang="ts">
import type { ConditionClause, ConditionOp, LinkCondition, VariableType } from '#shared/types/domain'
import { CONDITION_OPS_BY_TYPE, clauseProblem } from '#shared/utils/flow'
import { flagOf, typeDefault } from './ChoiceSentence.vue'

/**
 * The condition of a choice (spec 5.5): clauses of variable, operator by type and value, joined by
 * "tutte" or "almeno una". One level only, no nesting. No clauses: the choice is always available.
 * Number operators show their symbol beside the words (≥ è almeno).
 */
const condition = defineModel<LinkCondition>({ required: true })
const props = withDefaults(defineProps<{
  /** Show the errors of values left empty (after a save attempt). */
  showErrors?: boolean
}>(), { showErrors: false })
/** A variable created from this condition's picker (the form removes it again if the choice is cancelled). */
const emit = defineEmits<{ created: [id: string] }>()

const store = useProjectStore()
const { t } = useI18n()
const { label, options } = useEnums()

/** Variables created from this form: their type can be chosen right here. */
const fresh = ref(new Set<string>())

function onCreated(id: string) {
  fresh.value.add(id)
  emit('created', id)
}

function setClauses(clauses: ConditionClause[]) {
  condition.value = { ...condition.value, clauses }
}

function add() {
  setClauses([...condition.value.clauses, { variableId: '', op: 'is_true' }])
}

function remove(index: number) {
  setClauses(condition.value.clauses.filter((_, i) => i !== index))
}

function patch(index: number, change: Partial<ConditionClause>) {
  setClauses(condition.value.clauses.map((c, i) => (i === index ? { ...c, ...change } : c)))
}

/** A new variable resets the operator and the value to fit its type. */
function pickVariable(index: number, variableId: string) {
  const type = store.get('variables', variableId)?.type ?? 'boolean'
  const op = CONDITION_OPS_BY_TYPE[type][0] as ConditionOp
  const clause: ConditionClause = { variableId, op }
  if (type !== 'boolean') clause.value = ''
  setClauses(condition.value.clauses.map((c, i) => (i === index ? clause : c)))
}

/** The symbols of spec 5.5 for numbers: =, ≠, <, ≤, >, ≥. */
const SYMBOLS: Partial<Record<ConditionOp, string>> = { eq: '=', neq: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥' }

const opItems = (type: VariableType) => options('conditionOp', CONDITION_OPS_BY_TYPE[type])
  .map(item => ({ ...item, symbol: type === 'number' ? SYMBOLS[item.value as ConditionOp] : undefined }))
const typeItems = computed(() => options('variableType'))

function opOf(clause: ConditionClause, type: VariableType | undefined): ConditionOp {
  if (type === 'boolean') return flagOf(clause, type) ?? 'is_true'
  return clause.op
}

function setOp(index: number, type: VariableType, op: ConditionOp) {
  if (type === 'boolean') patch(index, { op, value: undefined })
  else patch(index, { op })
}

async function setFreshType(index: number, variableId: string, type: VariableType) {
  await store.update('variables', variableId, { type, defaultValue: typeDefault(type) }).catch(() => {})
  pickVariable(index, variableId)
}

const rows = computed(() => condition.value.clauses.map((clause, index) => {
  const variable = store.get('variables', clause.variableId)
  const problem = clause.variableId ? clauseProblem(clause, variable) : (props.showErrors ? 'empty' : null)
  return { clause, index, variable, problem: problem === 'value' && !props.showErrors && !clause.value ? null : problem }
}))

const problemText = (problem: string | null, type?: VariableType) => {
  switch (problem) {
    case 'empty': return t('flow.rules.errorNoVariable')
    case 'missing': return t('flow.rules.errorTrashedCondition')
    case 'type': return t('flow.rules.errorType', { type: label('variableType', type ?? 'boolean') })
    case 'value': return t('flow.rules.errorNumber')
  }
  return ''
}

const modeItems = computed(() => [
  { value: 'all', label: t('flow.rules.modeAll') },
  { value: 'any', label: t('flow.rules.modeAny') },
])
</script>

<template>
  <div class="space-y-3">
    <URadioGroup
      v-if="condition.clauses.length > 1"
      :model-value="condition.mode"
      :items="modeItems"
      orientation="horizontal"
      :legend="t('flow.rules.modeLegend')"
      :ui="{ legend: 'text-sm text-toned mb-1.5 font-normal', fieldset: 'gap-x-5', item: 'max-lg:items-center', label: 'max-lg:py-3 max-lg:pe-2' }"
      @update:model-value="(mode: unknown) => (condition = { ...condition, mode: mode as 'all' | 'any' })"
    />

    <ul v-if="rows.length" class="space-y-3">
      <li
        v-for="row in rows"
        :key="row.index"
        role="group"
        :aria-label="t('flow.rules.conditionN', { n: row.index + 1 })"
        class="space-y-1.5"
      >
        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 @md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)_auto]">
          <FlowVariableSelect
            :model-value="row.clause.variableId || null"
            :invalid="row.problem === 'missing' || row.problem === 'empty'"
            :aria-label="t('flow.rules.conditionVariableN', { n: row.index + 1 })"
            :class="row.variable ? '' : '@md:col-span-2'"
            @update:model-value="(id: string) => pickVariable(row.index, id)"
            @created="onCreated"
          />
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            class="@md:order-last max-lg:size-11 max-lg:justify-center"
            :aria-label="t('flow.rules.removeCondition', { n: row.index + 1 })"
            @click="remove(row.index)"
          />
          <div v-if="row.variable" class="col-span-2 flex min-w-0 gap-2 @md:col-span-1">
            <USelect
              :model-value="opOf(row.clause, row.variable.type)"
              :items="opItems(row.variable.type)"
              :aria-label="t('flow.rules.operatorN', { n: row.index + 1 })"
              :color="row.problem === 'type' ? 'error' : 'primary'"
              :highlight="row.problem === 'type'"
              class="min-w-0 flex-1 max-lg:h-11"
              @update:model-value="(op: unknown) => setOp(row.index, row.variable!.type, op as ConditionOp)"
            >
              <template v-if="row.variable.type === 'number' && SYMBOLS[opOf(row.clause, row.variable.type)]" #leading>
                <span class="w-3 text-center font-mono text-toned" aria-hidden="true">{{ SYMBOLS[opOf(row.clause, row.variable.type)] }}</span>
              </template>
              <template #item-leading="{ item }">
                <span v-if="item.symbol" class="w-3 text-center font-mono text-toned" aria-hidden="true">{{ item.symbol }}</span>
              </template>
            </USelect>
            <div v-if="row.variable.type !== 'boolean'" class="w-20 shrink-0 max-lg:w-36">
              <FlowValueInput
                :type="row.variable.type"
                :model-value="row.clause.value"
                :aria-label="t('flow.rules.conditionValueN', { n: row.index + 1 })"
                @update:model-value="(value: string) => patch(row.index, { value })"
              />
            </div>
          </div>
        </div>
        <div v-if="row.variable && fresh.has(row.variable.id)" class="flex items-center gap-2 text-sm text-muted">
          <span>{{ t('flow.rules.freshType') }}</span>
          <USelect
            :model-value="row.variable.type"
            :items="typeItems"
            size="sm"
            :aria-label="t('flow.rules.freshTypeLabel', { name: row.variable.name })"
            class="w-36 max-lg:h-11"
            @update:model-value="(type: unknown) => setFreshType(row.index, row.variable!.id, type as VariableType)"
          />
        </div>
        <p v-if="row.problem" class="flex items-start gap-1.5 text-sm text-error">
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
          {{ problemText(row.problem, row.variable?.type) }}
        </p>
      </li>
    </ul>

    <UButton
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      size="sm"
      class="max-lg:min-h-11"
      :label="t(condition.clauses.length ? 'flow.rules.addAnotherCondition' : 'flow.rules.addCondition')"
      @click="add"
    />
  </div>
</template>
