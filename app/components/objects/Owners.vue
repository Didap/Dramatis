<script setup lang="ts">
import type { Relation } from '#shared/types/entities'
import { CHARACTER_IMPORTANCES } from '#shared/utils/constants'

/**
 * The owners of an object: ownership relationships from characters and groups to the object (owner to
 * thing, spec 7.12), the label saying how ("custode", "erede"). Add, edit the label, remove (the
 * relationship goes to the trash, with undo). Characters first, in the order of their list.
 */
const props = defineProps<{ objectId: string }>()

const OWNER_TYPES = ['character', 'group'] as const
type OwnerType = (typeof OWNER_TYPES)[number]

interface Owner {
  relation: Relation
  type: OwnerType
  id: string
  name: string
  color: string
  order: number
}

const store = useProjectStore()
const { t } = useI18n()

const owners = computed<Owner[]>(() => {
  const groupOrder = new Map(store.rows.groups.map((g, i) => [g.id, i]))
  const list: Owner[] = []
  for (const relation of store.rows.relations) {
    if (relation.kind !== 'ownership' || relation.targetType !== 'object' || relation.targetId !== props.objectId) continue
    if (relation.sourceType === 'character') {
      const c = store.get('characters', relation.sourceId)
      if (c) list.push({ relation, type: 'character', id: c.id, name: c.name, color: c.color, order: CHARACTER_IMPORTANCES.indexOf(c.importance) * 1e6 + c.position })
    }
    else if (relation.sourceType === 'group') {
      const g = store.get('groups', relation.sourceId)
      if (g) list.push({ relation, type: 'group', id: g.id, name: g.name, color: g.color, order: 1e8 + (groupOrder.get(g.id) ?? 0) })
    }
  }
  return list.sort((a, b) => a.order - b.order)
})

const exclude = computed(() => owners.value.map(o => `${o.type}:${o.id}`))

async function add(ref: { type: string, id: string }) {
  if (ref.type !== 'character' && ref.type !== 'group') return
  await store.create('relations', {
    sourceType: ref.type,
    sourceId: ref.id,
    targetType: 'object',
    targetId: props.objectId,
    kind: 'ownership',
    directed: true,
  }).catch(() => {})
}
</script>

<template>
  <WorldSection :title="t('objects.owners')" :count="owners.length">
    <template #actions>
      <WorldRefPicker :types="[...OWNER_TYPES]" :exclude="exclude" :label="t('objects.addOwner')" @pick="add" />
    </template>
    <ul v-if="owners.length" role="list" class="-mx-2 space-y-px">
      <WorldLinkRow
        v-for="owner in owners"
        :key="owner.relation.id"
        :type="owner.type"
        :id="owner.id"
        :name="owner.name"
        :color="owner.color"
        :image-id="store.primaryImage(owner.type, owner.id)"
        :label="owner.relation.label"
        :label-placeholder="t('objects.ownerLabel')"
        :remove-label="t('objects.removeOwner', { name: owner.name })"
        @update:label="(label: string) => store.patchSoon('relations', owner.relation.id, { label })"
        @remove="store.remove('relations', owner.relation.id).catch(() => {})"
      />
    </ul>
    <p v-else class="max-w-prose text-pretty text-sm text-muted">{{ t('objects.noOwners') }}</p>
  </WorldSection>
</template>
