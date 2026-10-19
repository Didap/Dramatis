import {
  CHARACTER_IMPORTANCES,
  CHARACTER_ROLES,
  CONDITION_OPS,
  DIALOGUE_STYLES,
  DURATION_UNITS,
  EFFECT_OPS,
  ENTITY_COLORS,
  EVENT_KINDS,
  GROUP_KINDS,
  PLANNING_STATUSES,
  POINTS_OF_VIEW,
  PROJECT_KINDS,
  PROJECT_MODULES,
  REF_TYPES,
  RELATION_KINDS,
  SCENE_KINDS,
  SCENE_STATUSES,
  STRAND_KINDS,
  VARIABLE_TYPES,
} from '#shared/utils/constants'

/** The fixed enumerations, by the name of their labels in common.enums (common.json). */
export const ENUMS = {
  sceneStatus: SCENE_STATUSES,
  planningStatus: PLANNING_STATUSES,
  importance: CHARACTER_IMPORTANCES,
  importancePlural: CHARACTER_IMPORTANCES,
  role: CHARACTER_ROLES,
  pov: POINTS_OF_VIEW,
  strandKind: STRAND_KINDS,
  relationKind: RELATION_KINDS,
  groupKind: GROUP_KINDS,
  sceneKind: SCENE_KINDS,
  variableType: VARIABLE_TYPES,
  eventKind: EVENT_KINDS,
  projectKind: PROJECT_KINDS,
  module: PROJECT_MODULES,
  dialogueStyle: DIALOGUE_STYLES,
  durationUnit: DURATION_UNITS,
  conditionOp: CONDITION_OPS,
  effectOp: EFFECT_OPS,
  color: ENTITY_COLORS,
  refType: REF_TYPES,
} as const

export type EnumName = keyof typeof ENUMS

/** Labels and select options for the fixed enumerations, translated. */
export function useEnums() {
  const { t } = useI18n()
  const label = (name: EnumName, key: string | null | undefined) => (key ? t(`common.enums.${name}.${key}`) : '')
  const options = (name: EnumName, keys?: readonly string[]): { value: string, label: string }[] =>
    (keys ?? ENUMS[name]).map(key => ({ value: key, label: label(name, key) }))
  return { label, options }
}
