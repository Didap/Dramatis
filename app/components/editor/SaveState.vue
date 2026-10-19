<script setup lang="ts">
/**
 * The save state of the open scene (DESIGN.md "Save state"): the text and the scene's details together.
 * Fixed width, never a toast. Salvato (dimmed check, the time in the tooltip); Salvataggio only after
 * 400ms of changes not yet on the server; Senza connessione (the text stays on this device); Non salvato,
 * riprovo with Riprova, also when changes have waited more than ten seconds; Conflitto.
 */
withDefaults(defineProps<{
  /** Icon and word only (the phone's top bar). */
  compact?: boolean
}>(), { compact: false })

const scene = useOpenScene()
const store = useProjectStore()
const online = useOnline()
const { t } = useI18n()
const { time } = useFormat()

// Changes not yet sent count too: "Salvato" only when everything written is on the server.
const busy = computed(() => scene.saving.value || scene.dirty.value || store.saving)
const slow = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
watch(busy, (value) => {
  clearTimeout(timer)
  if (value) timer = setTimeout(() => { slow.value = true }, 400)
  else slow.value = false
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))

const lastSaved = computed(() => {
  const times = [scene.savedAt.value, store.lastSavedAt].filter(Boolean) as string[]
  return times.sort().at(-1) ?? null
})

const state = computed(() => {
  if (scene.conflict.value) return { key: 'conflict', icon: 'i-lucide-git-fork', text: t('editor.save.conflict'), tooltip: t('editor.save.conflictHint'), tone: 'text-warning', alert: true }
  if (scene.failure.value === 'signedOut') return { key: 'signedOut', icon: 'i-lucide-log-in', text: t('editor.save.signedOut'), tooltip: t('editor.save.keptHere'), tone: 'text-error', alert: true }
  if (scene.failure.value === 'gone') return { key: 'gone', icon: 'i-lucide-triangle-alert', text: t('editor.save.gone'), tooltip: t('editor.save.keptHere'), tone: 'text-error', alert: true }
  if (!online.value) return { key: 'offline', icon: 'i-lucide-cloud-off', text: t('editor.save.offline'), tooltip: t('editor.save.offlineHint'), tone: 'text-warning', alert: scene.dirty.value }
  // A save that hangs, or changes unsaved for more than ten seconds, are not saved (spec 5.8.6).
  if (scene.failure.value || store.failed || scene.stale.value) return { key: 'failed', icon: 'i-lucide-triangle-alert', text: t('editor.save.failed'), tooltip: t('editor.save.keptHere'), tone: 'text-error', alert: true, retry: true }
  if (slow.value) return { key: 'saving', icon: 'i-lucide-loader-circle', text: t('editor.save.saving'), tooltip: '', tone: 'text-dimmed', spin: scene.saving.value || store.saving }
  return { key: 'saved', icon: 'i-lucide-check', text: t('editor.save.saved'), tooltip: lastSaved.value ? t('editor.save.savedAt', { time: time(lastSaved.value) }) : '', tone: 'text-dimmed' }
})

async function retry() {
  await Promise.all([scene.retryNow(), store.flush(), store.flushProject()])
  if (!store.saving) store.failed = false
}
</script>

<template>
  <span
    class="d-save-state inline-flex min-w-0 items-center gap-1"
    :class="state.alert ? 'd-keep' : ''"
    role="status"
    aria-live="polite"
  >
    <UTooltip :text="state.tooltip || state.text" :disabled="!state.tooltip && !compact">
      <span class="inline-flex min-w-0 items-center gap-1.5 text-xs" :class="state.tone">
        <UIcon :name="state.icon" class="size-3.5 shrink-0" :class="state.spin ? 'animate-spin motion-reduce:animate-none' : ''" aria-hidden="true" />
        <span class="truncate">{{ state.text }}</span>
      </span>
    </UTooltip>
    <UButton
      v-if="state.retry"
      size="xs"
      color="error"
      variant="link"
      class="px-1"
      :label="t('common.actions.retry')"
      @click="retry"
    />
  </span>
</template>
