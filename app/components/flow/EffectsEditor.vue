<script setup lang="ts">
import type { EffectOp, LinkEffect, VariableType } from '#shared/types/domain'
import { EFFECT_OPS_BY_TYPE, effectProblem } from '#shared/utils/flow'
import { typeDefault } from './ChoiceSentence.vue'

/**
 * What choosing a choice does to the state, in order (spec 5.5): rows of variable, operation by type
 * (boolean: diventa vero, diventa falso, si inverte; number: diventa, aumenta di, diminuisce di;
 * text: diventa) and value. Reordered with the row menu or Alt+Up/Down.
 */
const effects = defineModel<LinkEffect[]>({ required: true })
const props = withDefaults(defineProps<{ showErrors?: boolean }>(), { showErrors: false })
/** A variable created from an effect's picker (the form removes it again if the choice is cancelled). */
const emit = defineEmits<{ created: [id: string] }>()

const store = useProjectStore()
const { t } = useI18n()
const { label, options } = useEnums()

const fresh = ref(new Set<string>())
const list = ref<HTMLElement | null>(null)

function onCreated(id: string) {
  fresh.value.add(id)
  emit('created', id)
}

function add() {
  effects.value = [...effects.value, { variableId: '', op: 'set', value: 'true' }]
}

function remove(index: number) {
  effects.value = effects.value.filter((_, i) => i !== index)
}

function patch(index: number, change: Partial<LinkEffect>) {
  effects.value = effects.value.map((e, i) => (i === index ? { ...e, ...change } : e))
}

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= effects.value.length) return
  const next = [...effects.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  effects.value = next
  nextTick(() => list.value?.querySelectorAll<HTMLElement>('[data-effect-row]')[target]?.focus())
}

function pickVariable(index: number, variableId: string) {
  const type = store.get('variables', variableId)?.type ?? 'boolean'
  const effect: LinkEffect = type === 'boolean' ? { variableId, op: 'set', value: 'true' } : { variableId, op: type === 'number' ? 'add' : 'set', value: type === 'number' ? '1' : '' }
  effects.value = effects.value.map((e, i) => (i === index ? effect : e))
}

async function setFreshType(index: number, variableId: string, type: VariableType) {
  await store.update('variables', variableId, { type, defaultValue: typeDefault(type) }).catch(() => {})
  pickVariable(index, variableId)
}

/** Boolean effects read as one choice of three: diventa vero, diventa falso, si inverte. */
function opItems(type: VariableType) {
  if (type === 'boolean') {
    return [
      { value: 'set:true', label: t('flow.rules.becomesTrue') },
      { value: 'set:false', label: t('flow.rules.becomesFalse') },
      { value: 'toggle', label: label('effectOp', 'toggle') },
    ]
  }
  return options('effectOp', EFFECT_OPS_BY_TYPE[type])
}

function opValue(effect: LinkEffect, type: VariableType) {
  if (type !== 'boolean') return effect.op
  return effect.op === 'toggle' ? 'toggle' : `set:${effect.value === 'false' ? 'false' : 'true'}`
}

function setOp(index: number, type: VariableType, value: string) {
  if (type !== 'boolean') return patch(index, { op: value as EffectOp })
  if (value === 'toggle') patch(index, { op: 'toggle', value: undefined })
  else patch(index, { op: 'set', value: value.slice(4) })
}

const typeItems = computed(() => options('variableType'))

const rows = computed(() => effects.value.map((effect, index) => {
  const variable = store.get('variables', effect.variableId)
  const problem = effect.variableId ? effectProblem(effect, variable) : (props.showErrors ? 'empty' : null)
  return { effect, index, variable, problem: problem === 'value' && !props.showErrors && !effect.value ? null : problem }
}))

const problemText = (problem: string | null, type?: VariableType) => {
  switch (problem) {
    case 'empty': return t('flow.rules.errorNoVariable')
    case 'missing': return t('flow.rules.errorTrashedEffect')
    case 'type': return t('flow.rules.errorType', { type: label('variableType', type ?? 'boolean') })
    case 'value': return t('flow.rules.errorNumber')
  }
  return ''
}

const menu = (index: number) => [
  [
    { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', kbds: ['alt', 'arrowup'], disabled: index === 0, onSelect: () => move(index, -1) },
    { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', kbds: ['alt', 'arrowdown'], disabled: index === effects.value.length - 1, onSelect: () => move(index, 1) },
  ],
  [{ label: t('flow.rules.removeEffect', { n: index + 1 }), icon: 'i-lucide-x', onSelect: () => remove(index) }],
]

function onKeydown(event: KeyboardEvent, index: number) {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  event.preventDefault()
  event.stopPropagation()
  move(index, event.key === 'ArrowUp' ? -1 : 1)
}
</script>

<template>
  <div class="space-y-3">
    <ol v-if="rows.length" ref="list" class="space-y-3">
      <li
        v-for="row in rows"
        :key="row.index"
        data-effect-row
        tabindex="-1"
        role="group"
        :aria-label="t('flow.rules.effectN', { n: row.index + 1 })"
        class="space-y-1.5 rounded-[calc(var(--ui-radius)*2)] outline-none"
        @keydown.capture="onKeydown($event, row.index)"
      >
        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 @md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)_auto]">
          <FlowVariableSelect
            :model-value="row.effect.variableId || null"
            :invalid="row.problem === 'missing' || row.problem === 'empty'"
            :aria-label="t('flow.rules.effectVariableN', { n: row.index + 1 })"
            :class="row.variable ? '' : '@md:col-span-2'"
            @update:model-value="(id: string) => pickVariable(row.index, id)"
            @created="onCreated"
          />
          <UDropdownMenu :items="menu(row.index)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              class="@md:order-last max-lg:size-11 max-lg:justify-center"
              :aria-label="t('flow.rules.effectMenu', { n: row.index + 1 })"
            />
          </UDropdownMenu>
          <div v-if="row.variable" class="col-span-2 flex min-w-0 gap-2 @md:col-span-1">
            <USelect
              :model-value="opValue(row.effect, row.variable.type)"
              :items="opItems(row.variable.type)"
              :aria-label="t('flow.rules.operationN', { n: row.index + 1 })"
              :color="row.problem === 'type' ? 'error' : 'primary'"
              :highlight="row.problem === 'type'"
              class="min-w-0 flex-1 max-lg:h-11"
              @update:model-value="(op: unknown) => setOp(row.index, row.variable!.type, String(op))"
            />
            <div v-if="row.variable.type !== 'boolean'" class="w-20 shrink-0 max-lg:w-36">
              <FlowValueInput
                :type="row.variable.type"
                :model-value="row.effect.value"
                :aria-label="t('flow.rules.effectValueN', { n: row.index + 1 })"
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
    </ol>

    <UButton
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      size="sm"
      class="max-lg:min-h-11"
      :label="t(effects.length ? 'flow.rules.addAnotherEffect' : 'flow.rules.addEffect')"
      @click="add"
    />
  </div>
</template>
