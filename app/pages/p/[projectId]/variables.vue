<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import { useMediaQuery } from '@vueuse/core'
import type { VariableType } from '#shared/types/domain'
import type { Variable } from '#shared/types/entities'
import { CHOICE_FORM, type ChoiceFormRequest } from '~/components/flow/ChoiceForm.vue'
import { VARIABLE_NAME_RE, toVariableName, typeDefault, useChoiceText } from '~/components/flow/ChoiceSentence.vue'

/**
 * State variables (spec 4.5, 7.20): what the game remembers. Rows with name, type, starting value and
 * where each is used; a row opens its editor in place (a drawer on the phone). New variables are typed
 * in the last row. Reordered by drag, Alt+Up/Down or the row menu; trashing a used variable leaves its
 * choices in place, and the flow checks point them out.
 */
const route = useRoute()
const router = useRouter()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label, options } = useEnums()
const { usage } = useFlow()
const text = useChoiceText()
const toast = useToast()
const desktop = useMediaQuery('(min-width: 1024px)')

const guidance = computed(() => store.project?.settings.guidance !== false)

// ---------------------------------------------------------------- the open variable (?variable=)

/** On a phone the drawer is a step in the history, so Back closes it; on desktop the editor opens in place. */
let pushed = false
watch(() => route.query.variable, (id) => { if (!id) pushed = false })

const openId = computed<string | null>({
  get: () => {
    const id = route.query.variable
    return typeof id === 'string' && store.get('variables', id) ? id : null
  },
  set: (id) => {
    const query = { ...route.query }
    if (id) query.variable = id
    else delete query.variable
    if (id && !desktop.value && !route.query.variable) {
      pushed = true
      router.push({ query })
    }
    else if (!id && pushed) {
      pushed = false
      router.back()
    }
    else router.replace({ query })
  },
})

function toggle(id: string) {
  openId.value = openId.value === id ? null : id
}

const drawerOpen = computed({
  get: () => !desktop.value && !!openId.value,
  set: (open) => { if (!open) openId.value = null },
})

onMounted(() => {
  if (openId.value) nextTick(() => document.querySelector<HTMLElement>(`[data-variable="${openId.value}"]`)?.scrollIntoView({ block: 'center' }))
})

// ---------------------------------------------------------------- order

const order = ref<Variable[]>([])
watch(() => store.rows.variables, (list) => { order.value = [...list] }, { immediate: true, deep: true })

async function commitOrder(ids: string[], focusId?: string) {
  if (ids.join() === store.rows.variables.map(v => v.id).join()) return
  await store.reorder('variables', ids).catch(() => {})
  if (focusId) nextTick(() => document.querySelector<HTMLElement>(`[data-variable="${focusId}"]`)?.focus())
}

function move(id: string, delta: number) {
  const ids = store.rows.variables.map(v => v.id)
  const from = ids.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return
  ids.splice(to, 0, ids.splice(from, 1)[0]!)
  commitOrder(ids, id)
}

function onKeydown(event: KeyboardEvent, id: string) {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  event.preventDefault()
  move(id, event.key === 'ArrowUp' ? -1 : 1)
}

// ---------------------------------------------------------------- usage and trash

const usesOf = (id: string) => store.rows.links.filter(l => l.conditions.clauses.some(c => c.variableId === id) || l.effects.some(e => e.variableId === id)).length

function usageText(id: string) {
  const reads = usage.value.read.get(id) ?? 0
  const writes = usage.value.written.get(id) ?? 0
  if (!reads && !writes) return t('flow.variables.notUsed')
  return [reads ? t('flow.variables.conditionsCount', { n: reads }, reads) : '', writes ? t('flow.variables.effectsCount', { n: writes }, writes) : ''].filter(Boolean).join(' · ')
}

function shownDefault(variable: Variable) {
  if (variable.type === 'string' && !variable.defaultValue) return t('flow.variables.emptyText')
  return text.valueText(variable.type, variable.defaultValue || typeDefault(variable.type))
}

async function trash(variable: Variable) {
  const used = usesOf(variable.id)
  if (openId.value === variable.id) openId.value = null
  const result = await store.remove('variables', variable.id, { undo: false }).catch(() => null)
  if (!result) return
  toast.add({
    title: t('flow.variables.trashed', { name: variable.name }),
    description: used ? t('flow.variables.trashedUsed', { n: used }, used) : undefined,
    icon: 'i-lucide-trash-2',
    actions: [{ label: t('common.actions.undo'), onClick: () => { store.restore('variables', variable.id).catch(() => {}) } }],
  })
}

