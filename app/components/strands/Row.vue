<script setup lang="ts">
import type { Strand } from '#shared/types/entities'

/**
 * A strand in the list (spec 4.3): its colour with the colour's name, the title joined by the leader
 * to the scenes it runs through (and, for a quest, the objectives written), the kind and the status.
 * Where the row is narrow (a phone, the pane beside a strand) the kind, the colour and the numbers go
 * under the title. The handle drags it; Alt+Up/Down and the menu move it; the menu also trashes it.
 */
const props = withDefaults(defineProps<{
  strand: Strand
  scenes: number
  progress?: { done: number, total: number } | null
  first: boolean
  last: boolean
  active?: boolean
}>(), { progress: null, active: false })

const emit = defineEmits<{ move: [delta: number] }>()

const store = useProjectStore()
const route = useRoute()
const { t } = useI18n()
const { label } = useEnums()
const { scenes: scenesText } = useFormat()

const to = computed(() => store.refPath({ type: 'strand', id: props.strand.id }))
const kind = computed(() => label('strandKind', props.strand.kind))
const color = computed(() => (props.strand.color ? label('color', props.strand.color) : ''))
const numbers = computed(() => [
  scenesText(props.scenes),
  ...(props.progress ? [t('strands.row.objectives', { done: props.progress.done, total: props.progress.total }, props.progress.total)] : []),
])
/** The lines under the title where the row is narrow; a line breaks between its parts, never inside one. */
const narrowLines = computed(() => [[kind.value, color.value].filter(Boolean), numbers.value])

async function trash() {
  const open = route.params.strandId === props.strand.id
  const removed = await store.remove('strands', props.strand.id).catch(() => null)
  if (removed && open) await navigateTo(`/p/${store.projectId}/strands`)
}

const menu = computed(() => [
  [{ label: t('common.actions.open'), icon: 'i-lucide-arrow-up-right', to: to.value }],
  [
    { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', disabled: props.first, kbds: ['alt', 'arrowup'], onSelect: () => emit('move', -1) },
    { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', disabled: props.last, kbds: ['alt', 'arrowdown'], onSelect: () => emit('move', 1) },
  ],
  [{ label: t('common.actions.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: trash }],
])
</script>

<template>
  <div
    class="flex items-center rounded-[calc(var(--ui-radius)*2)] transition-colors duration-150 hover:bg-elevated focus-within:bg-elevated"
    :class="active ? 'bg-elevated' : ''"
  >
    <span class="d-sortable-handle flex h-11 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-dimmed active:cursor-grabbing" :title="t('architecture.sortable.handle')" aria-hidden="true">
      <UIcon name="i-lucide-grip-vertical" class="size-4" />
    </span>
    <NuxtLink
      :to="to"
      class="group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] py-1.5 pe-2 ps-1"
      :aria-current="active ? 'page' : undefined"
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
    >
      <DColorDot :color="strand.color || null" size="md" />
      <span class="flex min-w-0 flex-1 flex-col @2xl:flex-row @2xl:items-baseline @2xl:gap-3">
        <span class="voice-author truncate text-base font-semibold! text-highlighted">{{ strand.name }}</span>
        <span v-for="(parts, line) in narrowLines" :key="line" class="text-sm text-muted @2xl:hidden">
          <template v-for="(part, i) in parts" :key="i"><span class="whitespace-nowrap">{{ part }}<template v-if="i < parts.length - 1">&nbsp;·</template></span>{{ ' ' }}</template>
        </span>
        <DLeader class="hidden @2xl:block" />
        <span class="tabular hidden shrink-0 items-baseline gap-3 text-sm text-muted @2xl:flex">
          <span v-for="(text, i) in numbers" :key="i">{{ text }}</span>
        </span>
      </span>
      <span class="hidden w-40 shrink-0 flex-col text-sm leading-tight @2xl:flex">
        <span class="truncate text-toned">{{ kind }}</span>
        <span v-if="color" class="truncate text-xs text-muted">{{ color }}</span>
      </span>
      <span class="hidden w-24 shrink-0 @2xl:block">
        <DStatusBadge kind="planning" :value="strand.status" />
      </span>
      <span class="shrink-0 @2xl:hidden">
        <DStatusBadge kind="planning" :value="strand.status" compact />
      </span>
    </NuxtLink>
    <UDropdownMenu :items="menu" :content="{ align: 'end' }">
      <UButton
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        class="me-1 shrink-0 text-muted max-lg:size-11 max-lg:justify-center"
        :aria-label="t('strands.row.actions', { name: strand.name })"
      />
    </UDropdownMenu>
  </div>
</template>
