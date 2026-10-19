<script setup lang="ts">
/** The shortcut sheet, opened with "?" outside text fields (spec 0, shortcuts). */
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const rows = computed(() => [
  { keys: ['meta', 'K'], label: t('common.shortcuts.palette') },
  { keys: ['meta', 'F'], label: t('common.shortcuts.find') },
  { keys: ['meta', 'shift', 'F'], label: t('common.shortcuts.search') },
  { keys: ['meta', 'J'], label: t('common.shortcuts.details') },
  { keys: ['meta', 'shift', 'enter'], label: t('common.shortcuts.focus') },
  { keys: ['meta', '\\'], label: t('common.shortcuts.sidebar') },
  { keys: ['F2'], label: t('common.shortcuts.rename') },
  { keys: ['alt', 'arrowup'], label: t('common.shortcuts.moveUp') },
  { keys: ['alt', 'arrowdown'], label: t('common.shortcuts.moveDown') },
  { keys: ['escape'], label: t('common.shortcuts.escape') },
  { keys: ['?'], label: t('common.shortcuts.sheet') },
])
</script>

<template>
  <UModal v-model:open="open" :title="t('common.shortcuts.title')">
    <template #body>
      <ul class="space-y-1">
        <li v-for="row in rows" :key="row.label" class="flex items-center gap-3 py-1">
          <span class="text-sm text-default">{{ row.label }}</span>
          <DLeader />
          <span class="flex shrink-0 items-center gap-1"><UKbd v-for="key in row.keys" :key="key" :value="key" /></span>
        </li>
      </ul>
    </template>
  </UModal>
</template>
