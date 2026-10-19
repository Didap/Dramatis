<script setup lang="ts">
import type { RelationKind } from '#shared/types/domain'

/**
 * The legend of a map (DESIGN.md, The Name Rule): every kind in use with its line, its name and how
 * many relationships it draws. It also filters: a kind can be hidden and shown again.
 */
const props = defineProps<{ kinds: { kind: RelationKind, count: number }[] }>()
const hidden = defineModel<RelationKind[]>('hidden', { default: () => [] })

const { t } = useI18n()
const { label } = useEnums()
const { number } = useFormat()

function toggle(kind: RelationKind) {
  hidden.value = hidden.value.includes(kind) ? hidden.value.filter(k => k !== kind) : [...hidden.value, kind]
}

const someHidden = computed(() => props.kinds.some(k => hidden.value.includes(k.kind)))
</script>

<template>
  <div class="relations-legend">
    <h2 class="mb-1.5 text-sm font-medium text-default">{{ t('relations.map.legend') }}</h2>
    <p v-if="!kinds.length" class="text-sm text-muted">{{ t('relations.map.legendEmpty') }}</p>
    <ul v-else class="-mx-1.5" role="list">
      <li v-for="item in kinds" :key="item.kind">
        <button
          type="button"
          class="group flex min-h-11 w-full items-center gap-2 lg:min-h-9 rounded-[calc(var(--ui-radius)*2)] px-1.5 text-start text-sm transition-colors duration-150 hover:bg-elevated"
          :class="hidden.includes(item.kind) ? 'text-dimmed' : 'text-default'"
          :aria-pressed="!hidden.includes(item.kind)"
          :aria-label="t('relations.map.legendToggle', { kind: label('relationKind', item.kind), n: item.count }, item.count)"
          @click="toggle(item.kind)"
        >
          <RelationsKindLine :kind="item.kind" :width="22" :class="hidden.includes(item.kind) ? 'opacity-35' : ''" />
          <span class="flex min-w-0 flex-1 items-baseline gap-2">
            <span :class="hidden.includes(item.kind) ? 'line-through decoration-1' : ''">{{ label('relationKind', item.kind) }}</span>
            <DLeader />
            <span class="tabular text-muted">{{ number(item.count) }}</span>
          </span>
          <UIcon :name="hidden.includes(item.kind) ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-3.5 shrink-0 text-dimmed opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" :class="hidden.includes(item.kind) ? 'opacity-100' : ''" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <UButton v-if="someHidden" color="neutral" variant="link" size="sm" class="mt-1 px-0 max-lg:min-h-11" :label="t('relations.map.showAll')" @click="hidden = []" />
  </div>
</template>
