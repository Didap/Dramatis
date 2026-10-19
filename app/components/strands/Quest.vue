<script setup lang="ts">
import type { QuestDetails, QuestObjective, QuestReward } from '#shared/types/domain'
import type { Strand } from '#shared/types/entities'

/**
 * The quest of a strand of kind quest or side_quest (module quests, spec 4.3): who gives it, the
 * objectives in order (text, optional, the scene where each is completed, done when that scene is at
 * least a draft) and the rewards (text, optionally an object). Enter adds the next line, Backspace on
 * an empty one removes it, Alt+Up/Down moves it.
 */
const props = defineProps<{ strand: Strand }>()

const store = useProjectStore()
const toast = useToast()
const { t } = useI18n()
const { label } = useEnums()

const quest = computed<QuestDetails>(() => props.strand.quest ?? {})
const objectives = computed(() => quest.value.objectives ?? [])
const rewards = computed(() => quest.value.rewards ?? [])

/**
 * Saves the whole quest (typing and structure alike, so changes never overtake each other). Scenes and
 * objects in the trash keep their place: they come back with a restore. The server still refuses a
 * giver or a place in the trash, so those alone are left out.
 */
function save(next: QuestDetails, delay = 700, strandId = props.strand.id) {
  const live = (collection: 'characters' | 'locations', id: string | null | undefined) =>
    id === undefined ? undefined : (id && store.get(collection, id) ? id : null)
  const clean = { ...next, giverId: live('characters', next.giverId), locationId: live('locations', next.locationId) }
  store.patchSoon('strands', strandId, { quest: clean }, delay)
}

/** A linked item in the trash is kept but not given to its picker, which would show its id instead of a name. */
const inTrash = (collection: 'characters' | 'objects', id: string | null | undefined) => !!id && !store.get(collection, id)
const shown = (collection: 'characters' | 'scenes' | 'objects', id: string | null | undefined) => (id && store.get(collection, id) ? id : null)

const shortId = () => Math.random().toString(36).slice(2, 10)

/** Puts the caret at the end of an objective's or a reward's text. */
async function focusLine(kind: 'objective' | 'reward', id: string) {
  await nextTick()
  const field = document.querySelector<HTMLTextAreaElement>(`[data-${kind}-text="${id}"]`)
  if (!field) return
  field.focus()
  field.setSelectionRange(field.value.length, field.value.length)
}

// ---------------------------------------------------------------- objectives and rewards

/** Done when its scene is at least a draft (spec 4.3): a short label beside the scene, the reason in the tooltip. */
function check(objective: QuestObjective) {
  const scene = store.get('scenes', objective.sceneId)
  if (!scene) {
    const trashed = !!objective.sceneId
    return {
      done: false,
      icon: 'i-lucide-circle-dashed',
      tone: 'text-dimmed',
      short: t(trashed ? 'strands.quest.check.trashedShort' : 'strands.quest.check.noneShort'),
      text: t(trashed ? 'strands.quest.check.trashed' : 'strands.quest.check.none'),
    }
  }
  const title = scene.title || t('common.untitled.scene')
  if (scene.status === 'planned') {
    return { done: false, icon: 'i-lucide-circle', tone: 'text-dimmed', short: t('strands.quest.check.openShort'), text: t('strands.quest.check.open', { scene: title }) }
  }
  return { done: true, icon: 'i-lucide-circle-check-big', tone: 'text-success', short: t('strands.quest.check.doneShort'), text: t('strands.quest.check.done', { scene: title, status: label('sceneStatus', scene.status) }) }
}

const required = computed(() => objectives.value.filter(o => !o.optional))
const doneCount = computed(() => required.value.filter(o => check(o).done).length)
const optionalCount = computed(() => objectives.value.length - required.value.length)

/** The two ordered lists of a quest, edited the same way. */
type Lines = 'objectives' | 'rewards'
type Line = QuestObjective & QuestReward
const FIELD = { objectives: 'objective', rewards: 'reward' } as const
const linesOf = (key: Lines, from: QuestDetails = quest.value): Line[] => (from[key] ?? []) as Line[]

/**
 * The text of the line being written. The server trims what it saves ("con la " comes back as
 * "con la"): shown while the author types, that would eat the space. The field keeps its own text
 * until it loses the focus, then shows the saved one.
 */
