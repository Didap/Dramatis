<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

/** An empty state that teaches: what goes here, why it matters, how to start. */
withDefaults(defineProps<{
  icon?: string
  title: string
  description?: string
  actions?: ButtonProps[]
  size?: 'sm' | 'md' | 'lg'
}>(), { icon: undefined, description: undefined, actions: () => [], size: 'md' })
</script>

<template>
  <UEmpty
    :icon="icon"
    :title="title"
    :description="description"
    :actions="actions"
    :size="size"
    variant="naked"
    class="d-empty-state"
  >
    <template v-if="$slots.default" #footer>
      <slot />
    </template>
  </UEmpty>
</template>
