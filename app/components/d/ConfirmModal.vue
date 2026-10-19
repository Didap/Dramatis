<script setup lang="ts">
/**
 * Confirmation for destructive actions that cannot be undone (purge, delete project).
 * Opened through useConfirm(); resolves true or false. With `phrase`, the user must type it.
 */
const props = withDefaults(defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  phrase?: string
  danger?: boolean
}>(), { description: undefined, confirmLabel: undefined, phrase: undefined, danger: true })

const emit = defineEmits<{ close: [value: boolean] }>()
const { t } = useI18n()
const typed = ref('')
const ready = computed(() => !props.phrase || typed.value.trim() === props.phrase.trim())
</script>

<template>
  <UModal :title="title" :description="description" :close="false" @update:open="(v: boolean) => !v && emit('close', false)">
    <template v-if="phrase" #body>
      <UFormField :label="t('common.confirm.typeToConfirm', { phrase })">
        <UInput v-model="typed" autofocus class="w-full" @keydown.enter="ready && emit('close', true)" />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('common.actions.cancel')" @click="emit('close', false)" />
        <UButton :color="danger ? 'error' : 'primary'" :label="confirmLabel ?? t('common.actions.confirm')" :disabled="!ready" @click="emit('close', true)" />
      </div>
    </template>
  </UModal>
</template>