const drafts = reactive(new Map<string, string>())
const textOf = (line: Line) => drafts.get(line.id) ?? line.text

function onLineInput(key: Lines, line: Line, event: Event) {
  const text = (event.target as HTMLTextAreaElement).value
  drafts.set(line.id, text)
  patchLine(key, line.id, { text })
}

function patchLine(key: Lines, id: string, patch: Partial<Line>, delay?: number) {
  save({ ...quest.value, [key]: linesOf(key).map(l => (l.id === id ? { ...l, ...patch } : l)) }, delay)
}

function addLine(key: Lines, after?: string) {
  const line = { id: shortId(), text: '' }
  const list = [...linesOf(key)]
  list.splice(after ? list.findIndex(l => l.id === after) + 1 : list.length, 0, line)
  save({ ...quest.value, [key]: list }, 300)
  void focusLine(FIELD[key], line.id)
}

/** Removes a line (with undo when it held something); answers the line the caret should go to. */
function removeLine(key: Lines, id: string, options: { undo?: boolean } = {}) {
  const list = linesOf(key)
  const index = list.findIndex(l => l.id === id)
  const removed = list[index]
  if (!removed) return null
  const previous = list[index - 1]?.id ?? null
  const strandId = props.strand.id
  drafts.delete(id)
  save({ ...quest.value, [key]: list.filter(l => l.id !== id) }, 300)
  if (options.undo !== false && (removed.text.trim() || removed.sceneId || removed.objectId)) {
    toast.add({
      title: t(key === 'objectives' ? 'strands.quest.objectiveRemoved' : 'strands.quest.rewardRemoved'),
      icon: 'i-lucide-trash-2',
      actions: [{ label: t('common.actions.undo'), onClick: () => putBack(strandId, key, removed, previous, index) }],
    })
  }
  return previous ?? list[index + 1]?.id ?? null
}

/**
 * Undo of a removal: only that line comes back, after the line that preceded it (or where it was),
 * into the quest as it is now, so what was written since stays.
 */
function putBack(strandId: string, key: Lines, line: Line, previous: string | null, index: number) {
  const current = store.get('strands', strandId)?.quest ?? {}
  const list = [...linesOf(key, current)]
  if (list.some(l => l.id === line.id)) return
  const after = previous ? list.findIndex(l => l.id === previous) : -1
  list.splice(after >= 0 ? after + 1 : (previous ? Math.min(index, list.length) : 0), 0, line)
  save({ ...current, [key]: list }, 300, strandId)
}

function reorderLines(key: Lines, ids: string[]) {
  const byId = new Map(linesOf(key).map(l => [l.id, l]))
  save({ ...quest.value, [key]: ids.flatMap(id => byId.get(id) ?? []) }, 300)
}

function onLineKeydown(event: KeyboardEvent, key: Lines, line: Line, move: (delta: number) => void) {
  const field = event.target as HTMLTextAreaElement
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    addLine(key, line.id)
  }
  else if (event.key === 'Backspace' && !field.value && !line.sceneId && !line.objectId && linesOf(key).length > 1) {
    event.preventDefault()
    const next = removeLine(key, line.id, { undo: false })
    if (next) void focusLine(FIELD[key], next)
  }
  else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    move(event.key === 'ArrowUp' ? -1 : 1)
  }
}

