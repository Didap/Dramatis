<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { SceneStatus } from '#shared/types/domain'
import { SCENE_STATUSES } from '#shared/utils/constants'
import { STATUS_TEXT } from './Structure.vue'

/** The status of a scene, changed in place: icon plus label, the four statuses told apart by shape. */
const props = defineProps<{
  status: SceneStatus
  /** The scene's title, for the accessible name ("Stato di «Dettatura»: Bozza"). */
  title: string
}>()
const emit = defineEmits<{ change: [status: SceneStatus] }>()

const { t } = useI18n()
const { label } = useEnums()

const items = computed<DropdownMenuItem[]>(() => SCENE_STATUSES.map(key => ({
  type: 'checkbox',
  label: label('sceneStatus', key),
  icon: statusIcon('scene', key),
  checked: key === props.status,
  ui: { itemLeadingIcon: STATUS_TEXT[key] },
  onSelect: () => emit('change', key),
})))
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }" :modal="false">
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      class="relative z-[2] w-[7.25rem] justify-start gap-1.5 px-1.5 font-normal"
      :aria-label="t('manuscript.scene.statusOf', { title, status: label('sceneStatus', status) })"
    >
      <UIcon :name="statusIcon('scene', status)" class="size-4 shrink-0" :class="STATUS_TEXT[status]" />
      <span class="truncate text-sm text-toned">{{ label('sceneStatus', status) }}</span>
    </UButton>
  </UDropdownMenu>
</template>
