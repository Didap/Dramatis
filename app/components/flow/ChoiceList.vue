<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { SceneLink } from '#shared/types/entities'
import { clauseProblem, effectProblem } from '#shared/utils/flow'
import { hasCondition, useChoiceText } from './ChoiceSentence.vue'

/**
 * The choices leading out of one scene, in the order the player sees them (spec 5.5 step 4):
 * reordered by dragging the handle, with Alt+Up/Down, or from the row menu. A row opens the choice.
 */
const props = defineProps<{ sceneId: string }>()

const emit = defineEmits<{ edit: [linkId: string] }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const text = useChoiceText()

const byPosition = (a: SceneLink, b: SceneLink) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)
const choices = computed(() => store.rows.links.filter(l => l.fromSceneId === props.sceneId).sort(byPosition))

/** The draggable copy of the order; follows the store between drags. */
const order = ref<SceneLink[]>([])
watch(choices, (list) => { order.value = [...list] }, { immediate: true })

const listRef = ref<HTMLElement | null>(null)

async function commit(ids: string[], focusId?: string) {
  if (ids.join() === choices.value.map(c => c.id).join()) return
  await store.reorder('links', ids).catch(() => {})
  if (focusId) nextTick(() => listRef.value?.querySelector<HTMLElement>(`[data-choice="${focusId}"]`)?.focus())
}

function move(id: string, delta: number) {
  const ids = choices.value.map(c => c.id)
  const from = ids.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return
  ids.splice(to, 0, ids.splice(from, 1)[0]!)
  commit(ids, id)
}

function onDragEnd() {
  commit(order.value.map(c => c.id))
}

function onKeydown(event: KeyboardEvent, id: string) {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  event.preventDefault()
  move(id, event.key === 'ArrowUp' ? -1 : 1)
}

/** What the checks say about a choice: errors (its target or a variable in the trash, a rule that does not fit), or the hint of a missing text. */
function problemOf(link: SceneLink): { text: string, error: boolean } | null {
  if (!store.get('scenes', link.toSceneId)) return { text: t('flow.choices.problemTarget'), error: true }
  if (store.modules.variables) {
    const vars = (id: string) => store.get('variables', id)
    const problems = [...link.conditions.clauses.map(c => clauseProblem(c, vars(c.variableId))), ...link.effects.map(e => effectProblem(e, vars(e.variableId)))]
    if (problems.includes('missing')) return { text: t('flow.choices.problemVariable'), error: true }
    if (problems.some(Boolean)) return { text: t('flow.choices.problemRule'), error: true }
  }
  if (!link.label.trim() && choices.value.length > 1) return { text: t('flow.choices.problemEmptyText', { audience: term('audience') }), error: false }
  return null
}

const problems = computed(() => new Map(order.value.map(link => [link.id, problemOf(link)])))

function menu(link: SceneLink, index: number) {
  return [
    [{ label: t('flow.choices.edit'), icon: 'i-lucide-pencil', onSelect: () => emit('edit', link.id) }],
    [
      { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', kbds: ['alt', 'arrowup'], disabled: index === 0, onSelect: () => move(link.id, -1) },
      { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', kbds: ['alt', 'arrowdown'], disabled: index === choices.value.length - 1, onSelect: () => move(link.id, 1) },
    ],
    [{ label: t('flow.choices.trash'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => store.remove('links', link.id).catch(() => {}) }],
  ]
}

const showVariables = computed(() => store.modules.variables)
</script>

<template>
  <div ref="listRef">
    <VueDraggable
      v-model="order"
      tag="ol"
      handle=".flow-choice-handle"
      :animation="150"
      :delay="180"
      :delay-on-touch-only="true"
      class="space-y-1"
      @end="onDragEnd"
    >
      <li v-for="(link, index) in order" :key="link.id" class="group flex items-start gap-1 rounded-[calc(var(--ui-radius)*2)] hover:bg-elevated focus-within:bg-elevated">
        <span
          class="flow-choice-handle mt-1 hidden h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-dimmed opacity-0 transition-opacity duration-150 group-hover:opacity-100 sm:flex"
          :title="t('common.a11y.dragHandle')"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-grip-vertical" class="size-4" />
        </span>
        <button
          type="button"
          :data-choice="link.id"
          class="min-w-0 flex-1 rounded-[calc(var(--ui-radius)*2)] py-1.5 ps-1 text-start max-lg:min-h-11 outline-none focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
          :aria-label="t('flow.choices.rowLabel', { n: index + 1, sentence: text.choiceSentence(link) })"
          :aria-keyshortcuts="'Alt+ArrowUp Alt+ArrowDown'"
          @click="emit('edit', link.id)"
          @keydown="onKeydown($event, link.id)"
        >
          <span class="flex items-baseline gap-2">
            <span class="tabular w-4 shrink-0 text-end text-xs text-dimmed" aria-hidden="true">{{ index + 1 }}</span>
            <span class="min-w-0 flex-1">
              <span class="block text-pretty">
                <span v-if="link.label.trim()" class="voice-author italic text-highlighted"><UIcon v-if="showVariables && hasCondition(link)" name="i-lucide-lock" class="me-1 inline-block size-3.5 align-[-0.125em] text-muted" />{{ link.label.trim() }}</span>
                <span v-else class="text-sm font-medium text-muted"><UIcon v-if="showVariables && hasCondition(link)" name="i-lucide-lock" class="me-1 inline-block size-3.5 align-[-0.125em]" />{{ t('flow.text.continue') }}</span>
                <span class="ms-2 text-sm text-muted"><UIcon name="i-lucide-arrow-right" class="me-1 inline-block size-3.5 align-[-0.125em]" /><span class="voice-author text-toned">{{ text.sceneTitle(link.toSceneId) }}</span><span v-if="store.get('scenes', link.toSceneId)?.code" class="ms-1.5 font-mono text-xs text-dimmed">{{ store.get('scenes', link.toSceneId)?.code }}</span></span>
              </span>
              <span v-if="showVariables && (link.conditions.clauses.length || link.effects.length)" class="mt-0.5 block text-sm">
                <FlowChoiceSentence :link="link" variant="rules" />
              </span>
              <span v-if="problems.get(link.id)" class="mt-0.5 flex items-start gap-1.5 text-sm" :class="problems.get(link.id)!.error ? 'text-error' : 'text-warning'">
                <UIcon :name="problems.get(link.id)!.error ? 'i-lucide-circle-alert' : 'i-lucide-triangle-alert'" class="mt-0.5 size-3.5 shrink-0" />
                {{ problems.get(link.id)!.text }}
              </span>
            </span>
          </span>
        </button>
        <UDropdownMenu :items="menu(link, index)" :content="{ align: 'end' }">
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="ghost"
            size="sm"
            class="mt-0.5 shrink-0 max-lg:size-11 max-lg:justify-center"
            :aria-label="t('flow.choices.menu', { n: index + 1 })"
          />
        </UDropdownMenu>
      </li>
    </VueDraggable>
  </div>
</template>