function lineMenu(key: Lines, line: Line, first: boolean, last: boolean, move: (delta: number) => void) {
  return [
    [
      { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', disabled: first, kbds: ['alt', 'arrowup'], onSelect: () => move(-1) },
      { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', disabled: last, kbds: ['alt', 'arrowdown'], onSelect: () => move(1) },
    ],
    [{ label: t('common.actions.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { removeLine(key, line.id) } }],
  ]
}

const lineField = 'voice-author field-sizing-content block min-h-8 w-full resize-none rounded-md bg-transparent px-1 py-1 text-base leading-snug text-default outline-none placeholder:text-dimmed focus-visible:bg-elevated focus-visible:ring-2 focus-visible:ring-(--ui-primary)/40'
</script>

<template>
  <div class="space-y-10">
    <section aria-labelledby="quest-giver">
      <h2 id="quest-giver" class="mb-2 text-lg font-semibold text-highlighted">{{ t('strands.quest.giver') }}</h2>
      <div class="max-w-sm">
        <DEntityPicker
          type="character"
          :model-value="shown('characters', quest.giverId)"
          creatable
          :placeholder="inTrash('characters', quest.giverId) ? t('strands.quest.giverInTrash') : t('strands.quest.giverPlaceholder')"
          :aria-label="t('strands.quest.giver')"
          class="max-lg:min-h-11"
          @update:model-value="(id) => save({ ...quest, giverId: (id as string | null) ?? null }, 300)"
        />
      </div>
    </section>

    <section aria-labelledby="quest-objectives">
      <div class="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 id="quest-objectives" class="text-lg font-semibold text-highlighted">{{ t('strands.quest.objectives') }}</h2>
        <span v-if="required.length" class="text-sm text-muted">
          {{ t('strands.quest.progress', { done: doneCount, total: required.length }, required.length) }}<template v-if="optionalCount">, {{ t('strands.quest.optionalCount', { n: optionalCount }, optionalCount) }}</template>
        </span>
      </div>

      <ArchitectureSortableList
        v-if="objectives.length"
        :items="objectives"
        :item-label="(o: QuestObjective) => o.text || t('strands.quest.objectiveUntitled')"
        :label="t('strands.quest.objectives')"
        handle=".objective-handle"
        class="-mx-2"
        @reorder="(ids) => reorderLines('objectives', ids)"
      >
        <template #default="{ item, index, first, last, move }">
          <div class="flex items-start gap-1 rounded-[calc(var(--ui-radius)*2)] py-1.5 pe-1 transition-colors duration-150 focus-within:bg-elevated/60 hover:bg-elevated/60">
            <span class="objective-handle flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-dimmed" :title="t('architecture.sortable.handle')" aria-hidden="true">
              <UIcon name="i-lucide-grip-vertical" class="size-4" />
            </span>
            <UTooltip :text="check(item).text">
              <span class="flex h-8 w-6 shrink-0 items-center justify-center" :class="check(item).tone" aria-hidden="true">
                <UIcon :name="check(item).icon" class="size-4.5" />
              </span>
            </UTooltip>
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <textarea
                :data-objective-text="item.id"
                :value="textOf(item)"
                rows="1"
                maxlength="500"
                :placeholder="t('strands.quest.objectivePlaceholder')"
                :aria-label="t('strands.quest.objectiveLabel', { n: index + 1 })"
                :aria-describedby="`objective-check-${item.id}`"
                :class="lineField"
                @input="onLineInput('objectives', item, $event)"
                @blur="drafts.delete(item.id)"
                @keydown="onLineKeydown($event, 'objectives', item, move)"
              />
              <div class="flex flex-wrap items-center gap-x-4 px-1">
                <!-- On a phone the label goes above, so the scene's title has the whole line. -->
                <div class="flex min-w-0 max-w-full grow flex-wrap items-center gap-x-2 sm:grow-0 sm:flex-nowrap">
                  <span class="shrink-0 text-xs text-muted max-sm:w-full max-sm:pt-1">{{ t('strands.quest.completedIn') }}</span>
                  <div class="min-w-0 flex-1 sm:w-56 sm:flex-none">
                    <DEntityPicker
                      type="scene"
                      size="sm"
                      variant="ghost"
                      :model-value="shown('scenes', item.sceneId)"
                      :placeholder="t('strands.quest.scenePlaceholder')"
                      :aria-label="t('strands.quest.completedIn')"
                      class="max-lg:min-h-11"
                      @update:model-value="(id) => patchLine('objectives', item.id, { sceneId: (id as string | null) ?? null }, 300)"
                    />
                  </div>
                  <UTooltip v-if="shown('scenes', item.sceneId)" :text="t('strands.quest.openScene')">
                    <UButton
                      :to="store.refPath({ type: 'scene', id: item.sceneId! })"
                      icon="i-lucide-arrow-up-right"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      class="shrink-0 text-muted max-lg:size-11 max-lg:justify-center"
                      :aria-label="t('strands.quest.openScene')"
                    />
                  </UTooltip>
                </div>
                <div class="flex min-h-8 items-center gap-4 max-lg:min-h-11">
                  <span :id="`objective-check-${item.id}`" class="text-xs font-medium" :class="check(item).done ? 'text-success' : 'text-muted'">
                    {{ check(item).short }}<span class="sr-only">. {{ check(item).text }}</span>
                  </span>
                  <UCheckbox
                    :model-value="!!item.optional"
                    :label="t('strands.quest.optional')"
                    size="sm"
                    :ui="{ root: 'items-center', label: 'font-normal text-muted max-lg:flex max-lg:min-h-11 max-lg:items-center max-lg:pe-2' }"
                    @update:model-value="(value) => patchLine('objectives', item.id, { optional: value === true || undefined }, 300)"
                  />
                </div>
              </div>
            </div>
            <UDropdownMenu :items="lineMenu('objectives', item, first, last, move)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" class="text-muted max-lg:size-11 max-lg:justify-center" :aria-label="t('strands.quest.objectiveActions', { n: index + 1 })" />
            </UDropdownMenu>
          </div>
        </template>
      </ArchitectureSortableList>
      <p v-else class="py-2 text-sm text-muted">{{ t('strands.quest.noObjectives') }}</p>
      <UButton color="neutral" variant="ghost" icon="i-lucide-plus" :label="t('strands.quest.addObjective')" class="-ms-2.5 mt-1 max-lg:min-h-11" @click="addLine('objectives')" />
    </section>

    <section aria-labelledby="quest-rewards">
      <h2 id="quest-rewards" class="mb-2 text-lg font-semibold text-highlighted">{{ t('strands.quest.rewards') }}</h2>
      <ArchitectureSortableList
        v-if="rewards.length"
        :items="rewards"
        :item-label="(r: QuestReward) => r.text || t('strands.quest.rewardUntitled')"
        :label="t('strands.quest.rewards')"
        handle=".reward-handle"
        class="-mx-2"
        @reorder="(ids) => reorderLines('rewards', ids)"
      >
        <template #default="{ item, index, first, last, move }">
          <div class="flex items-start gap-1 rounded-[calc(var(--ui-radius)*2)] py-1.5 pe-1 transition-colors duration-150 focus-within:bg-elevated/60 hover:bg-elevated/60">
            <span class="reward-handle flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-dimmed" :title="t('architecture.sortable.handle')" aria-hidden="true">
              <UIcon name="i-lucide-grip-vertical" class="size-4" />
            </span>
            <div class="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
              <textarea
                :data-reward-text="item.id"
                :value="textOf(item)"
                rows="1"
                maxlength="500"
                :placeholder="t('strands.quest.rewardPlaceholder')"
                :aria-label="t('strands.quest.rewardLabel', { n: index + 1 })"
                :class="[lineField, 'min-w-0 flex-1']"
                @input="onLineInput('rewards', item, $event)"
                @blur="drafts.delete(item.id)"
                @keydown="onLineKeydown($event, 'rewards', item, move)"
              />
              <div class="w-full px-1 sm:w-56 sm:px-0">
                <DEntityPicker
                  type="object"
                  size="sm"
                  variant="ghost"
                  creatable
                  :model-value="shown('objects', item.objectId)"
                  :placeholder="inTrash('objects', item.objectId) ? t('strands.quest.objectInTrash') : t('strands.quest.rewardObjectPlaceholder')"
                  :aria-label="t('strands.quest.rewardObject')"
                  class="max-lg:min-h-11"
                  @update:model-value="(id) => patchLine('rewards', item.id, { objectId: (id as string | null) ?? null }, 300)"
                />
              </div>
            </div>
            <UDropdownMenu :items="lineMenu('rewards', item, first, last, move)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" class="text-muted max-lg:size-11 max-lg:justify-center" :aria-label="t('strands.quest.rewardActions', { n: index + 1 })" />
            </UDropdownMenu>
          </div>
        </template>
      </ArchitectureSortableList>
      <p v-else class="py-2 text-sm text-muted">{{ t('strands.quest.noRewards') }}</p>
      <UButton color="neutral" variant="ghost" icon="i-lucide-plus" :label="t('strands.quest.addReward')" class="-ms-2.5 mt-1 max-lg:min-h-11" @click="addLine('rewards')" />
    </section>
  </div>
</template>