function menu(variable: Variable, index: number) {
  return [
    [
      { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', kbds: ['alt', 'arrowup'], disabled: index === 0, onSelect: () => move(variable.id, -1) },
      { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', kbds: ['alt', 'arrowdown'], disabled: index === order.value.length - 1, onSelect: () => move(variable.id, 1) },
    ],
    [{ label: t('flow.variables.trash'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => trash(variable) }],
  ]
}

// ---------------------------------------------------------------- new variable (the last row)

const draftName = ref('')
const draftType = ref<VariableType>('boolean')
const draftTouched = ref(false)
const creating = ref(false)
const newInput = ref<{ inputRef?: HTMLInputElement } | null>(null)
const typeItems = computed(() => options('variableType'))

const draftProblem = computed(() => {
  const value = draftName.value.trim()
  if (!value) return draftTouched.value ? t('flow.variables.errorEmpty') : ''
  if (!VARIABLE_NAME_RE.test(value)) return t('flow.variables.errorRuleSuggest', { name: toVariableName(value) || t('flow.variables.exampleName') })
  if (store.rows.variables.some(v => v.name === value)) return t('flow.variables.errorTaken', { name: value })
  return ''
})

async function create() {
  draftTouched.value = true
  const name = draftName.value.trim()
  if (!name || draftProblem.value || creating.value) return
  creating.value = true
  try {
    const row = await store.create('variables', { name, type: draftType.value, defaultValue: typeDefault(draftType.value) })
    draftName.value = ''
    draftTouched.value = false
    if (desktop.value) openId.value = row.id
    nextTick(() => newInput.value?.inputRef?.focus())
  }
  catch {}
  finally {
    creating.value = false
  }
}

/** "Fiducia di Oren" is offered back as fiducia_di_oren. */
function useSuggestion() {
  draftName.value = toVariableName(draftName.value)
}

// ---------------------------------------------------------------- choices opened from "Dove si usa"

const form = reactive<{ open: boolean } & ChoiceFormRequest>({ open: false, linkId: null })
provide(CHOICE_FORM, (request) => {
  Object.assign(form, { linkId: null, fromSceneId: null, toSceneId: null }, request, { open: true })
})
</script>

<template>
  <DPage :title="term('variables')">
    <template v-if="!store.modules.variables">
      <DPageHeader :title="term('variables')" />
      <DEmptyState
        icon="i-lucide-variable"
        :title="t('flow.variables.offTitle')"
        :description="t('flow.variables.offBody')"
        :actions="[{ label: t('flow.page.openSettings'), to: `/p/${store.projectId}/settings`, color: 'neutral', variant: 'outline' }]"
        class="py-12"
      />
    </template>

    <template v-else>
      <DPageHeader :title="term('variables')" :description="guidance && order.length ? t('flow.variables.lead') : undefined">
        <template v-if="order.length" #meta>
          <span class="tabular">{{ t('flow.variables.count', { n: order.length }, order.length) }}</span>
          <NuxtLink v-if="store.modules.branching" :to="`/p/${store.projectId}/flow?view=checks`" class="inline-flex items-center gap-1.5 underline underline-offset-3 hover:text-highlighted max-lg:min-h-11">
            <UIcon name="i-lucide-list-checks" class="size-4" />{{ t('flow.variables.toChecks') }}
          </NuxtLink>
        </template>
      </DPageHeader>

      <template v-if="!order.length">
        <div class="space-y-1" aria-hidden="true">
          <div v-for="i in 2" :key="i" class="flex h-11 items-center gap-3 px-2 opacity-60">
            <span class="h-3 w-28 rounded bg-elevated" />
            <span class="h-3 w-14 rounded bg-elevated" />
            <DLeader />
            <span class="h-3 w-20 rounded bg-elevated" />
          </div>
        </div>
        <p class="mt-6 mb-2 max-w-prose text-pretty text-default">{{ t('flow.variables.emptyTitle', { audience: term('audience') }) }}</p>
        <i18n-t v-if="guidance" keypath="flow.variables.emptyBody" tag="p" scope="global" class="mb-6 max-w-prose text-pretty text-sm text-muted">
          <template #a><code class="font-mono text-toned">{{ t('flow.variables.exampleA') }}</code></template>
          <template #b><code class="font-mono text-toned">{{ t('flow.variables.exampleB') }}</code></template>
        </i18n-t>
      </template>

      <VueDraggable
        v-else
        v-model="order"
        tag="ul"
        handle=".flow-variable-handle"
        :animation="150"
        :delay="180"
        :delay-on-touch-only="true"
        class="divide-y divide-default/60"
        :aria-label="term('variables')"
        @end="commitOrder(order.map(v => v.id))"
      >
        <li v-for="(variable, index) in order" :key="variable.id">
          <div class="group flex min-h-14 items-center gap-1 rounded-[calc(var(--ui-radius)*2)] sm:min-h-11" :class="openId === variable.id ? 'bg-elevated' : 'hover:bg-elevated'">
            <span
              class="flow-variable-handle hidden size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-dimmed opacity-0 transition-opacity duration-150 group-hover:opacity-100 sm:flex"
              :title="t('common.a11y.dragHandle')"
              aria-hidden="true"
            >
              <UIcon name="i-lucide-grip-vertical" class="size-4" />
            </span>
            <button
              type="button"
              :data-variable="variable.id"
              class="flex min-w-0 flex-1 flex-col gap-0.5 rounded-[calc(var(--ui-radius)*2)] px-2 py-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-(--ui-primary) sm:flex-row sm:items-baseline sm:gap-3 sm:py-1.5"
              :aria-expanded="openId === variable.id"
              :aria-controls="desktop ? `variable-editor-${variable.id}` : undefined"
              :aria-keyshortcuts="'Alt+ArrowUp Alt+ArrowDown'"
              @click="toggle(variable.id)"
              @keydown="onKeydown($event, variable.id)"
            >
              <span class="flex min-w-0 flex-wrap items-baseline gap-x-3 sm:shrink-0 sm:flex-nowrap">
                <code class="font-mono text-[0.9375rem] font-medium break-all text-highlighted">{{ variable.name }}</code>
                <span class="shrink-0 text-sm text-muted">{{ label('variableType', variable.type) }}</span>
                <span class="shrink-0 font-mono text-sm text-toned">{{ shownDefault(variable) }}</span>
              </span>
              <span v-if="variable.description" class="voice-author hidden min-w-0 flex-[2_1_0%] truncate text-sm italic text-muted md:block">{{ variable.description }}</span>
              <DLeader class="hidden sm:block" />
              <span class="tabular shrink-0 text-sm" :class="usage.read.get(variable.id) || usage.written.get(variable.id) ? 'text-muted' : 'text-dimmed'">{{ usageText(variable.id) }}</span>
            </button>
            <UDropdownMenu :items="menu(variable, index)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" class="max-lg:size-11 max-lg:justify-center" :aria-label="t('flow.variables.menu', { name: variable.name })" />
            </UDropdownMenu>
          </div>
          <div v-if="desktop && openId === variable.id" :id="`variable-editor-${variable.id}`" class="pt-3 pb-6 ps-9 pe-2">
            <FlowVariableEditor :key="variable.id" :variable-id="variable.id" />
            <div class="mt-5 flex items-center gap-2">
              <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" :label="t('flow.variables.trash')" @click="trash(variable)" />
              <span class="flex-1" />
              <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-chevron-up" :label="t('flow.variables.close')" @click="openId = null" />
            </div>
          </div>
        </li>
      </VueDraggable>

      <form class="mt-4 flex flex-wrap items-start gap-2 border-t border-default pt-4" novalidate @submit.prevent="create">
        <UFormField class="min-w-48 flex-1" :error="draftProblem || undefined" :ui="{ error: 'flex items-center gap-2 flex-wrap' }">
          <UInput
            ref="newInput"
            v-model="draftName"
            :placeholder="t('flow.variables.newPlaceholder')"
            :aria-label="t('flow.variables.newName')"
            :maxlength="60"
            autocomplete="off"
            spellcheck="false"
            class="w-full"
            :ui="{ base: 'font-mono max-lg:h-11' }"
          />
          <template v-if="draftProblem && draftName.trim() && toVariableName(draftName) && toVariableName(draftName) !== draftName.trim()" #error>
            <span>{{ draftProblem }}</span>
            <UButton size="xs" color="neutral" variant="outline" class="max-lg:min-h-11" :label="t('flow.variables.useSuggestion', { name: toVariableName(draftName) })" @click="useSuggestion" />
          </template>
        </UFormField>
        <USelect v-model="draftType" :items="typeItems" :aria-label="t('flow.variables.type')" class="w-36 max-lg:h-11" />
        <UButton type="submit" color="primary" variant="solid" icon="i-lucide-plus" :label="t('flow.variables.add')" :loading="creating" class="max-lg:min-h-11" />
      </form>
      <p v-if="!order.length || guidance" class="mt-2 text-sm text-muted">{{ t('flow.variables.nameHelp') }}</p>
    </template>

    <UDrawer v-if="!desktop" v-model:open="drawerOpen" :ui="{ content: 'max-h-[90dvh]', body: 'pb-[calc(1.5rem+env(safe-area-inset-bottom))]' }">
      <template #title>
        <code v-if="openId" class="font-mono text-base text-highlighted">{{ store.get('variables', openId)?.name }}</code>
      </template>
      <template #body>
        <template v-if="openId">
          <FlowVariableEditor :key="openId" :variable-id="openId" />
          <UButton class="mt-6 max-lg:min-h-11" icon="i-lucide-trash-2" color="error" variant="ghost" :label="t('flow.variables.trash')" @click="trash(store.get('variables', openId)!)" />
        </template>
      </template>
    </UDrawer>

    <FlowChoiceForm
      v-model:open="form.open"
      :link-id="form.linkId"
      :from-scene-id="form.fromSceneId"
      :to-scene-id="form.toSceneId"
    />
  </DPage>
</template>
