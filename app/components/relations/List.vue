<script setup lang="ts">
import type { RelationKind, WorldRefType } from '#shared/types/domain'
import type { Character, Relation } from '#shared/types/entities'
import { CHARACTER_IMPORTANCES, RELATION_KINDS, WORLD_REF_TYPES } from '#shared/utils/constants'

/**
 * The Elenco (spec 4.4, VRS-564): everyone with a relationship, each with their bonds beside their
 * portrait, filterable by entity and kind. Characters first (main ones first), then groups, places and
 * objects. A relationship shows with both its sides. It is the full keyboard and screen-reader
 * alternative to the maps: everything a map edits about relationships can be done here.
 */
const entity = defineModel<string | null>('entity', { default: null })
const kinds = defineModel<RelationKind[]>('kinds', { default: () => [] })
const emit = defineEmits<{ open: [id: string], create: [] }>()

const store = useProjectStore()
const { t, locale } = useI18n()
const { label } = useEnums()
const { number } = useFormat()

const guidance = computed(() => store.project?.settings.guidance !== false)

/** A relationship whose side went to the trash is hidden until that side comes back (spec 7.0). */
const all = computed(() => store.rows.relations.filter(r =>
  !!store.getRef({ type: r.sourceType, id: r.sourceId }) && !!store.getRef({ type: r.targetType, id: r.targetId })))
const filtered = computed(() => all.value.filter((r) => {
  if (kinds.value.length && !kinds.value.includes(r.kind)) return false
  if (entity.value && `${r.sourceType}:${r.sourceId}` !== entity.value && `${r.targetType}:${r.targetId}` !== entity.value) return false
  return true
}))

/** Everyone with a relationship among the filtered ones (only the chosen one, when filtering by entity). */
const entries = computed(() => {
  const byKey = new Map<string, { key: string, ref: { type: WorldRefType, id: string }, relations: Relation[] }>()
  const add = (type: WorldRefType, id: string, r: Relation) => {
    const key = `${type}:${id}`
    if (entity.value && key !== entity.value) return
    const entry = byKey.get(key)
    if (entry) entry.relations.push(r)
    else byKey.set(key, { key, ref: { type, id }, relations: [r] })
  }
  for (const r of filtered.value) {
    add(r.sourceType, r.sourceId, r)
    add(r.targetType, r.targetId, r)
  }
  const importance = (e: { ref: { type: WorldRefType, id: string } }) => (e.ref.type === 'character'
    ? CHARACTER_IMPORTANCES.indexOf((store.get('characters', e.ref.id) as Character | undefined)?.importance ?? 'minor')
    : 0)
  return [...byKey.values()].sort((a, b) => WORLD_REF_TYPES.indexOf(a.ref.type) - WORLD_REF_TYPES.indexOf(b.ref.type)
    || importance(a) - importance(b)
    || store.refLabel(a.ref).localeCompare(store.refLabel(b.ref), locale.value))
})

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
function onTrashed(row: HTMLElement) {
  const rows = [...(root.value?.querySelectorAll<HTMLElement>('[data-row-open]') ?? [])]
  const index = rows.findIndex(el => row.contains(el))
  nextTick(() => {
    const left = root.value?.querySelectorAll<HTMLElement>('[data-row-open]') ?? []
    left[Math.max(0, Math.min(index, left.length - 1))]?.focus()
  })
}
</script>

<template>
  <div ref="root" class="relations-list @container">
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

      <div v-if="entries.length">
        <p v-if="guidance" class="mb-3 text-sm text-muted">{{ t('relations.bonds.pick') }}</p>
        <RelationsBonds
          v-for="entry in entries"
          :key="entry.key"
          :viewer="entry.ref"
          :relations="entry.relations"
          @open="(id: string) => emit('open', id)"
          @trashed="onTrashed"
        />
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
