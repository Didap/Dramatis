<script setup lang="ts">
import type { Scene } from '#shared/types/entities'
import type { ChapterColumn, ColumnGroup, MatrixRow } from './analysis-model'

/**
 * A matrix of rows by chapter (DESIGN.md "Charts"): each cell is the number of scenes, empty when
 * none, row totals at the end, the scenes of each chapter at the foot. Characters and strands tint
 * their cells with their own colour, stronger where they are more present. A cell opens its scenes.
 * When the table is wider than the screen it scrolls sideways between the names and the totals,
 * which both stay in sight; the legend under it gives every part and chapter its full title.
 */
const props = withDefaults(defineProps<{
  rows: MatrixRow[]
  columns: ChapterColumn[]
  groups?: ColumnGroup[] | null
  /** Header of the first column ("Personaggio"). */
  rowHeader: string
  caption: string
  /** Scenes per chapter, for the foot of the table. */
  chapterScenes?: Map<string, number>
  legend?: boolean
  /** What a column is ("Capitolo" by default; "Atto" for acts). */
  columnTerm?: string
  footerLabel?: string
}>(), { groups: null, chapterScenes: undefined, legend: true, columnTerm: undefined, footerLabel: undefined })

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { number, words } = useFormat()

const max = computed(() => Math.max(1, ...props.rows.flatMap(row => [...row.cells.values()].map(list => list.length))))

/** Three steps of presence: a hint, a mark, the full tint. */
function cellStyle(row: MatrixRow, count: number) {
  const ratio = count / max.value
  const strength = ratio > 2 / 3 ? 100 : ratio > 1 / 3 ? 70 : 42
  if (!row.color) return { background: `color-mix(in oklab, var(--ui-bg-accented) ${strength}%, transparent)`, color: 'var(--ui-text-highlighted)' }
  return { background: `color-mix(in oklab, var(--entity-${row.color}-tint) ${strength}%, transparent)`, color: `var(--entity-${row.color}-ink)` }
}

const chapterLabel = (column: ChapterColumn) => t('analysis.matrix.column', {
  term: props.columnTerm ?? term('chapter'),
  n: column.number,
  title: column.title || t('common.untitled.chapter'),
})

const sections = computed(() => {
  const list: { key: string, title?: string, rows: MatrixRow[] }[] = []
  for (const row of props.rows) {
    const last = list.at(-1)
    if (last && last.title === row.section) last.rows.push(row)
    else list.push({ key: `${row.section ?? ''}:${row.id}`, title: row.section, rows: [row] })
  }
  return list
})

/** The legend: the columns under their parts, with the full titles the headers have no room for. */
const legendBlocks = computed(() => {
  if (!props.groups) return [{ id: '', title: '', columns: props.columns }]
  let at = 0
  return props.groups.map((group) => {
    const columns = props.columns.slice(at, at + group.span)
    at += group.span
    return { id: group.id, title: group.title, columns }
  })
})

// One popover for every cell, anchored to the one that was clicked.
const selected = ref<{ row: MatrixRow, column: ChapterColumn, scenes: Scene[], el: HTMLElement } | null>(null)
const open = computed({
  get: () => !!selected.value,
  set: (value) => { if (!value) selected.value = null },
})

function select(row: MatrixRow, column: ChapterColumn, scenes: Scene[], event: MouseEvent) {
  const el = event.currentTarget as HTMLElement
  if (selected.value?.el === el) {
    selected.value = null
    return
  }
  selected.value = { row, column, scenes, el }
}

const popoverId = useId()
const lastCell = ref<HTMLElement | null>(null)

watch(selected, (value) => { if (value) lastCell.value = value.el })

// The list is portaled to the end of the page: take the keyboard there, and back to the cell on close.
function onOpenAutoFocus(event: Event) {
  const first = document.getElementById(popoverId)?.querySelector<HTMLElement>('a')
  if (!first) return
  event.preventDefault()
  first.focus()
}

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  lastCell.value?.focus()
}

