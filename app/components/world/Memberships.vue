<script setup lang="ts">
import type { Relation } from '#shared/types/entities'

/**
 * The groups (factions, in games) an entity belongs to: membership relationships from the entity to
 * the group, with the role as their label. Add, edit the role, remove (the relationship goes to the trash).
 */
const props = defineProps<{
  entityType: 'character' | 'location' | 'object'
  entityId: string
}>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const mt = (key: string, values?: Record<string, unknown>) => t(`world.memberships.${store.kind}.${key}`, values ?? {})

const memberships = computed(() =>
  store.rows.relations
    .filter((r: Relation) => r.kind === 'membership' && r.sourceType === props.entityType && r.sourceId === props.entityId && r.targetType === 'group')
    .map(relation => ({ relation, group: store.get('groups', relation.targetId) }))
    .filter((m): m is { relation: Relation, group: NonNullable<typeof m.group> } => !!m.group)
    .sort((a, b) => a.group.position - b.group.position),
)

const exclude = computed(() => memberships.value.map(m => `group:${m.group.id}`))

async function add(ref: { id: string }) {
  await store.create('relations', {
    sourceType: props.entityType,
    sourceId: props.entityId,
    targetType: 'group',
    targetId: ref.id,
    kind: 'membership',
    directed: true,
  }).catch(() => {})
}
</script>

<template>
  <WorldSection :title="term('groups')" :count="memberships.length">
    <template #actions>
      <WorldRefPicker :types="['group']" :exclude="exclude" :label="mt('add')" @pick="add" />
    </template>
    <ul v-if="memberships.length" role="list" class="-mx-2 space-y-px">
      <WorldLinkRow
        v-for="{ relation, group } in memberships"
        :key="relation.id"
        type="group"
        :id="group.id"
        :name="group.name"
        :color="group.color"
        :image-id="store.primaryImage('group', group.id)"
        :label="relation.label"
        :label-placeholder="mt('role')"
        :remove-label="mt('remove', { name: group.name })"
        @update:label="(label: string) => store.patchSoon('relations', relation.id, { label })"
        @remove="store.remove('relations', relation.id).catch(() => {})"
      />
    </ul>
    <p v-else class="text-sm text-muted">{{ mt('empty') }}</p>
  </WorldSection>
</template>
