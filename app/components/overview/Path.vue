<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PathReason, PathStage, PathStageKey, ProjectPath } from '~~/server/api/projects/[projectId]/path.get'

/**
 * The A-to-Z path (DESIGN.md "The A-to-Z path", spec 3): the eight stages on one line joined by the
 * leader, solid as each stage is done; the current stage expanded below with its question, the fact
 * that keeps it open and its action. A narrow desktop window sets the steps in two rows of four; on a
 * phone they become a vertical list. Folded (guidance off), it is one line: "Percorso: Stesura, 6 di 8".
 */
const props = withDefaults(defineProps<{
  path: ProjectPath
  /** Guidance is off: one quiet line instead of the card. */
  folded?: boolean
  /** The current stage's action is the view's one solid button (when there is nothing to resume). */
  solid?: boolean
}>(), { folded: false, solid: false })
const emit = defineEmits<{ hide: [], show: [] }>()

const store = useProjectStore()
const { t, te } = useI18n()
const { number, scenes, chapters, date } = useFormat()

const medium = computed(() => props.path.kind)
const currentIndex = computed(() => props.path.stages.findIndex(s => s.key === props.path.current))
const current = computed(() => props.path.stages[currentIndex.value])
const link = (stage: PathStage) => `/p/${store.projectId}/${stage.to}`

/** A message of the medium when it has its own wording, else the shared one. */
function key(group: 'reasons' | 'actions', code: string) {
  const own = `overview.path.${group}.${medium.value}.${code}`
  return te(own) ? own : `overview.path.${group}.${code}`
}

function stageText(stage: PathStageKey, field: 'label' | 'short' | 'question' | 'next') {
  return t(`overview.path.stages.${medium.value}.${stage}.${field}`)
}

function named(params: Record<string, string | number> = {}) {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(params)) {
    if (name === 'chapters') out[name] = chapters(Number(value))
    else if (name === 'scenes') out[name] = scenes(Number(value))
    else if (name === 'date') out[name] = date(String(value))
    else if (typeof value === 'number') out[name] = number(value)
    else if (name === 'title') out[name] = value || t('common.untitled.scene')
    else if (name === 'chapter') out[name] = value || t('common.untitled.chapter')
    else out[name] = value
  }
  return out
}

function reasonText(reason: PathReason) {
  const values = { ...named(reason.params), ...(reason.n !== undefined ? { n: number(reason.n) } : {}) }
  return reason.n !== undefined ? t(key('reasons', reason.code), values, reason.n) : t(key('reasons', reason.code), values)
}

function actionText(stage: PathStage) {
  return t(key('actions', stage.action), named(stage.actionParams))
}

const stateText = (stage: PathStage, index: number) =>
  stage.done ? t('overview.path.state.done') : index === currentIndex.value ? t('overview.path.state.current') : t('overview.path.state.ahead')

/** The accessible name of a step: its label, its state and the fact behind it. */
const stepLabel = (stage: PathStage, index: number) =>
  `${stageText(stage.key, 'label')}: ${stateText(stage, index)}. ${reasonText(stage.reason)}`

const foldedText = computed(() => current.value
  ? t('overview.path.folded', { stage: stageText(current.value.key, 'short'), n: currentIndex.value + 1, total: props.path.stages.length })
  : t('overview.path.foldedDone', { total: props.path.stages.length }))

/*
 * "Premessa: fatto. Il prossimo passo è il protagonista." once, on the first visit after a stage
 * turned done. What was done at the last visit is remembered on this device.
 */
const completion = ref('')
watch(() => props.path, (path) => {
  const storageKey = `dramatis:path:${store.projectId}`
  const done = path.stages.filter(s => s.done).map(s => s.key)
  let seen: string[] | null = null
  try { seen = JSON.parse(localStorage.getItem(storageKey) ?? 'null') }
  catch {}
  const fresh = seen ? path.stages.filter(s => s.done && !seen!.includes(s.key)) : []
  if (fresh.length) {
    const next = path.current ? stageText(path.current, 'next') : t('overview.path.allDone')
    completion.value = t('overview.path.completed', { stage: stageText(fresh.at(-1)!.key, 'label'), next })
  }
  try { localStorage.setItem(storageKey, JSON.stringify(done)) }
  catch {}
}, { immediate: true })

const menu = computed<DropdownMenuItem[]>(() => [
  { label: t('overview.path.hide'), icon: 'i-lucide-eye-off', onSelect: () => emit('hide') },
  { label: t('overview.path.settings'), icon: 'i-lucide-settings-2', to: `/p/${store.projectId}/settings#guidance` },
])
</script>

