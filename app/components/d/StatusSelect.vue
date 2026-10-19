<script setup lang="ts">
/** Picks a scene status or a planning status. */
const model = defineModel<string>({ required: true })
const props = withDefaults(defineProps<{ kind?: 'scene' | 'planning', size?: 'xs' | 'sm' | 'md' }>(), { kind: 'scene', size: 'sm' })

const { t } = useI18n()
const { options } = useEnums()
const items = computed(() =>
  options(props.kind === 'scene' ? 'sceneStatus' : 'planningStatus').map(o => ({ ...o, icon: statusIcon(props.kind, o.value) })),
)
const current = computed(() => items.value.find(i => i.value === model.value))
</script>

<template>
  <USelectMenu
    v-model="model"
    :items="items"
    value-key="value"
    :search-input="false"
    :size="size"
    color="neutral"
    variant="ghost"
    :icon="current?.icon"
    :aria-label="t('common.fields.status')"
    :ui="{ leadingIcon: `text-(--status-${model})` }"
  />
</template>
