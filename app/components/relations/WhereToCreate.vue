<script setup lang="ts">
import type { WorldRefType } from '#shared/types/domain'

/**
 * Nobody to relate yet: one line on what is missing and the sections where it is made (characters,
 * locations, objects, groups or factions). `?new=1` opens the creation where the list supports it.
 */
defineProps<{ text: string }>()

const store = useProjectStore()
const { term } = useTerms()

const TYPES: WorldRefType[] = ['character', 'location', 'object', 'group']
const sections = computed(() => TYPES.map(type => ({
  type,
  label: term(`${type}s` as 'characters' | 'locations' | 'objects' | 'groups'),
  to: { path: `/p/${store.projectId}/${type}s`, query: type === 'character' ? undefined : { new: '1' } },
})))
</script>

<template>
  <div class="relations-where">
    <p class="text-sm text-default">{{ text }}</p>
    <div class="mt-3 flex flex-wrap gap-2">
      <UButton
        v-for="section in sections"
        :key="section.type"
        :to="section.to"
        :icon="REF_ICONS[section.type]"
        :label="section.label"
        color="neutral"
        variant="outline"
        class="max-lg:min-h-11"
      />
    </div>
  </div>
</template>
