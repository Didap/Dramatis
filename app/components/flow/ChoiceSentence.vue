<script lang="ts">
import type { ConditionClause, ConditionOp, LinkCondition, LinkEffect, VariableType } from '#shared/types/domain'
import type { SceneLink } from '#shared/types/entities'
import { booleanOp } from '#shared/utils/flow'

/** Operators as they read in the mono chips of the graph ("fiducia >= 2"). */
const SYMBOLS: Partial<Record<ConditionOp, string>> = { eq: '=', neq: '!=', lt: '<', lte: '<=', gt: '>', gte: '>=' }

/** Numbers are integers (spec 7.20): the rule clauseProblem and effectProblem apply in #shared/utils/flow. */
export const isInteger = (value: string | undefined) => /^-?\d{1,15}$/.test((value ?? '').trim())

/** The value a new variable of a type starts with. */
export const typeDefault = (type: VariableType) => (type === 'boolean' ? 'false' : type === 'number' ? '0' : '')

/** The name rule (spec 7.20): lowercase letters, digits and underscores, starting with a letter, up to 40 characters. */
export const VARIABLE_NAME_RE = /^[a-z][a-z0-9_]{0,39}$/

/** A typed name made valid: "Fiducia di Oren" becomes fiducia_di_oren. */
export function toVariableName(raw: string) {
  let name = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (name && !/^[a-z]/.test(name)) name = `v_${name}`
  return name.slice(0, 40).replace(/_+$/, '')
}

export const hasCondition = (link: Pick<SceneLink, 'conditions'>) => (link.conditions?.clauses?.length ?? 0) > 0

/**
 * is_true or is_false: a boolean clause (older data may say `eq true`), or one left over from before
 * its variable changed type, which still takes no value.
 */
export function flagOf(clause: Pick<ConditionClause, 'op' | 'value'>, type: VariableType | undefined): 'is_true' | 'is_false' | null {
  if (type === 'boolean') return booleanOp(clause)
  return clause.op === 'is_true' || clause.op === 'is_false' ? clause.op : null
}

type ChoiceLike = Pick<SceneLink, 'label' | 'toSceneId' | 'conditions' | 'effects'>

/**
 * Choices, conditions and effects as plain text: sentences for reading and screen readers
 * ("Se fiducia_oren è almeno 3: «Dille la verità», verso «La porta si apre»."), chips for the graph
 * ("se fiducia_oren >= 3", "fiducia_oren +1"). Rules that no longer fit their variable still read
 * as words, never as stored keys.
 */
