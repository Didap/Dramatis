<script lang="ts">
/** What is selected on a map: one node (an entity), one edge (a pair of entities), or nothing. */
export type MapSelection = { type: 'node', key: string } | { type: 'edge', a: string, b: string } | null
</script>

<script setup lang="ts">
import type { WorldRefType } from '#shared/types/domain'
import type { Relation } from '#shared/types/entities'
import { parseMentionId } from '#shared/utils/richtext'

/**
 * What is selected on a map, and what can be done with it (desktop inspector, phone drawer):
 * a node with "Collega a...", "Apri scheda", "Togli dalla mappa" and its relationships here; an edge
 * with its relationships, to edit or trash; nothing selected, the map in numbers and how to use it.
 */
const props = defineProps<{
  selection: MapSelection
  /** Keys of the entities on the map (visible ones). */
  keys: string[]
  /** Relationships among the map's entities. */
  relations: Relation[]
  /** Relationships of the map's entities with entities outside it. */
  outside: Relation[]
  /** Desktop: the map can be edited by dragging. */
  editable: boolean
}>()

const emit = defineEmits<{
  link: [key: string]
  remove: [key: string]
  open: [relationId: string]
  create: [a: string, b: string]
  addLinked: [key: string | null]
  /** The last relationship of the selected pair went to the trash: the focus goes back to the map. */
  focusNode: [key: string]
}>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const { number } = useFormat()
const guidance = computed(() => store.project?.settings.guidance !== false)
const root = ref<HTMLElement | null>(null)

const sideKey = (r: Relation, side: 'source' | 'target') => (side === 'source' ? `${r.sourceType}:${r.sourceId}` : `${r.targetType}:${r.targetId}`)
const touches = (r: Relation, key: string) => sideKey(r, 'source') === key || sideKey(r, 'target') === key

function entity(key: string) {
  const ref = parseMentionId(key)
  const row = store.getRef(ref) as { name?: string, tagline?: string } | undefined
  const type = ref?.type as WorldRefType
  return { key, type, id: ref?.id ?? '', name: row?.name ?? '', tagline: row?.tagline ?? '', imageId: ref ? store.primaryImage(type, ref.id) : null }
}

const node = computed(() => (props.selection?.type === 'node' ? entity(props.selection.key) : null))
const nodeRelations = computed(() => (node.value ? props.relations.filter(r => touches(r, node.value!.key)) : []))
const nodeOutside = computed(() => (node.value ? props.outside.filter(r => touches(r, node.value!.key)) : []))

const edge = computed(() => (props.selection?.type === 'edge' ? { a: entity(props.selection.a), b: entity(props.selection.b) } : null))
const edgeRelations = computed(() => {
  const e = edge.value
  if (!e) return []
  return props.relations.filter(r => touches(r, e.a.key) && touches(r, e.b.key))
})

/**
 * "Tobia è padre di Elsa", from the relationship's labels: the label for the source, the reverse for
 * the target. One label for both sides is said once ("rivali, per entrambi").
 */
function sentences(r: Relation) {
  if (r.label && r.label === r.reverseLabel) return [{ both: true, subject: '', label: r.label, object: '' }]
  const source = store.refLabel({ type: r.sourceType, id: r.sourceId })
  const target = store.refLabel({ type: r.targetType, id: r.targetId })
  const out: { both?: boolean, subject: string, label: string, object: string }[] = []
  if (r.label) out.push({ subject: source, label: r.label, object: target })
  if (r.reverseLabel) out.push({ subject: target, label: r.reverseLabel, object: source })
  return out
}

const focusIn = (selector: string) => root.value?.querySelector<HTMLElement>(selector)?.focus()

/** After a row of the node went to the trash, the focus stays in the inspector. */
const onRowTrashed = () => nextTick(() => focusIn('#relations-selection-title'))

const confirming = ref<string | null>(null)
watch(() => props.selection, () => { confirming.value = null })

function askTrash(id: string) {
  confirming.value = id
  nextTick(() => focusIn('[data-confirm-trash]'))
}

function keep(id: string) {
  confirming.value = null
  nextTick(() => focusIn(`[data-relation-edit="${id}"]`))
}

/** The focus goes to the next relationship of the pair, or back to the map when it was the last one. */
async function trash(id: string) {
  const pair = edge.value
  confirming.value = null
  const removing = store.remove('relations', id).catch(() => {})
  await nextTick()
  if (pair) {
    if (edgeRelations.value.length) focusIn('[data-relation-edit]')
    else emit('focusNode', pair.a.key)
  }
  await removing
}
</script>

