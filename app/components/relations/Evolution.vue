<script lang="ts">
import type { RelationIntensity, RelationSide, RelationStep } from '#shared/types/domain'
import type { Relation } from '#shared/types/entities'

/** The steps of one side in reading order: by chapter, the ones without a chapter last. */
export function sideSteps(relation: Relation, side: RelationSide, chapterNumber: (id: string) => number): RelationStep[] {
  const at = (step: RelationStep) => (step.chapterId ? chapterNumber(step.chapterId) || Infinity : Infinity)
  return (relation.evolution ?? []).filter(step => step.side === side).sort((a, b) => at(a) - at(b))
}

/** The intensity a side starts from: the relationship's own, before any step. */
export function baseIntensity(relation: Relation, side: RelationSide): RelationIntensity {
  return (side === 'source' ? relation.intensity : relation.reverseIntensity) as RelationIntensity
}
</script>

<script setup lang="ts">
/**
 * How a bond changes along the story, as one side sees it (VRS-564): where it starts, then a step per
 * change, each with the chapter it changes from, how strong it is from there on and a few words on
 * what changes. The steps keep the order they had when the window opened, so a row does not jump
 * away while its chapter is being chosen.
 */
const props = defineProps<{ relation: Relation, side: RelationSide }>()
const open = defineModel<boolean>('open', { default: false })

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()

const viewer = computed(() => (props.side === 'source'
  ? { type: props.relation.sourceType, id: props.relation.sourceId }
  : { type: props.relation.targetType, id: props.relation.targetId }))
const other = computed(() => (props.side === 'source'
  ? { type: props.relation.targetType, id: props.relation.targetId }
  : { type: props.relation.sourceType, id: props.relation.sourceId }))

const chapterItems = computed(() => store.orderedChapters.map((chapter, i) => ({
  label: `${i + 1}. ${chapter.title || t('common.untitled.chapter')}`,
  value: chapter.id,
})))

/** The order of the steps on screen: reading order when the window opens, new steps at the end. */
const order = ref<string[]>([])
watch(open, (value) => { if (value) order.value = sideSteps(props.relation, props.side, store.chapterNumber).map(step => step.id) }, { immediate: true })
const steps = computed(() => {
  const mine = (props.relation.evolution ?? []).filter(step => step.side === props.side)
  const at = (step: RelationStep) => { const i = order.value.indexOf(step.id); return i < 0 ? Infinity : i }
  return mine.sort((a, b) => at(a) - at(b))
})

const all = () => props.relation.evolution ?? []

function save(evolution: RelationStep[], soon = false) {
  if (soon) store.patchSoon('relations', props.relation.id, { evolution })
  else store.update('relations', props.relation.id, { evolution }).catch(() => {})
}

function change(id: string, patch: Partial<RelationStep>, soon = false) {
  save(all().map(step => (step.id === id ? { ...step, ...patch } : step)), soon)
}

function setBase(value: RelationIntensity) {
  store.update('relations', props.relation.id, props.side === 'source' ? { intensity: value } : { reverseIntensity: value }).catch(() => {})
}

const body = ref<HTMLElement | null>(null)

/** A new step starts from the chapter after the last one chosen, with the intensity reached so far. */
function add() {
  const chosen = steps.value.filter(step => step.chapterId).map(step => store.chapterNumber(step.chapterId!))
  const next = store.orderedChapters[chosen.length ? Math.max(...chosen) : 0]
  const step: RelationStep = {
    id: crypto.randomUUID(),
    side: props.side,
    chapterId: next?.id ?? null,
    intensity: steps.value.at(-1)?.intensity ?? baseIntensity(props.relation, props.side),
    note: '',
  }
  order.value = [...order.value, step.id]
  save([...all(), step])
  nextTick(() => body.value?.querySelector<HTMLElement>(`[data-step="${step.id}"] button`)?.focus())
}

function remove(id: string) {
  save(all().filter(step => step.id !== id))
  nextTick(() => body.value?.querySelector<HTMLElement>('[data-evolution-add]')?.focus())
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('relations.evolution.title')"
    :description="t('relations.evolution.description', { a: store.refLabel(viewer), b: store.refLabel(other) })"
  >
    <template #body>
      <div ref="body">
        <RelationsIntensity :model-value="baseIntensity(relation, side)" :label="t('relations.evolution.start')" @update:model-value="setBase" />

        <p v-if="!store.orderedChapters.length" class="mt-4 flex items-start gap-2 text-sm text-muted">
          <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {{ t('relations.evolution.noChapters', { chapter: term('chapter').toLocaleLowerCase(), manuscript: term('manuscript') }) }}
        </p>

        <ol v-if="steps.length" class="mt-4" role="list">
          <li v-for="step in steps" :key="step.id" :data-step="step.id" class="space-y-3 border-t border-default py-4">
            <div class="flex items-end gap-2">
              <UFormField :label="t('relations.evolution.chapter', { chapter: term('chapter').toLocaleLowerCase() })" class="min-w-0 flex-1">
                <USelect
                  :model-value="step.chapterId ?? undefined"
                  :items="chapterItems"
                  :placeholder="step.chapterId ? t('relations.evolution.chapterNone') : t('relations.evolution.chapterPick')"
                  class="w-full"
                  :ui="{ base: 'max-lg:min-h-11' }"
                  @update:model-value="(value: string) => change(step.id, { chapterId: value })"
                />
              </UFormField>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                class="max-lg:min-h-11 max-lg:min-w-11 max-lg:justify-center"
                :aria-label="t('relations.evolution.remove')"
                @click="remove(step.id)"
              />
            </div>
            <RelationsIntensity :model-value="step.intensity" :label="t('relations.evolution.intensityAria')" @update:model-value="(value: RelationIntensity) => change(step.id, { intensity: value })" />
            <UFormField :label="t('relations.evolution.note')">
              <UInput
                :model-value="step.note"
                :placeholder="t('relations.evolution.notePlaceholder')"
                maxlength="500"
                class="w-full"
                :ui="{ base: 'voice-author max-lg:min-h-11' }"
                @update:model-value="(value: string | number) => change(step.id, { note: String(value) }, true)"
              />
            </UFormField>
          </li>
        </ol>
        <p v-else class="mt-4 text-sm text-muted">{{ t('relations.evolution.empty') }}</p>

        <UButton
          data-evolution-add
          class="mt-3 max-lg:min-h-11"
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          :label="t('relations.evolution.add')"
          @click="add"
        />
      </div>
    </template>
    <template #footer>
      <UButton class="ms-auto max-lg:min-h-11" color="neutral" variant="solid" :label="t('relations.evolution.done')" @click="open = false" />
    </template>
  </UModal>
</template>