export function useChoiceText() {
  const store = useProjectStore()
  const { t, locale } = useI18n()
  const { label } = useEnums()

  const variableOf = (id: string) => store.get('variables', id)
  const nameOf = (id: string) => variableOf(id)?.name ?? t('flow.text.trashedVariable')
  const sceneTitle = (id: string) => {
    const scene = store.get('scenes', id)
    if (!scene) return t('flow.text.trashedScene')
    return scene.title || t('common.untitled.scene')
  }

  const valueText = (type: VariableType | undefined, raw: string | undefined) => {
    // true and false read as words wherever they are not a text: a trashed variable, a rule written
    // before the variable changed type.
    if (type === 'boolean' || (type !== 'string' && (raw === 'true' || raw === 'false'))) return raw === 'true' ? t('flow.values.true') : t('flow.values.false')
    if (type === 'string') return t('flow.values.text', { value: raw ?? '' })
    return raw ?? ''
  }

  const join = (items: string[], mode: 'all' | 'any') =>
    new Intl.ListFormat(locale.value === 'en' ? 'en-GB' : 'it-IT', { type: mode === 'any' ? 'disjunction' : 'conjunction' }).format(items)

  function clauseText(clause: ConditionClause) {
    const variable = variableOf(clause.variableId)
    const name = nameOf(clause.variableId)
    const flag = flagOf(clause, variable?.type)
    if (flag) return t('flow.text.clauseFlag', { name, op: label('conditionOp', flag) })
    return t('flow.text.clause', { name, op: label('conditionOp', clause.op), value: valueText(variable?.type, clause.value) })
  }

  const conditionText = (condition: LinkCondition) => join(condition.clauses.map(clauseText), condition.mode)

  function effectText(effect: LinkEffect) {
    const variable = variableOf(effect.variableId)
    const name = nameOf(effect.variableId)
    if (effect.op === 'toggle') return t('flow.text.effectToggle', { name, op: label('effectOp', 'toggle') })
    return t('flow.text.effect', { name, op: label('effectOp', effect.op), value: valueText(variable?.type, effect.value) })
  }

  const effectsText = (effects: LinkEffect[]) => join(effects.map(effectText), 'all')

  /** The choice as the project shows it: with the variables module off, its rules are kept but hidden. */
  const visible = <T extends ChoiceLike>(link: T): T =>
    (store.modules.variables ? link : { ...link, conditions: { mode: 'all', clauses: [] }, effects: [] })

  /** What the player reads, or "Continua" for a choice without text. */
  const choiceLabel = (link: Pick<SceneLink, 'label'>) => link.label.trim() || t('flow.text.continue')

  /** The whole choice: "Se A: «testo», verso «scena». Poi B." */
  function choiceSentence(choice: ChoiceLike) {
    const link = visible(choice)
    const target = sceneTitle(link.toSceneId)
    const conditioned = hasCondition(link)
    const body = link.label.trim()
      ? t('flow.sentence.choice', { text: link.label.trim(), target })
      : t(conditioned ? 'flow.sentence.continueAfter' : 'flow.sentence.continue', { target })
    let sentence = conditioned ? t('flow.sentence.if', { condition: conditionText(link.conditions), rest: body }) : body
    if (link.effects.length) sentence += ` ${t('flow.sentence.then', { effects: effectsText(link.effects) })}`
    return sentence
  }

  /** Only the rules: "Se A: B.", "Se A.", "Poi B.", or '' when the choice has none. */
  function rulesSentence(link: ChoiceLike) {
    const conditioned = hasCondition(link)
    if (conditioned && link.effects.length) return t('flow.sentence.ifThen', { condition: conditionText(link.conditions), effects: effectsText(link.effects) })
    if (conditioned) return t('flow.sentence.onlyIf', { condition: conditionText(link.conditions) })
    if (link.effects.length) return t('flow.sentence.then', { effects: effectsText(link.effects) })
    return ''
  }

  /** A value in a chip: texts in quotes, true and false as words. */
  function chipValue(type: VariableType | undefined, raw: string | undefined) {
    if (type === 'string') return `"${raw ?? ''}"`
    if (type === 'boolean' || raw === 'true' || raw === 'false') return valueText(type, raw)
    return raw ?? ''
  }

  function clauseChip(clause: ConditionClause) {
    const variable = variableOf(clause.variableId)
    const name = nameOf(clause.variableId)
    const flag = flagOf(clause, variable?.type)
    if (variable?.type === 'boolean' && flag) return flag === 'is_true' ? name : t('flow.chip.not', { name })
    if (flag) return `${name} ${label('conditionOp', flag)}`
    return `${name} ${SYMBOLS[clause.op] ?? label('conditionOp', clause.op)} ${chipValue(variable?.type, clause.value)}`.trim()
  }

  const conditionChip = (condition: LinkCondition) =>
    t('flow.chip.if', { clauses: condition.clauses.map(clauseChip).join(` ${t(condition.mode === 'any' ? 'flow.chip.or' : 'flow.chip.and')} `) })

  function effectChip(effect: LinkEffect) {
    const variable = variableOf(effect.variableId)
    const name = nameOf(effect.variableId)
    if (effect.op === 'toggle') return t('flow.chip.toggle', { name })
    if (effect.op === 'add' || effect.op === 'subtract') {
      // "+ -2" reads as "-2": the sign of the step, then its size.
      const raw = (effect.value ?? '').trim()
      const negative = raw.startsWith('-')
      const size = negative ? raw.slice(1) : raw
      return `${name} ${(effect.op === 'add') !== negative ? '+' : '-'}${size}`
    }
    return `${name} = ${chipValue(variable?.type, effect.value)}`
  }

  return {
    visible,
    variableOf,
    nameOf,
    sceneTitle,
    valueText,
    clauseText,
    conditionText,
    effectText,
    effectsText,
    choiceLabel,
    choiceSentence,
    rulesSentence,
    clauseChip,
    conditionChip,
    effectChip,
  }
}
</script>

<script setup lang="ts">
import { createReusableTemplate } from '@vueuse/core'
import { clauseProblem, effectProblem } from '#shared/utils/flow'

/**
 * A choice read as a sentence, in the two voices: the choice text and the scene title in the author's
 * face, variables in mono, the rest in the house's face. A variable in the trash, or a rule that no
 * longer fits its variable, has its name in the error colour (in the form's live preview, a value
 * still being typed is not marked).
 * full:  "Se fiducia_oren è almeno 3: «Dille la verità», verso «La porta si apre». Poi detto_la_verita diventa vero."
 * rules: "Se fiducia_oren è almeno 3: fiducia_oren aumenta di 1." (the row around it shows text and target)
 */