<template>
  <div ref="root" class="relations-selection">
    <!-- A node -->
    <template v-if="node">
      <div class="flex items-start gap-3">
        <DEntityAvatar
          :name="node.name"
          :image-id="node.imageId"
          :shape="node.type === 'character' ? 'portrait' : 'square'"
          :icon="node.type === 'character' ? undefined : REF_ICONS[node.type]"
          size="md"
        />
        <div class="min-w-0 flex-1">
          <h2 id="relations-selection-title" tabindex="-1" class="voice-author text-lg leading-snug font-semibold text-highlighted outline-none">{{ node.name }}</h2>
          <p class="text-xs text-muted">{{ term(node.type) }}<template v-if="node.tagline">, <span class="voice-author italic">{{ node.tagline }}</span></template></p>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <UButton color="neutral" variant="outline" icon="i-lucide-link" class="max-lg:min-h-11" :label="t('relations.actions.linkTo')" @click="emit('link', node.key)" />
        <UButton color="neutral" variant="ghost" :icon="REF_ICONS[node.type]" class="max-lg:min-h-11" :label="t('relations.actions.openSheetShort')" :to="store.refPath({ type: node.type, id: node.id })" />
        <UButton color="neutral" variant="ghost" icon="i-lucide-circle-minus" class="max-lg:min-h-11" :label="t('relations.actions.removeFromMap')" @click="emit('remove', node.key)" />
      </div>

      <h3 class="mt-6 mb-1 text-sm font-medium text-default">{{ t('relations.selection.here') }}</h3>
      <ul v-if="nodeRelations.length" class="-mx-2" role="list">
        <RelationsPerspectiveRow
          v-for="relation in nodeRelations"
          :key="relation.id"
          :relation="relation"
          :viewer="node.key"
          neutral
          confirm
          @open="emit('open', relation.id)"
          @trashed="onRowTrashed"
        />
      </ul>
      <p v-else class="text-sm text-muted">{{ t('relations.selection.noneHere') }}</p>

      <div v-if="nodeOutside.length" class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p class="text-sm text-muted">{{ t('relations.selection.outside', { n: number(nodeOutside.length) }, nodeOutside.length) }}</p>
        <UButton color="neutral" variant="link" size="sm" class="px-0 max-lg:min-h-11" icon="i-lucide-plus" :label="t('relations.actions.addLinked')" @click="emit('addLinked', node.key)" />
      </div>
    </template>

    <!-- An edge: every relationship of the pair, as rows -->
    <template v-else-if="edge">
      <i18n-t id="relations-selection-title" scope="global" keypath="relations.selection.pair" tag="h2" tabindex="-1" class="text-lg leading-snug font-normal text-muted outline-none">
        <template #a><span class="voice-author font-semibold text-highlighted">{{ edge.a.name }}</span></template>
        <template #b><span class="voice-author font-semibold text-highlighted">{{ edge.b.name }}</span></template>
      </i18n-t>
      <ul class="mt-2 divide-y divide-default/70" role="list">
        <li v-for="relation in edgeRelations" :key="relation.id" class="py-4">
          <h3 class="flex flex-wrap items-center gap-x-2 text-sm font-medium text-default">
            <RelationsKindLine :kind="relation.kind" :width="18" />
            {{ label('relationKind', relation.kind) }}
            <span class="font-normal text-muted">· {{ relation.directed ? t('relations.selection.directed', { from: store.refLabel({ type: relation.sourceType, id: relation.sourceId }) }) : t('relations.form.mutual').toLocaleLowerCase() }}</span>
          </h3>
          <p v-for="(s, i) in sentences(relation)" :key="i" class="mt-1 text-sm text-toned">
            <i18n-t v-if="s.both" scope="global" keypath="relations.selection.both" tag="span">
              <template #label><span class="voice-author italic text-highlighted">{{ s.label }}</span></template>
            </i18n-t>
            <i18n-t v-else scope="global" keypath="relations.selection.sentence" tag="span">
              <template #subject><span class="voice-author">{{ s.subject }}</span></template>
              <template #label><span class="voice-author italic text-highlighted">{{ s.label }}</span></template>
              <template #object><span class="voice-author">{{ s.object }}</span></template>
            </i18n-t>
          </p>
          <p v-if="relation.description" class="voice-author mt-1.5 line-clamp-3 text-sm text-muted">{{ relation.description }}</p>
          <div v-if="confirming === relation.id" class="mt-2 space-y-2" role="alert">
            <p class="flex items-start gap-2 text-sm text-default">
              <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
              {{ t('relations.form.deleteConfirm') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton data-confirm-trash color="error" variant="solid" size="sm" class="max-lg:min-h-11" :label="t('relations.form.deleteYes')" @click="trash(relation.id)" />
              <UButton color="neutral" variant="ghost" size="sm" class="max-lg:min-h-11" :label="t('common.actions.cancel')" @click="keep(relation.id)" />
            </div>
          </div>
          <div v-else class="-ms-2.5 mt-1.5 flex flex-wrap gap-1">
            <UButton :data-relation-edit="relation.id" color="neutral" variant="ghost" size="sm" icon="i-lucide-pencil" class="max-lg:min-h-11" :label="t('relations.actions.edit')" @click="emit('open', relation.id)" />
            <UButton color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" class="max-lg:min-h-11" :label="t('relations.form.delete')" @click="askTrash(relation.id)" />
          </div>
        </li>
      </ul>
      <UButton class="-ms-2.5 max-lg:min-h-11" color="neutral" variant="ghost" icon="i-lucide-plus" :label="t('relations.selection.another')" @click="emit('create', edge.a.key, edge.b.key)" />
    </template>

    <!-- Nothing selected -->
    <template v-else>
      <p class="tabular text-sm text-default first-letter:uppercase">
        {{ t('relations.maps.nodes', { n: number(keys.length) }, keys.length) }} · {{ t('relations.maps.relations', { n: number(relations.length) }, relations.length) }}
      </p>
      <template v-if="guidance">
        <p class="mt-2 text-sm text-muted">{{ editable ? t('relations.selection.help') : t('relations.selection.helpPhone') }}</p>
        <p class="mt-2 text-sm text-muted">{{ t('relations.selection.arrows') }}</p>
        <p v-if="editable" class="mt-2 text-sm text-muted">{{ t('relations.selection.keyboard') }}</p>
      </template>
      <div v-if="outside.length" class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p class="text-sm text-muted">{{ t('relations.selection.outsideAll', { n: number(outside.length) }, outside.length) }}</p>
        <UButton color="neutral" variant="link" size="sm" class="px-0 max-lg:min-h-11" icon="i-lucide-plus" :label="t('relations.actions.addLinked')" @click="emit('addLinked', null)" />
      </div>
    </template>
  </div>
</template>
