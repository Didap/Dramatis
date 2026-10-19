<script setup lang="ts">
/**
 * The text filter of a world list, shown from eight items: Escape clears it. `focus()` brings the
 * caret back, after "Mostra tutto" has cleared it from the line below the list.
 */
const query = defineModel<string>({ required: true })

const props = withDefaults(defineProps<{
  /** Says what the filter matches ("Filtra per nome o tipo"). */
  placeholder: string
  compact?: boolean
}>(), { compact: false })

const { t } = useI18n()
const input = ref<{ inputRef?: HTMLInputElement | null } | null>(null)

defineExpose({ focus: () => input.value?.inputRef?.focus() })
</script>

<template>
  <UInput
    ref="input"
    v-model="query"
    type="text"
    autocomplete="off"
    icon="i-lucide-list-filter"
    :placeholder="props.placeholder"
    :aria-label="t('world.list.filter')"
    :size="props.compact ? 'sm' : 'md'"
    class="w-full"
    :class="props.compact ? '' : 'sm:max-w-xs'"
    :ui="{ base: 'max-sm:text-base max-lg:min-h-11' }"
    @keydown.esc="query = ''"
  />
</template>
