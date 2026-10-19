<script setup lang="ts">
import { PROBLEM_KINDS, type FlowCheck } from '#shared/utils/flow'
import { CHOICE_FORM } from './ChoiceForm.vue'
import { typeDefault, useChoiceText } from './ChoiceSentence.vue'

/**
 * The checks view (spec 4.5 "Controlli", 5.5): the checks of #shared/utils/flow, the same ones the
 * sidebar badge, the path and the export count, as rows with what to do next. Errors and warnings
 * are the problems the badge counts; the hygiene hints (a choice without text among several, a
 * variable never used or never changed) come last, under "Da rivedere". "Mostra" centres the scene
 * on the graph, "Apri scena" opens it, and the others fix it here.
 */
const emit = defineEmits<{ show: [sceneId: string] }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const text = useChoiceText()
const { checks, problems } = useFlow()
const openChoice = inject(CHOICE_FORM, () => {})

const base = computed(() => `/p/${store.projectId}`)

function setStart(id: string | null) {
  if (id) store.updateProject({ startSceneId: id }).catch(() => {})
}
function markEnding(id: string | null) {
  if (id) store.update('scenes', id, { ending: true }).catch(() => {})
}

type Group = 'error' | 'warning' | 'hint'
const groupOf = (check: FlowCheck): Group => (!PROBLEM_KINDS.includes(check.kind) ? 'hint' : check.level)

const GROUP_ICONS: Record<Group, string> = { error: 'i-lucide-circle-alert', warning: 'i-lucide-triangle-alert', hint: 'i-lucide-info' }
const GROUP_COLORS: Record<Group, string> = { error: 'text-error', warning: 'text-warning', hint: 'text-info' }

const groups = computed(() => (['error', 'warning', 'hint'] as const)
  .map(group => ({
    group,
    title: t(`flow.checks.${group}sTitle`),
    prefix: t(`flow.checks.${group}Prefix`),
    items: checks.value.filter(c => groupOf(c) === group),
  }))
  .filter(g => g.items.length))

const summary = computed(() => groups.value.map(g => t(`flow.checks.${g.group}s`, { n: g.items.length }, g.items.length)).join(' · '))

const choiceOf = (check: FlowCheck) => (check.linkId ? store.get('links', check.linkId) : undefined)
const variableName = (check: FlowCheck) => (check.variableId ? store.get('variables', check.variableId)?.name ?? '' : '')
const variableDefault = (check: FlowCheck) => {
  const v = check.variableId ? store.get('variables', check.variableId) : undefined
  return v ? text.valueText(v.type, v.defaultValue || typeDefault(v.type)) : ''
}
</script>

<template>
  <div class="flow-checks">
    <div v-if="!problems" class="mb-8 flex items-start gap-3 py-2">
      <UIcon name="i-lucide-circle-check-big" class="mt-0.5 size-5 shrink-0 text-success" />
      <p class="text-pretty text-default">{{ t('flow.checks.clean') }}</p>
    </div>

    <template v-if="checks.length">
      <p class="tabular mb-6 text-sm text-muted" role="status">{{ summary }}</p>
      <section v-for="group in groups" :key="group.group" class="mb-8" :aria-labelledby="`checks-${group.group}`">
        <h2 :id="`checks-${group.group}`" class="mb-2 flex items-center gap-2 text-base font-semibold text-highlighted">
          <UIcon :name="GROUP_ICONS[group.group]" class="size-4" :class="GROUP_COLORS[group.group]" />
          {{ group.title }}
          <span class="tabular text-sm font-normal text-muted">{{ group.items.length }}</span>
        </h2>
        <ul class="divide-y divide-default/70">
          <li v-for="check in group.items" :key="check.key" class="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
            <p class="flex min-w-0 flex-1 items-start gap-2.5 text-pretty">
              <UIcon :name="GROUP_ICONS[group.group]" class="mt-1 size-4 shrink-0" :class="GROUP_COLORS[group.group]" />
              <span class="sr-only">{{ group.prefix }}</span>
              <i18n-t :keypath="`flow.checks.messages.${check.kind}`" tag="span" scope="global" :plural="check.count ?? 1">
                <template #scene><span class="voice-author font-semibold text-highlighted">{{ check.sceneId ? text.sceneTitle(check.sceneId) : '' }}</span></template>
                <template #choice><span class="voice-author italic text-highlighted">{{ choiceOf(check) ? text.choiceLabel(choiceOf(check)!) : '' }}</span></template>
                <template #variable><code class="font-mono text-[0.92em] text-highlighted">{{ variableName(check) }}</code></template>
                <template #n>{{ check.count ?? 0 }}</template>
                <template #value>{{ variableDefault(check) }}</template>
                <template #audience>{{ term('audience') }}</template>
              </i18n-t>
            </p>

            <div class="flex shrink-0 flex-wrap items-center gap-1 ps-6 sm:ps-0">
              <template v-if="check.kind === 'noStart'">
                <div class="w-64 max-w-full">
                  <FlowScenePicker :model-value="null" :placeholder="t('flow.checks.pickStart')" @update:model-value="setStart" />
                </div>
              </template>
              <template v-else-if="check.kind === 'noEnding'">
                <div class="w-64 max-w-full">
                  <FlowScenePicker :model-value="null" :placeholder="t('flow.checks.pickEnding')" @update:model-value="markEnding" />
                </div>
              </template>
              <template v-else-if="check.kind === 'unusedVariable' || check.kind === 'unchangedVariable'">
                <UButton size="sm" class="max-lg:min-h-11" color="neutral" variant="ghost" icon="i-lucide-variable" :label="t('flow.checks.openVariables')" :to="`${base}/variables?variable=${check.variableId}`" />
              </template>
              <template v-else-if="check.linkId">
                <UButton size="sm" class="max-lg:min-h-11" color="neutral" variant="outline" icon="i-lucide-pencil" :label="t('flow.checks.editChoice')" @click="openChoice({ linkId: check.linkId })" />
                <UButton v-if="check.kind === 'trashedVariable' || check.kind === 'brokenTarget'" size="sm" class="max-lg:min-h-11" color="neutral" variant="ghost" icon="i-lucide-trash-2" :label="t('flow.checks.openTrash')" :to="`${base}/trash`" />
              </template>
              <template v-else-if="check.sceneId">
                <UButton size="sm" class="max-lg:min-h-11" color="neutral" variant="ghost" icon="i-lucide-crosshair" :label="t('flow.checks.show')" @click="emit('show', check.sceneId)" />
                <UButton size="sm" class="max-lg:min-h-11" color="neutral" variant="ghost" icon="i-lucide-file-pen-line" :label="t('flow.checks.openScene')" :to="store.refPath({ type: 'scene', id: check.sceneId })" />
                <UButton v-if="check.kind !== 'deadEnd'" size="sm" class="max-lg:min-h-11" color="neutral" variant="outline" icon="i-lucide-corner-down-right" :label="t('flow.checks.addIncoming')" @click="openChoice({ toSceneId: check.sceneId })" />
                <template v-else>
                  <UButton size="sm" class="max-lg:min-h-11" color="neutral" variant="outline" icon="i-lucide-plus" :label="t('flow.checks.addOutgoing')" @click="openChoice({ fromSceneId: check.sceneId })" />
                  <UButton size="sm" class="max-lg:min-h-11" color="neutral" variant="ghost" icon="i-lucide-flag" :label="t('flow.checks.markEnding')" @click="markEnding(check.sceneId)" />
                </template>
              </template>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
