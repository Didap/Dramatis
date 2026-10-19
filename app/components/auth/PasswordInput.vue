<script setup lang="ts">
/**
 * A password field with show and hide (spec 4.1). The toggle is a real button that never submits:
 * one name, "Mostra la password", pressed while the password is in view (the ARIA toggle pattern).
 */
const model = defineModel<string>({ default: '' })
const props = withDefaults(defineProps<{
  id: string
  name?: string
  autocomplete?: 'current-password' | 'new-password'
}>(), { name: 'password', autocomplete: 'current-password' })

const { t } = useI18n()
const visible = ref(false)
const input = useTemplateRef('input')

defineExpose({ focus: () => input.value?.inputRef?.focus() })
</script>

<template>
  <UInput
    :id="props.id"
    ref="input"
    :name="props.name"
    v-model="model"
    :type="visible ? 'text' : 'password'"
    :autocomplete="props.autocomplete"
    autocapitalize="none"
    autocorrect="off"
    spellcheck="false"
    maxlength="200"
    size="lg"
    class="w-full"
    :ui="{ base: 'min-h-11 sm:min-h-9 max-sm:pe-12', trailing: 'pe-0 sm:pe-1' }"
  >
    <template #trailing>
      <UTooltip :text="t('auth.password.show')">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-eye"
          class="size-11 justify-center sm:size-7"
          :class="visible ? 'bg-elevated text-primary' : 'text-muted'"
          :aria-label="t('auth.password.show')"
          :aria-pressed="visible"
          :aria-controls="props.id"
          @click="visible = !visible"
        />
      </UTooltip>
    </template>
  </UInput>
</template>

<style scoped>
/* The browser's own reveal button would duplicate ours (Edge). */
:deep(input::-ms-reveal) {
  display: none;
}
</style>
