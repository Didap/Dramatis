<script setup lang="ts">
import type { RelationKind } from '#shared/types/domain'
import type { Relation } from '#shared/types/entities'
import { RELATION_KINDS } from '#shared/utils/constants'

/**
 * The Elenco (spec 4.4): every relationship as a row, grouped by kind, filterable by entity and kind.
 * It is the full keyboard and screen-reader alternative to the maps: everything a map edits about
 * relationships can be done here.
 */
const entity = defineModel<string | null>('entity', { default: null })
const kinds = defineModel<RelationKind[]>('kinds', { default: () => [] })
const emit = defineEmits<{ open: [id: string], create: [] }>()

const store = useProjectStore()
const { t, locale } = useI18n()
const { label } = useEnums()
const { number } = useFormat()

const guidance = computed(() => store.project?.settings.guidance !== false)
const nameOf = (r: Relation, side: 'source' | 'target') =>
  side === 'source' ? store.refLabel({ type: r.sourceType, id: r.sourceId }) : store.refLabel({ type: r.targetType, id: r.targetId })

/** A relationship whose side went to the trash is hidden until that side comes back (spec 7.0). */
const all = computed(() => store.rows.relations.filter(r =>
  !!store.getRef({ type: r.sourceType, id: r.sourceId }) && !!store.getRef({ type: r.targetType, id: r.targetId })))
const filtered = computed(() => all.value.filter((r) => {
  if (kinds.value.length && !kinds.value.includes(r.kind)) return false
  if (entity.value && `${r.sourceType}:${r.sourceId}` !== entity.value && `${r.targetType}:${r.targetId}` !== entity.value) return false
  return true
}))

const groups = computed(() => RELATION_KINDS
  .map(kind => ({
    kind,
    rows: filtered.value
      .filter(r => r.kind === kind)
      .sort((a, b) => nameOf(a, 'source').localeCompare(nameOf(b, 'source'), locale.value) || nameOf(a, 'target').localeCompare(nameOf(b, 'target'), locale.value)),
  }))
  .filter(g => g.rows.length))

const kindItems = computed(() => RELATION_KINDS
  .filter(kind => all.value.some(r => r.kind === kind))
  .map(kind => ({ value: kind, label: label('relationKind', kind) })))

const filtering = computed(() => !!entity.value || kinds.value.length > 0)

function clear() {
  entity.value = null
  kinds.value = []
}

const root = ref<HTMLElement | null>(null)

/** The row's menu closes on a row that is gone: the focus goes to the next row (or the previous one). */
function onTrashed(id: string) {
  const rows = [...(root.value?.querySelectorAll<HTMLElement>('[data-row-open]') ?? [])]
  const index = rows.findIndex(el => el.closest('[data-relation]')?.getAttribute('data-relation') === id)
  nextTick(() => {
    const left = root.value?.querySelectorAll<HTMLElement>('[data-row-open]') ?? []
    left[Math.max(0, Math.min(index, left.length - 1))]?.focus()
  })
}
</script>

<template>
  <div ref="root" class="relations-list">
    <template v-if="all.length">
      <div class="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div class="sm:w-64">
          <RelationsEntitySelect v-model="entity" :placeholder="t('relations.list.entityAll')" :aria-label="t('relations.list.entityFilter')" />
        </div>
        <USelectMenu
          v-model="kinds"
          :items="kindItems"
          value-key="value"
          multiple
          :search-input="false"
          :placeholder="t('relations.list.kindAll')"
          :aria-label="t('relations.list.kindFilter')"
          class="w-full sm:w-56"
          :ui="{ base: 'max-lg:min-h-11' }"
        >
          <template #item-leading="{ item }">
            <RelationsKindLine :kind="(item as { value: RelationKind }).value" :width="16" />
          </template>
        </USelectMenu>
        <UButton v-if="filtering" color="neutral" variant="ghost" icon="i-lucide-x" :label="t('relations.list.clear')" class="self-start max-lg:min-h-11 sm:self-auto" @click="clear" />
        <p class="tabular text-sm text-muted sm:ms-auto" aria-live="polite">{{ t('relations.list.count', { n: number(filtered.length) }, filtered.length) }}</p>
      </div>

      <div v-if="groups.length" class="space-y-6">
        <section v-for="group in groups" :key="group.kind" :aria-labelledby="`relations-kind-${group.kind}`">
          <h2 :id="`relations-kind-${group.kind}`" class="mb-1 flex items-center gap-2 px-2 text-sm font-medium text-toned">
            <RelationsKindLine :kind="group.kind" :width="18" />
            <span class="flex min-w-0 flex-1 items-baseline gap-2">
              <span>{{ label('relationKind', group.kind) }}</span>
              <DLeader />
              <span class="tabular font-normal text-muted">{{ number(group.rows.length) }}</span>
            </span>
          </h2>
          <ul class="-mx-0" role="list">
            <RelationsListRow
              v-for="relation in group.rows"
              :key="relation.id"
              :data-relation="relation.id"
              :relation="relation"
              @open="emit('open', relation.id)"
              @trashed="onTrashed(relation.id)"
            />
          </ul>
        </section>
      </div>
      <div v-else class="py-10 text-center">
        <p class="text-sm text-muted">{{ t('relations.list.noMatch') }}</p>
        <UButton class="mt-3 max-lg:min-h-11" color="neutral" variant="outline" :label="t('relations.list.clear')" @click="clear" />
      </div>
    </template>

    <div v-else class="relations-empty">
      <div class="mb-2 space-y-1 opacity-60" aria-hidden="true">
        <div v-for="i in 2" :key="i" class="flex h-11 items-center gap-3 px-2">
          <span class="h-8 w-6 rounded-[1.5px] bg-elevated" />
          <span class="h-3 rounded-sm bg-elevated" :class="i === 1 ? 'w-28' : 'w-20'" />
          <span class="leader h-3 self-center" />
          <span class="h-3 w-16 rounded-sm bg-elevated" />
        </div>
      </div>
      <DEmptyState
        icon="i-lucide-network"
        :title="t(store.isGame ? 'relations.list.empty.titleGame' : 'relations.list.empty.title')"
        :description="guidance ? t('relations.list.empty.body') : undefined"
        :actions="[{ label: t('relations.list.empty.action'), icon: 'i-lucide-plus', color: 'primary', variant: 'solid', onClick: () => emit('create') }]"
      />
    </div>
  </div>
</template>
