<script setup lang="ts">
import type { WorldAction } from './ActionMenu.vue'

/**
 * The page menu of a world sheet: moves the item to the trash and goes back to its list, where the
 * toast offers to undo. `leaving` is true from the choice until the list opens (or the trash fails),
 * so the sheet does not flash its "not found" state in between.
 */
const props = defineProps<{
  collection: 'groups' | 'locations' | 'objects'
  id: string
  listPath: string
}>()

const leaving = defineModel<boolean>('leaving', { default: false })

const { t } = useI18n()
const store = useProjectStore()

async function trash() {
  leaving.value = true
  try {
    await store.remove(props.collection, props.id)
    await navigateTo(props.listPath)
  }
  catch {
    leaving.value = false
  }
}

const groups = computed<WorldAction[][]>(() => [[
  { key: 'trash', label: t('world.list.trash'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void trash() } },
]])
</script>

<template>
  <WorldActionMenu :groups="groups" :label="t('world.sheet.more')" />
</template>