const props = withDefaults(defineProps<{
  link: ChoiceLike
  variant?: 'full' | 'rules'
  /** The title of a scene that does not exist yet (the form's "Nuova scena..."). */
  targetTitle?: string
  /** The form's preview: values are being typed. */
  draft?: boolean
}>(), { variant: 'full', targetTitle: undefined, draft: false })

const { t } = useI18n()
const { label } = useEnums()
const text = useChoiceText()
const [DefineClauses, ReuseClauses] = createReusableTemplate()
const [DefineEffects, ReuseEffects] = createReusableTemplate()

const clauses = computed(() => props.link.conditions?.clauses ?? [])
const effects = computed(() => props.link.effects ?? [])
const conditioned = computed(() => clauses.value.length > 0)
const spoken = computed(() => props.link.label.trim())

/** ", " between items and " e " (or " o ") before the last one. */
const separator = (index: number, count: number, mode: 'all' | 'any') =>
  index === count - 1 ? '' : index === count - 2 ? ` ${t(mode === 'any' ? 'flow.text.or' : 'flow.text.and')} ` : ', '

const marked = (problem: string | null) => !!problem && (!props.draft || problem !== 'value')

/** A rule as its variable (set in mono) and the words after it: " è almeno 3", " diventa vero". */
const clauseViews = computed(() => clauses.value.map((clause) => {
  const variable = text.variableOf(clause.variableId)
  const flag = flagOf(clause, variable?.type)
  const value = flag ? '' : text.valueText(variable?.type, clause.value)
  return { name: text.nameOf(clause.variableId), marked: marked(clauseProblem(clause, variable)), tail: ` ${label('conditionOp', flag ?? clause.op)}${value ? ` ${value}` : ''}` }
}))
const effectViews = computed(() => effects.value.map((effect) => {
  const variable = text.variableOf(effect.variableId)
  const value = effect.op === 'toggle' ? '' : text.valueText(variable?.type, effect.value)
  return { name: text.nameOf(effect.variableId), marked: marked(effectProblem(effect, variable)), tail: ` ${label('effectOp', effect.op)}${value ? ` ${value}` : ''}` }
}))

const mode = computed(() => props.link.conditions?.mode ?? 'all')
const target = computed(() => props.targetTitle ?? text.sceneTitle(props.link.toSceneId))
</script>

<template>
  <span class="flow-sentence text-toned">
    <DefineClauses>
      <span v-for="(view, i) in clauseViews" :key="i"><code class="font-mono text-[0.92em]" :class="view.marked ? 'text-error' : 'text-highlighted'">{{ view.name }}</code>{{ view.tail }}{{ separator(i, clauseViews.length, mode) }}</span>
    </DefineClauses>
    <DefineEffects>
      <span v-for="(view, i) in effectViews" :key="i"><code class="font-mono text-[0.92em]" :class="view.marked ? 'text-error' : 'text-highlighted'">{{ view.name }}</code>{{ view.tail }}{{ separator(i, effectViews.length, 'all') }}</span>
    </DefineEffects>

    <template v-if="variant === 'full'">
      <i18n-t v-if="conditioned" keypath="flow.sentence.if" tag="span" scope="global">
        <template #condition><ReuseClauses /></template>
        <template #rest>
          <i18n-t :keypath="spoken ? 'flow.sentence.choice' : 'flow.sentence.continueAfter'" tag="span" scope="global">
            <template #text><span class="voice-author italic text-default">{{ spoken }}</span></template>
            <template #target><span class="voice-author text-default">{{ target }}</span></template>
          </i18n-t>
        </template>
      </i18n-t>
      <i18n-t v-else :keypath="spoken ? 'flow.sentence.choice' : 'flow.sentence.continue'" tag="span" scope="global">
        <template #text><span class="voice-author italic text-default">{{ spoken }}</span></template>
        <template #target><span class="voice-author text-default">{{ target }}</span></template>
      </i18n-t>
      <template v-if="effectViews.length">
        {{ ' ' }}<i18n-t keypath="flow.sentence.then" tag="span" scope="global">
          <template #effects><ReuseEffects /></template>
        </i18n-t>
      </template>
    </template>

    <i18n-t v-else-if="conditioned || effectViews.length" :keypath="conditioned && effectViews.length ? 'flow.sentence.ifThen' : conditioned ? 'flow.sentence.onlyIf' : 'flow.sentence.then'" tag="span" scope="global">
      <template #condition><ReuseClauses /></template>
      <template #effects><ReuseEffects /></template>
    </i18n-t>
  </span>
</template>
