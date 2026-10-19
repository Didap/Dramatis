<script setup lang="ts">
/**
 * A row of the list beside an open sheet (from xl, the inbox pattern): the picture or colour dot,
 * the name, and under it one short line, a detail (the colour's name, the place, the kind) and the
 * planning status as icon and label. The open item is marked for the eye and for screen readers.
 */
const props = withDefaults(defineProps<{
  to: string
  name: string
  status: string
  detail?: string
  active?: boolean
}>(), { detail: '', active: false })

const { label } = useEnums()
</script>

<template>
  <NuxtLink
    :to="props.to"
    class="flex min-h-11 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 outline-none transition-colors duration-150 hover:bg-elevated focus-visible:bg-elevated"
    :class="props.active ? 'bg-elevated' : ''"
    :aria-current="props.active ? 'page' : undefined"
  >
    <span class="flex shrink-0 items-center"><slot name="leading" /></span>
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="voice-author truncate font-semibold text-highlighted">{{ props.name }}</span>
      <span class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
        <template v-if="props.detail">
          <span class="min-w-0 truncate">{{ props.detail }}</span>
          <span aria-hidden="true">·</span>
        </template>
        <span class="inline-flex shrink-0 items-center gap-1">
          <UIcon :name="statusIcon('planning', props.status)" class="size-3.5 shrink-0" :style="{ color: `var(--status-${props.status})` }" />
          {{ label('planningStatus', props.status) }}
        </span>
      </span>
    </span>
  </NuxtLink>
</template>
