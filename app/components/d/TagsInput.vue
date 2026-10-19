<script setup lang="ts">
/** Free labels to categorise items (for example "suspects", "flashback", "Rossi family"). */
const model = defineModel<string[]>({ default: () => [] })
withDefaults(defineProps<{ placeholder?: string, size?: 'xs' | 'sm' | 'md' }>(), { placeholder: undefined, size: 'md' })
const { t } = useI18n()
</script>

<template>
  <UInputTags
    v-model="model"
    :placeholder="placeholder ?? t('common.tags.placeholder')"
    :size="size"
    variant="ghost"
    :aria-label="t('common.fields.tags')"
    class="w-full"
    add-on-blur
    add-on-paste
  />
</template>
