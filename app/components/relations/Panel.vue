<script setup lang="ts">
import type { RelationKind, WorldRefType } from '#shared/types/domain'
import { RELATION_KINDS } from '#shared/utils/constants'

/**
 * CONTRACT (owned by the relations feature): the relationships of one entity, embedded in the
 * character, group, location and object sheets as <RelationsPanel>. Each row reads from this side,
 * "Tobia Marin, padre"; add (kinds filtered by pair), edit, trash, "Mostra nella mappa".
 * Memberships are left out by default: the sheets list groups and members on their own (spec 0.3).
 * No heading of its own: the sheet gives the section its title. The editor lives in the query string
 * (?relation=&a=&b=), so the back button closes it and leaves the sheet where it was.
 */
const props = withDefaults(defineProps<{
  entityType: WorldRefType
  entityId: string
  /** Kinds this panel neither lists nor offers. */
  excludeKinds?: RelationKind[]
}>(), { excludeKinds: () => ['membership'] })

const store = useProjectStore()
const { t, locale } = useI18n()

const key = computed(() => `${props.entityType}:${props.entityId}`)
const KIND_ORDER = Object.fromEntries(RELATION_KINDS.map((k, i) => [k, i]))

const relations = computed(() => {
  const me = key.value
  const otherName = (r: (typeof store.rows.relations)[number]) =>
    `${r.sourceType}:${r.sourceId}` === me ? store.refLabel({ type: r.targetType, id: r.targetId }) : store.refLabel({ type: r.sourceType, id: r.sourceId })
  // A relationship whose other side is in the trash stays hidden until it comes back.
  return store.rows.relations
    .filter(r => !props.excludeKinds.includes(r.kind) && (`${r.sourceType}:${r.sourceId}` === me || `${r.targetType}:${r.targetId}` === me))
    .filter(r => !!store.getRef({ type: r.sourceType, id: r.sourceId }) && !!store.getRef({ type: r.targetType, id: r.targetId }))
    .sort((a, b) => (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99) || otherName(a).localeCompare(otherName(b), locale.value))
})

const empty = computed(() => (store.isGame && props.entityType !== 'character' && props.entityType !== 'location'
  ? t(`relations.panel.empty.${props.entityType}Game`)
  : t(`relations.panel.empty.${props.entityType}`)))

const editor = ref<{ show: (state: { relationId?: string | null, a?: string | null }) => void } | null>(null)
const root = ref<HTMLElement | null>(null)

/** After a row went to the trash the focus goes to the next row, or to "Aggiungi una relazione". */
function onTrashed(index: number) {
  nextTick(() => {
    const rows = root.value?.querySelectorAll<HTMLElement>('[data-row-open]') ?? []
    ;(rows[Math.min(index, rows.length - 1)] ?? root.value?.querySelector<HTMLElement>('[data-panel-add]'))?.focus()
  })
}
const add = () => editor.value?.show({ a: key.value })
const edit = (id: string) => editor.value?.show({ relationId: id })
</script>

<template>
  <div ref="root" class="relations-panel">
    <ul v-if="relations.length" class="-mx-2" role="list">
      <RelationsPerspectiveRow
        v-for="(relation, index) in relations"
        :key="relation.id"
        :relation="relation"
        :viewer="key"
        @open="edit(relation.id)"
        @trashed="onTrashed(index)"
      />
    </ul>
    <p v-else class="text-sm text-muted">{{ empty }}</p>
    <div class="-ms-2.5 mt-2 flex flex-wrap items-center gap-1">
      <UButton data-panel-add icon="i-lucide-plus" color="neutral" variant="ghost" class="max-lg:min-h-11" :label="t('relations.panel.add')" @click="add" />
      <RelationsShowInMap :entity="key" />
    </div>
    <RelationsEditor ref="editor" :exclude-kinds="excludeKinds" routed />
  </div>
</template>
