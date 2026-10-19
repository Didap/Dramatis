<script setup lang="ts">
import type { ProjectKind, ProjectModule } from '#shared/types/domain'
import { PROJECT_MODULES } from '#shared/utils/constants'
import { DEFAULT_MODULES } from '#shared/utils/modules'
import type { TermKey } from '~/composables/useTerms'

/**
 * Changing the type (spec 5.1 "Changing type later"): what changes before it changes. The words
 * that follow the medium, the modules of the new type as switches already set to its defaults (the
 * author keeps or drops each), and the promise that nothing is deleted. Inline, never a modal.
 */
const props = defineProps<{
  target: ProjectKind
  busy?: boolean
}>()
const emit = defineEmits<{ cancel: [], confirm: [modules: Record<ProjectModule, boolean>] }>()

const store = useProjectStore()
const { t } = useI18n()
const { label } = useEnums()

/** The medium's words that change, as the author knows them now and as they will read. */
const WORDS: [TermKey, number][] = [['manuscript', 1], ['part', 2], ['strands', 1], ['groups', 1], ['objects', 1], ['projectDocument', 1]]
const vocabulary = computed(() => WORDS
  .map(([key, count]) => ({ key, from: t(`common.vocab.${store.kind}.${key}`, count), to: t(`common.vocab.${props.target}.${key}`, count) }))
  .filter(word => word.from !== word.to))

const chosen = reactive<Record<ProjectModule, boolean>>({ ...DEFAULT_MODULES[props.target] })
watch(() => props.target, (kind) => { Object.assign(chosen, DEFAULT_MODULES[kind]) })

/** State variables live on the branches: one brings the other, in both directions. */
function toggle(key: ProjectModule, value: boolean) {
  chosen[key] = value
  if (key === 'variables' && value) chosen.branching = true
  if (key === 'branching' && !value) chosen.variables = false
}

const root = useTemplateRef<HTMLElement>('root')
onMounted(() => root.value?.focus())
</script>

<template>
  <div
    ref="root"
    class="settings-kind-change space-y-5 rounded-[calc(var(--ui-radius)*2)] border border-default px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-5"
    role="group"
    tabindex="-1"
    aria-labelledby="kind-change-title"
    aria-describedby="kind-change-safe"
    @keydown.esc.stop="emit('cancel')"
  >
    <h3 id="kind-change-title" class="font-semibold text-highlighted">{{ t(`settings.kindChange.title.${target}`) }}</h3>

    <div v-if="vocabulary.length">
      <p class="text-sm text-muted">{{ t('settings.kindChange.vocabulary') }}</p>
      <ul class="mt-2 space-y-1 text-sm">
        <li v-for="word in vocabulary" :key="word.key" class="flex min-h-7 flex-wrap items-center gap-x-2">
          <span class="text-muted">{{ word.from }}</span>
          <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0 text-dimmed" aria-hidden="true" />
          <span class="sr-only">{{ t('settings.kindChange.becomes') }}</span>
          <span class="font-medium text-highlighted">{{ word.to }}</span>
        </li>
      </ul>
    </div>

    <fieldset>
      <legend class="text-sm text-muted">{{ t(`settings.kindChange.modules.${target}`) }}</legend>
      <ul class="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <li v-for="key in PROJECT_MODULES" :key="key" class="flex min-h-11 items-center">
          <USwitch
            :model-value="chosen[key]"
            :label="label('module', key)"
            :ui="{ base: 'relative max-lg:after:absolute max-lg:after:-inset-x-1.5 max-lg:after:-inset-y-3.5' }"
            @update:model-value="(value: boolean) => toggle(key, value)"
          />
        </li>
      </ul>
    </fieldset>

    <p id="kind-change-safe" class="flex gap-2 text-sm text-pretty text-toned">
      <UIcon name="i-lucide-shield-check" class="mt-0.5 size-4 shrink-0 text-muted" />
      {{ t(`settings.kindChange.safe.${target}`) }}
    </p>

    <div class="flex flex-wrap gap-2">
      <UButton :label="t('common.actions.cancel')" color="neutral" variant="ghost" class="max-lg:min-h-11" @click="emit('cancel')" />
      <UButton :label="t(`settings.kindChange.confirm.${target}`)" color="primary" variant="solid" :loading="busy" class="max-lg:min-h-11" @click="emit('confirm', { ...chosen })" />
    </div>
  </div>
</template>
