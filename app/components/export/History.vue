<script setup lang="ts">
/**
 * The last exports of the project (spec 7.24): what, in which format, when, and whether every scene was
 * final and (in games) the flow clean at that moment: what the last stage of the path reads.
 */
export interface ExportRecord {
  id: string
  what: 'manuscript' | 'document' | 'json' | 'twee' | 'ink' | 'vo_csv' | 'backup'
  format: string
  allFinal: boolean
  flowClean: boolean
  createdAt: string
}

const props = defineProps<{ records: ExportRecord[] | null, loading?: boolean }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { relative, date, time } = useFormat()

function what(record: ExportRecord) {
  if (record.what === 'manuscript') return `${term('manuscript')}, ${record.format.toUpperCase()}`
  if (record.what === 'document') return `${term('projectDocument')}, ${record.format.toUpperCase()}`
  if (record.what === 'twee') return t(record.format === 'twee-sugarcube' ? 'export.history.what.tweeSugarcube' : 'export.history.what.twee')
  return t(`export.history.what.${record.what}`)
}
const showFlow = computed(() => store.modules.branching)
/** The exports the last stage of a game's path counts (spec 3.3): the team formats and the design document. */
const FLOW_WHATS: ExportRecord['what'][] = ['json', 'twee', 'ink', 'vo_csv', 'document']

/** What the path reads from a record, as icon and label. */
function statuses(record: ExportRecord) {
  return [
    ...(record.allFinal ? [{ key: 'final', icon: 'i-lucide-stamp', tone: 'text-(--status-final)', label: t('export.history.allFinal') }] : []),
    ...(showFlow.value && record.flowClean && FLOW_WHATS.includes(record.what) ? [{ key: 'flow', icon: 'i-lucide-route', tone: 'text-success', label: t('export.history.flowClean') }] : []),
  ]
}
const list = computed(() => props.records ?? [])
</script>

<template>
  <section class="export-history" aria-labelledby="export-history-title">
    <h2 id="export-history-title" class="text-lg font-semibold text-highlighted">{{ t('export.history.title') }}</h2>
    <div v-if="loading && !records" class="mt-3 space-y-2" aria-busy="true">
      <USkeleton v-for="i in 2" :key="i" class="h-11 w-full" />
    </div>
    <p v-else-if="!list.length" class="mt-2 max-w-prose text-sm text-muted">{{ t('export.history.empty') }}</p>
    <ul v-else class="mt-2" role="list">
      <li v-for="record in list" :key="record.id">
        <DRow :name="what(record)" ui-name>
          <!-- Beside the name on wide screens (the dates stay in one column); under it, with the date, on phones. -->
          <template #name>
            {{ what(record) }}<span v-for="status in statuses(record)" :key="status.key" class="ms-2.5 hidden items-center gap-1 align-[-0.125em] text-xs font-normal text-toned sm:inline-flex">
              <UIcon :name="status.icon" class="size-3.5 shrink-0" :class="status.tone" />{{ status.label }}
            </span>
          </template>
          <template #numbers>
            <UTooltip :text="`${date(record.createdAt)}, ${time(record.createdAt)}`">
              <time :datetime="record.createdAt">{{ relative(record.createdAt) }}</time>
            </UTooltip>
            <span v-for="status in statuses(record)" :key="status.key" class="inline-flex items-center gap-1 text-xs text-toned sm:hidden">
              <UIcon :name="status.icon" class="size-3.5 shrink-0" :class="status.tone" />{{ status.label }}
            </span>
          </template>
        </DRow>
      </li>
    </ul>
  </section>
</template>
