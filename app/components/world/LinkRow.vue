<script setup lang="ts">
import type { WorldRefType } from '#shared/types/domain'

/**
 * One entity linked to a sheet through a relationship (a member of a group, the group of a place,
 * the owner of an object): its picture and name (a link to its sheet), the label of the relationship
 * edited in place ("Vito Didonna, capofamiglia"), and a button that moves the relationship to the
 * trash. On a phone the name and the label are two lines, each a 44px target.
 */
const props = defineProps<{
  type: WorldRefType
  id: string
  name: string
  color?: string | null
  imageId?: string | null
  label: string
  labelPlaceholder: string
  removeLabel: string
}>()

const emit = defineEmits<{ 'update:label': [value: string], 'remove': [] }>()

const { t } = useI18n()
const store = useProjectStore()
const to = computed(() => store.refPath({ type: props.type, id: props.id }))
const row = ref<HTMLElement | null>(null)

/**
 * The parent removes the relationship at once; the focus then goes to the next row's remove button
 * (the previous one after the last), or to the section's add button when no row is left.
 */
function remove() {
  const section = row.value?.closest<HTMLElement>('.d-world-section')
  const buttons = [...(section?.querySelectorAll<HTMLElement>('[data-link-remove]') ?? [])]
  const at = buttons.findIndex(button => row.value?.contains(button))
  const neighbour = buttons[at + 1] ?? buttons[at - 1]
  emit('remove')
  void nextTick(() => {
    const target = neighbour?.isConnected ? neighbour : section?.querySelector<HTMLElement>('[data-world-add]')
    target?.focus()
  })
}
</script>

<template>
  <li ref="row" class="d-link-row flex min-h-11 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1 transition-colors duration-150 hover:bg-elevated/60 max-sm:py-0">
    <NuxtLink :to="to" tabindex="-1" aria-hidden="true" class="shrink-0">
      <DEntityAvatar
        :name="name"
        :image-id="imageId"
        :color="color"
        :shape="type === 'character' ? 'portrait' : 'square'"
        :icon="type === 'character' ? undefined : REF_ICONS[type]"
        size="sm"
        alt=""
      />
    </NuxtLink>
    <div class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-1">
      <NuxtLink
        :to="to"
        class="voice-author min-w-0 truncate font-semibold text-highlighted underline-offset-3 hover:underline max-sm:min-h-11 max-sm:pt-5"
      >
        {{ name }}<span v-if="label" class="max-sm:hidden" aria-hidden="true">,</span>
      </NuxtLink>
      <DInlineText
        :model-value="label"
        variant="small"
        :placeholder="labelPlaceholder"
        :maxlength="120"
        :aria-label="`${t('common.fields.role')}: ${name}`"
        class="voice-author italic sm:flex-1 max-sm:h-11 max-sm:pb-5 max-sm:text-base"
        @update:model-value="(value: string) => emit('update:label', value)"
      />
    </div>
    <UButton
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="sm"
      data-link-remove
      class="shrink-0 text-dimmed max-lg:size-11 max-lg:justify-center"
      :aria-label="removeLabel"
      @click="remove"
    />
  </li>
</template>

<style scoped>
/* The label's placeholder shows where there is a pointer only on hover or focus, so a list of empty roles stays quiet. */
@media (hover: hover) {
  .d-link-row :deep(input::placeholder) {
    color: transparent;
  }
  .d-link-row:hover :deep(input::placeholder),
  .d-link-row:focus-within :deep(input::placeholder) {
    color: var(--ui-text-dimmed);
  }
}
</style>
