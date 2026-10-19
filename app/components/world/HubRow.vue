<script setup lang="ts">
/**
 * A section of the world hub: its icon and name joined to its count by the leader, and under them the
 * item edited last (or "Ancora niente"). The whole row opens the section.
 */
const props = withDefaults(defineProps<{
  to: string
  label: string
  icon: string
  count: number
  /** The item edited last and when, or nothing yet. */
  last?: { name: string, when: string }
}>(), { last: undefined })

const { t } = useI18n()
const { number } = useFormat()
</script>

<template>
  <NuxtLink
    :to="props.to"
    class="group flex min-h-14 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-2 transition-colors duration-150 hover:bg-elevated focus-visible:bg-elevated"
  >
    <span class="grid size-9 shrink-0 place-items-center rounded-[calc(var(--ui-radius)*2)] bg-elevated text-toned" aria-hidden="true">
      <UIcon :name="props.icon" class="size-5" />
    </span>
    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="flex items-baseline gap-3">
        <span class="font-medium text-highlighted">{{ props.label }}</span>
        <DLeader />
        <span class="tabular shrink-0 text-sm text-muted">{{ number(props.count) }}</span>
      </span>
      <span class="truncate text-sm text-muted">
        <template v-if="props.last"><span class="voice-author italic">{{ props.last.name }}</span>, {{ props.last.when }}</template>
        <template v-else>{{ t('world.hub.nothingYet') }}</template>
      </span>
    </span>
    <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
  </NuxtLink>
</template>
