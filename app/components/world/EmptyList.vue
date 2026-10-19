<script setup lang="ts">
/**
 * The empty state of a world list (DESIGN.md "Empty states that teach"): the shape of the list first
 * (two ghost rows with their leaders, hidden from screen readers), what the list is for, one question,
 * one action and one quiet way out.
 */
defineProps<{
  text: string
  question: string
  action: string
  /** Icon of the kind of item the list holds. */
  icon: string
}>()

const emit = defineEmits<{ action: [] }>()
const store = useProjectStore()
const { t } = useI18n()
// On a phone the bottom bar's Aggiungi is the screen's one solid control.
const desktop = useIsDesktop()
</script>

<template>
  <div class="d-world-empty">
    <ul class="mb-6 space-y-px" aria-hidden="true">
      <li v-for="width in ['w-40', 'w-28']" :key="width" class="flex min-h-11 items-center gap-3 px-2">
        <span class="grid size-8 shrink-0 place-items-center rounded-[calc(var(--ui-radius)*2)] bg-elevated text-dimmed">
          <UIcon :name="icon" class="size-4" />
        </span>
        <span class="h-2.5 shrink-0 rounded-full bg-elevated" :class="width" />
        <span class="leader" style="align-self: center" />
        <span class="h-2.5 w-12 shrink-0 rounded-full bg-elevated" />
      </li>
    </ul>
    <p class="max-w-prose text-pretty text-default">{{ text }}</p>
    <p class="mt-1 max-w-prose text-pretty text-muted">{{ question }}</p>
    <div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
      <UButton
        :color="desktop ? 'primary' : 'neutral'"
        :variant="desktop ? 'solid' : 'outline'"
        icon="i-lucide-plus"
        :label="action"
        class="max-lg:min-h-11"
        data-world-create
        @click="emit('action')"
      />
      <NuxtLink
        :to="`/p/${store.projectId}/world`"
        class="text-sm text-muted underline underline-offset-3 hover:text-default max-lg:inline-flex max-lg:min-h-11 max-lg:items-center"
      >
        {{ t('world.list.wayOut') }}
      </NuxtLink>
    </div>
  </div>
</template>
