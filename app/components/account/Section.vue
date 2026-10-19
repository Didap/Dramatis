<script setup lang="ts">
/**
 * A section of the account page: an anchored heading, one line of context, its fields, and a quiet
 * "Salvato" once a change of this section has reached the server.
 */
defineProps<{
  id: string
  title: string
  description?: string
  /** Shows the saved mark (the time of the last save of this section). */
  savedAt?: number | null
}>()
const { t } = useI18n()
</script>

<template>
  <section :id="id" class="account-section scroll-mt-20" :aria-labelledby="`${id}-title`">
    <div class="flex items-baseline gap-3">
      <h2 :id="`${id}-title`" class="text-lg font-semibold text-highlighted">{{ title }}</h2>
      <span class="inline-flex min-w-20 items-center gap-1 text-xs text-dimmed" role="status" aria-live="polite">
        <template v-if="savedAt">
          <UIcon name="i-lucide-check" class="size-3.5" />{{ t('account.saved') }}
        </template>
      </span>
    </div>
    <p v-if="description" class="mt-1 max-w-prose text-sm text-pretty text-muted">{{ description }}</p>
    <div class="mt-4">
      <slot />
    </div>
  </section>
</template>
