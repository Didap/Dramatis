<script setup lang="ts">
import type { Relation } from '#shared/types/entities'
import { CHARACTER_IMPORTANCES } from '#shared/utils/constants'

/**
 * The members of a group: membership relationships from characters, locations and objects to the
 * group (spec 0.3), the role being the relationship's label. Add (several in a row), edit the role in
 * place, remove (the relationship goes to the trash, with undo). Grouped by kind, in the order of
 * their own lists.
 */
const props = defineProps<{ groupId: string, race?: boolean }>()

const MEMBER_TYPES = ['character', 'location', 'object'] as const
type MemberType = (typeof MEMBER_TYPES)[number]
const TYPE_TERM = { character: 'characters', location: 'locations', object: 'objects' } as const

interface Member {
  relation: Relation
  id: string
  name: string
  color: string
  order: number
}

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const mt = (key: string, values?: Record<string, unknown>) => t(`groups.${props.race ? 'race' : store.kind}.${key}`, values ?? {})

const members = computed(() => {
  const byType: Record<MemberType, Member[]> = { character: [], location: [], object: [] }
  const locationOrder = new Map(store.rows.locations.map((l, i) => [l.id, i]))
  const objectOrder = new Map(store.rows.objects.map((o, i) => [o.id, i]))
  for (const relation of store.rows.relations) {
    if (relation.kind !== 'membership' || relation.targetType !== 'group' || relation.targetId !== props.groupId) continue
    const id = relation.sourceId
    if (relation.sourceType === 'character') {
      const c = store.get('characters', id)
      if (c) byType.character.push({ relation, id, name: c.name, color: c.color, order: CHARACTER_IMPORTANCES.indexOf(c.importance) * 1e6 + c.position })
    }
    else if (relation.sourceType === 'location') {
      const l = store.get('locations', id)
      if (l) byType.location.push({ relation, id, name: l.name, color: l.color, order: locationOrder.get(id) ?? 0 })
    }
    else if (relation.sourceType === 'object') {
      const o = store.get('objects', id)
      if (o) byType.object.push({ relation, id, name: o.name, color: o.color, order: objectOrder.get(id) ?? 0 })
    }
  }
  for (const list of Object.values(byType)) list.sort((a, b) => a.order - b.order)
  return byType
})

const total = computed(() => MEMBER_TYPES.reduce((n, type) => n + members.value[type].length, 0))
const exclude = computed(() => MEMBER_TYPES.flatMap(type => members.value[type].map(m => `${type}:${m.id}`)))
const present = computed(() => MEMBER_TYPES.filter(type => members.value[type].length))

async function add(ref: { type: string, id: string }) {
  if (ref.type !== 'character' && ref.type !== 'location' && ref.type !== 'object') return
  await store.create('relations', {
    sourceType: ref.type,
    sourceId: ref.id,
    targetType: 'group',
    targetId: props.groupId,
    kind: 'membership',
    directed: true,
  }).catch(() => {})
}
</script>

<template>
  <WorldSection :title="props.race ? mt('members') : t('groups.members')" :count="total">
    <template #actions>
      <WorldRefPicker :types="[...MEMBER_TYPES]" :exclude="exclude" :label="t('groups.addMember')" @pick="add" />
    </template>
    <div v-if="total" class="space-y-5">
      <div v-for="type in present" :key="type">
        <h3 class="mb-1 text-sm font-medium text-muted">{{ term(TYPE_TERM[type]) }}</h3>
        <ul role="list" class="-mx-2 space-y-px">
          <WorldLinkRow
            v-for="member in members[type]"
            :key="member.relation.id"
            :type="type"
            :id="member.id"
            :name="member.name"
            :color="member.color"
            :image-id="store.primaryImage(type, member.id)"
            :label="member.relation.label"
            :label-placeholder="mt('role')"
            :remove-label="mt('removeMember', { name: member.name })"
            @update:label="(label: string) => store.patchSoon('relations', member.relation.id, { label })"
            @remove="store.remove('relations', member.relation.id).catch(() => {})"
          />
        </ul>
      </div>
    </div>
    <p v-else class="max-w-prose text-pretty text-sm text-muted">{{ mt('noMembers') }}</p>
  </WorldSection>
</template>
