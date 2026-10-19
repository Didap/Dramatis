<script setup lang="ts">
import type { Group } from '#shared/types/entities'

/**
 * A group in a list: its colour dot and name, then the colour's name, kind, number of members and
 * planning status (under the name on a phone, wrapping when they do not fit). In the side column of
 * a sheet, the name over the colour's name and the status.
 */
const props = withDefaults(defineProps<{
  group: Group
  members: number
  compact?: boolean
  active?: boolean
}>(), { compact: false, active: false })

const store = useProjectStore()
const { t } = useI18n()
const { label } = useEnums()
const { number } = useFormat()
const to = computed(() => store.refPath({ type: 'group', id: props.group.id }))
const colour = computed(() => (props.group.color ? label('color', props.group.color) : ''))
</script>

<template>
  <WorldSideRow v-if="props.compact" :to="to" :name="props.group.name" :status="props.group.status" :detail="colour" :active="props.active">
    <template #leading>
      <span class="grid size-8 place-items-center">
        <DColorDot :color="props.group.color || null" size="md" />
      </span>
    </template>
  </WorldSideRow>
  <DRow v-else :to="to" :name="props.group.name">
    <template #leading>
      <span class="grid size-8 place-items-center">
        <DColorDot :color="props.group.color || null" size="md" />
      </span>
    </template>
    <template #numbers>
      <span class="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span v-if="colour" class="whitespace-nowrap text-dimmed">{{ colour }}</span>
        <span class="whitespace-nowrap">{{ label('groupKind', props.group.kind) }}</span>
        <span class="whitespace-nowrap">{{ t('groups.membersCount', { n: number(props.members) }, props.members) }}</span>
        <DStatusBadge :value="props.group.status" kind="planning" />
      </span>
    </template>
  </DRow>
</template>