<template>
  <section class="overview-path @container" :aria-label="t('overview.path.title')">
    <p v-if="completion && !folded" class="mb-4 flex items-center gap-2 text-sm text-toned" role="status">
      <UIcon name="i-lucide-check" class="size-4 shrink-0 text-primary" />
      {{ completion }}
    </p>

    <!-- Folded: one line, the way back one click away. -->
    <div v-if="folded" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <NuxtLink v-if="current" :to="link(current)" class="text-muted hover:text-highlighted">{{ foldedText }}</NuxtLink>
      <span v-else class="text-muted">{{ foldedText }}</span>
      <UButton color="primary" variant="link" size="sm" :label="t('overview.path.show')" class="px-0 underline underline-offset-3 max-lg:min-h-11" @click="emit('show')" />
    </div>

    <template v-else>
      <div class="flex items-start gap-2">
        <!-- Desktop: one line, the leader turning solid as each step is done; two rows of four in a narrow window. -->
        <ol class="hidden min-w-0 flex-1 items-center gap-y-1.5 lg:flex lg:@max-[48rem]:grid lg:@max-[48rem]:grid-cols-4">
          <li
            v-for="(stage, i) in path.stages"
            :key="stage.key"
            class="flex min-w-0 items-baseline"
            :class="i < path.stages.length - 1 ? 'flex-auto' : 'shrink-0'"
          >
            <UTooltip :text="reasonText(stage.reason)" :content="{ side: 'bottom' }">
              <NuxtLink
                :to="link(stage)"
                :aria-label="stepLabel(stage, i)"
                :aria-current="i === currentIndex ? 'step' : undefined"
                class="flex shrink-0 items-center gap-1 rounded-[calc(var(--ui-radius)*1.5)] py-1 text-sm transition-colors duration-150 hover:text-highlighted"
                :class="i === currentIndex ? 'font-medium text-highlighted' : stage.done ? 'text-default' : 'text-muted'"
              >
                <UIcon v-if="stage.done" name="i-lucide-check" class="size-4 shrink-0 text-primary" />
                <span v-else-if="i === currentIndex" class="size-2 shrink-0 rounded-full bg-primary" />
                <span v-else class="size-2 shrink-0 rounded-full border border-(--ui-border-accented)" />
                <span class="whitespace-nowrap">{{ stageText(stage.key, 'short') }}</span>
              </NuxtLink>
            </UTooltip>
            <DLeader v-if="i < path.stages.length - 1" :done="stage.done" class="mx-1 min-w-2" />
          </li>
        </ol>

        <!-- Phone: a vertical list, the same rule running down the side. -->
        <ol class="min-w-0 flex-1 lg:hidden">
          <li v-for="(stage, i) in path.stages" :key="stage.key" class="relative flex gap-3">
            <span class="relative flex w-4 shrink-0 justify-center" aria-hidden="true">
              <span
                v-if="i < path.stages.length - 1"
                class="absolute top-7 -bottom-3 left-1/2 -translate-x-1/2"
                :class="stage.done ? 'w-px bg-primary' : 'border-l border-dotted border-(--ui-border-accented)'"
              />
              <span class="relative mt-3.5 grid size-4 place-items-center">
                <UIcon v-if="stage.done" name="i-lucide-check" class="size-4 text-primary" />
                <span v-else-if="i === currentIndex" class="size-2 rounded-full bg-primary" />
                <span v-else class="size-2 rounded-full border border-(--ui-border-accented)" />
              </span>
            </span>
            <div class="min-w-0 flex-1">
              <NuxtLink
                :to="link(stage)"
                :aria-label="stepLabel(stage, i)"
                :aria-current="i === currentIndex ? 'step' : undefined"
                class="flex min-h-11 flex-col justify-center rounded-[calc(var(--ui-radius)*1.5)] py-1"
              >
                <span class="text-sm" :class="i === currentIndex ? 'font-medium text-highlighted' : stage.done ? 'text-default' : 'text-muted'">
                  {{ stageText(stage.key, 'label') }}
                </span>
                <span v-if="i !== currentIndex" class="truncate text-xs text-muted">{{ reasonText(stage.reason) }}</span>
              </NuxtLink>
              <div v-if="i === currentIndex" class="pb-4">
                <p class="text-pretty text-default">{{ stageText(stage.key, 'question') }}</p>
                <p class="mt-1 text-sm text-muted">{{ reasonText(stage.reason) }}</p>
                <UButton
                  :to="link(stage)"
                  :label="actionText(stage)"
                  :color="solid ? 'primary' : 'neutral'"
                  :variant="solid ? 'solid' : 'outline'"
                  class="mt-3 max-w-full max-lg:min-h-11"
                  :ui="{ label: 'truncate' }"
                />
              </div>
            </div>
          </li>
        </ol>

        <UDropdownMenu :items="menu" :content="{ align: 'end' }">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" :aria-label="t('overview.path.menu')" class="shrink-0 justify-center max-lg:min-h-11 max-lg:min-w-11" />
        </UDropdownMenu>
      </div>

      <!-- Desktop: the current stage, expanded under the line. -->
      <div v-if="current" class="mt-5 hidden max-w-prose lg:block">
        <p class="text-xs font-medium text-muted">{{ t('overview.path.stepOf', { n: currentIndex + 1, total: path.stages.length }) }}</p>
        <h2 class="mt-1 text-lg font-semibold text-highlighted">{{ stageText(current.key, 'label') }}</h2>
        <p class="mt-1 text-pretty text-default">{{ stageText(current.key, 'question') }}</p>
        <p class="mt-1 text-sm text-muted">{{ reasonText(current.reason) }}</p>
        <UButton
          :to="link(current)"
          :label="actionText(current)"
          :color="solid ? 'primary' : 'neutral'"
          :variant="solid ? 'solid' : 'outline'"
          class="mt-3"
        />
      </div>
      <p v-else class="mt-4 flex items-center gap-2 text-sm text-toned">
        <UIcon name="i-lucide-check" class="size-4 text-primary" />
        {{ t('overview.path.allDone') }}
      </p>
    </template>
  </section>
</template>
