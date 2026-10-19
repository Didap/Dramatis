<script setup lang="ts">
/**
 * The save state (DESIGN.md): fixed width so nothing shifts, never a toast. Salvato (dimmed check,
 * time in the tooltip); Salvataggio (only after 400ms); Senza connessione (saved on this device);
 * Non salvato (error colour, with Riprova).
 */
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const store = useProjectStore()
const { t } = useI18n()
const { time } = useFormat()
const online = useOnline()

const showSaving = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
watch(() => store.saving, (saving) => {
  if (timer) clearTimeout(timer)
  if (saving) timer = setTimeout(() => { showSaving.value = true }, 400)
  else showSaving.value = false
}, { immediate: true })

const state = computed(() => {
  if (!online.value) return { icon: 'i-lucide-cloud-off', text: t('common.status.offline'), tone: 'text-warning' }
  if (store.failed && store.refused) return { icon: 'i-lucide-triangle-alert', text: t('common.status.refused'), tone: 'text-error' }
  if (store.failed) return { icon: 'i-lucide-triangle-alert', text: t('common.status.failed'), tone: 'text-error', retry: true }
  if (showSaving.value) return { icon: 'i-lucide-loader-circle', text: t('common.status.saving'), tone: 'text-dimmed', spin: true }
  if (store.lastSavedAt) return { icon: 'i-lucide-check', text: t('common.status.saved'), tone: 'text-dimmed', tooltip: t('common.status.savedAt', { time: time(store.lastSavedAt) }) }
  return null
})

async function retry() {
  await store.flush()
  await store.flushProject()
  if (!store.saving) store.failed = false
}
</script>

<template>
  <span class="inline-flex min-w-[6.5rem] items-center justify-end" role="status" aria-live="polite">
    <template v-if="state">
      <UTooltip :text="state.tooltip ?? state.text" :disabled="!compact && !state.tooltip">
        <span class="inline-flex items-center gap-1.5 text-xs" :class="state.tone">
          <UIcon :name="state.icon" class="size-3.5 shrink-0" :class="state.spin ? 'animate-spin' : ''" />
          <span :class="compact ? 'sr-only' : 'hidden sm:inline'">{{ state.text }}</span>
        </span>
      </UTooltip>
      <UButton v-if="state.retry" size="xs" color="error" variant="link" :label="t('common.actions.retry')" class="ms-1" @click="retry" />
    </template>
  </span>
</template>