/**
 * The popover is a dialog with no trigger of its own (it is anchored to the cell): it is named after
 * what it lists. Reka's own aria-labelledby points to the missing trigger, so aria-label names it.
 */
const popoverContent = computed(() => ({
  side: 'bottom' as const,
  align: 'center' as const,
  sideOffset: 6,
  onOpenAutoFocus,
  onCloseAutoFocus,
  'aria-label': selected.value ? `${selected.value.row.label}, ${chapterLabel(selected.value.column)}` : undefined,
}))
</script>

<template>
  <div class="d-matrix min-w-0">
    <!-- Within the gutters: the sticky names and totals keep to the edges of what scrolls. -->
    <div class="overflow-x-auto pb-2">
      <table class="tabular border-separate border-spacing-0 text-sm">
        <caption class="sr-only">{{ caption }}</caption>
        <thead>
          <tr v-if="groups">
            <td class="sticky start-0 z-10 bg-default" />
            <th
              v-for="group in groups"
              :key="group.id"
              scope="colgroup"
              :colspan="group.span"
              class="border-b border-default px-1 pb-1.5 text-start align-bottom text-xs font-medium text-muted"
            >
              <!-- w-0 min-w-full: a long part title never widens its columns (the legend has it whole). -->
              <span class="block w-0 min-w-full truncate" :title="group.title">{{ group.title }}</span>
            </th>
            <td class="sticky end-0 z-10 bg-default" />
          </tr>
          <tr>
            <th scope="col" class="sticky start-0 z-10 w-36 min-w-36 bg-default py-2 pe-3 text-start align-bottom text-xs font-medium text-muted sm:w-52 sm:min-w-52">{{ rowHeader }}</th>
            <th
              v-for="column in columns"
              :key="column.id"
              scope="col"
              class="w-10 min-w-10 px-0.5 py-2 text-center align-bottom text-xs font-medium text-muted max-lg:w-12 max-lg:min-w-12"
            >
              <UTooltip :text="chapterLabel(column)">
                <span class="inline-block min-w-6"><span aria-hidden="true">{{ column.number }}</span><span class="sr-only">{{ chapterLabel(column) }}</span></span>
              </UTooltip>
            </th>
            <th scope="col" class="sticky end-0 z-10 bg-default py-2 ps-3 text-end align-bottom text-xs font-medium text-muted">{{ t('analysis.matrix.total') }}</th>
          </tr>
        </thead>

        <tbody v-for="section in sections" :key="section.key">
          <tr v-if="section.title">
            <th :colspan="columns.length + 2" scope="colgroup" class="pt-4 pb-1 text-start text-xs font-semibold text-toned">
              <span class="sticky start-0">{{ section.title }}</span>
            </th>
          </tr>
          <tr v-for="row in section.rows" :key="row.id" class="group/row">
            <th scope="row" class="sticky start-0 z-10 max-w-36 bg-default py-0.5 pe-3 text-start font-normal group-hover/row:bg-elevated sm:max-w-52">
              <span class="flex min-h-9 items-center gap-2 max-lg:min-h-11">
                <DColorDot v-if="row.color !== undefined" :color="row.color" size="sm" />
                <UIcon v-else-if="row.icon" :name="row.icon" class="size-4 shrink-0" :style="row.iconColor ? { color: row.iconColor } : undefined" />
                <NuxtLink
                  v-if="row.to"
                  :to="row.to"
                  class="truncate text-sm font-medium text-highlighted decoration-(--ui-border-accented) underline-offset-3 hover:underline max-lg:py-3"
                  :title="row.label"
                >{{ row.label }}</NuxtLink>
                <span v-else class="truncate text-sm font-medium text-highlighted" :title="row.label">{{ row.label }}</span>
              </span>
            </th>
            <td v-for="column in columns" :key="column.id" class="p-0.5 text-center group-hover/row:bg-elevated/60">
              <template v-if="row.cells.get(column.id)?.length">
                <button
                  type="button"
                  class="grid size-9 place-items-center rounded-[calc(var(--ui-radius)*1.5)] text-sm font-medium transition-shadow duration-150 hover:ring-1 hover:ring-(--ui-border-accented) max-lg:size-11"
                  :style="cellStyle(row, row.cells.get(column.id)!.length)"
                  :aria-label="t('analysis.matrix.cell', { row: row.label, chapter: chapterLabel(column), n: row.cells.get(column.id)!.length }, row.cells.get(column.id)!.length)"
                  aria-haspopup="dialog"
                  :aria-expanded="selected?.row.id === row.id && selected?.column.id === column.id"
                  @click="select(row, column, row.cells.get(column.id)!, $event)"
                >
                  {{ number(row.cells.get(column.id)!.length) }}
                </button>
              </template>
            </td>
            <td class="sticky end-0 z-10 bg-default ps-3 text-end font-medium group-hover/row:bg-elevated" :class="row.total ? 'text-highlighted' : 'text-dimmed'">{{ number(row.total) }}</td>
          </tr>
        </tbody>

        <tfoot v-if="chapterScenes">
          <tr>
            <th scope="row" class="sticky start-0 z-10 bg-default pt-3 pe-3 text-start text-xs font-medium text-muted">{{ footerLabel ?? t('analysis.matrix.chapterScenes') }}</th>
            <td v-for="column in columns" :key="column.id" class="border-t border-default pt-3 text-center text-xs text-muted">{{ chapterScenes.get(column.id) ? number(chapterScenes.get(column.id)!) : '' }}</td>
            <td class="sticky end-0 z-10 border-t border-default bg-default ps-3 pt-3 text-end text-xs text-muted">{{ number([...chapterScenes.values()].reduce((n, v) => n + v, 0)) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <ol
      v-if="legend && columns.length"
      class="mt-4 space-y-1 text-xs text-muted"
      :aria-label="groups ? t('analysis.matrix.legendParts', { parts: term('part', 2), chapters: term('chapter', 2).toLocaleLowerCase() }) : (columnTerm ?? t('analysis.matrix.legend'))"
    >
      <li v-for="block in legendBlocks" :key="block.id" class="flex flex-wrap gap-x-4 gap-y-1">
        <span v-if="block.title" class="voice-author font-semibold! text-toned">{{ block.title }}</span>
        <span v-for="column in block.columns" :key="column.id" class="inline-flex gap-1.5">
          <span class="tabular font-medium text-toned">{{ column.number }}</span>
          <span class="voice-author">{{ column.title || t('common.untitled.chapter') }}</span>
        </span>
      </li>
    </ol>

    <UPopover
      v-model:open="open"
      :reference="selected?.el"
      :content="popoverContent"
    >
      <template #content>
        <div v-if="selected" :id="popoverId" class="w-72 max-w-[calc(100vw-2rem)] p-3">
          <p class="text-sm font-medium text-highlighted">{{ selected.row.label }}</p>
          <p class="text-xs text-muted">{{ chapterLabel(selected.column) }}</p>
          <ul class="mt-2 -mx-1.5">
            <li v-for="scene in selected.scenes" :key="scene.id">
              <NuxtLink
                :to="store.refPath({ type: 'scene', id: scene.id })"
                class="block min-h-11 rounded-[calc(var(--ui-radius)*1.5)] px-1.5 py-1.5 hover:bg-elevated focus-visible:bg-elevated"
              >
                <span class="voice-author block truncate text-sm font-semibold! text-highlighted">{{ scene.title || t('common.untitled.scene') }}</span>
                <span class="mt-0.5 flex items-center gap-3 text-xs text-muted">
                  <DStatusBadge :value="scene.status" class="text-xs!" />
                  <span>{{ words(scene.wordCount) }}</span>
                </span>
              </NuxtLink>
            </li>
          </ul>
        </div>
      </template>
    </UPopover>
  </div>
</template>
