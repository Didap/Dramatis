<script setup lang="ts">
/**
 * The workspace shell: loads the project, then the sidebar (desktop) or the bottom bar (phone),
 * the command palette, the capture and "Altro" drawers, the shortcut sheet; child pages render inside.
 * Refetches when the tab comes back after a while (spec 5.11), never while a change is unsaved.
 */
const route = useRoute()
const store = useProjectStore()
const { t } = useI18n()

const projectId = computed(() => String(route.params.projectId))
const search = useState('dramatis:search-open', () => false)
/** The scene editor replaces the phone's bottom bar with its own keyboard bar. */
const hidePhoneBar = useState('dramatis:hide-phone-bar', () => false)
const capture = ref(false)
const more = ref(false)
const shortcuts = ref(false)
const collapsed = ref(false)
let loadedAt = 0

async function open(id: string) {
  await store.load(id)
  loadedAt = Date.now()
  if (store.status === 'ready') void $fetch(`/api/projects/${id}/opened`, { method: 'POST' }).catch(() => {})
}

watch(projectId, id => open(id), { immediate: true })

useLeaveGuard()

async function refetch() {
  if (store.status !== 'ready' || store.saving || Date.now() - loadedAt < 30_000) return
  await store.reload()
  loadedAt = Date.now()
}
useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState === 'visible') void refetch()
})
useEventListener(window, 'online', async () => {
  await store.flush()
  await store.flushProject()
  loadedAt = 0
  await refetch()
})

defineShortcuts({
  meta_k: { usingInput: true, handler: () => { search.value = true } },
  '?': () => { shortcuts.value = true },
  'meta_\\': () => { collapsed.value = !collapsed.value },
})

const errorTitle = computed(() => (errorStatus(store.loadError) === 404 ? t('common.errors.notFound') : t('common.errors.loadProject')))
</script>

<template>
  <UDashboardGroup storage="local" storage-key="dramatis-workspace" unit="rem">
    <template v-if="store.status === 'ready' && store.project?.id === projectId">
      <AppSidebar v-model:collapsed="collapsed" />
      <div class="relative flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-default">
        <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-default focus:p-2">{{ t('common.a11y.skipToContent') }}</a>
        <NuxtPage />
      </div>
      <AppMobileBar v-if="!hidePhoneBar" @capture="capture = true" @more="more = true" />
      <AppCaptureDrawer v-model:open="capture" />
      <AppMoreDrawer v-model:open="more" />
      <SearchPalette v-model:open="search" />
      <AppShortcutSheet v-model:open="shortcuts" />
    </template>

    <div v-else-if="store.status === 'error'" class="grid flex-1 place-items-center p-6">
      <DEmptyState
        icon="i-lucide-book-x"
        :title="errorTitle"
        :actions="[{ label: t('common.nav.projects'), to: '/projects', color: 'neutral', variant: 'outline' }, { label: t('common.actions.retry'), color: 'primary', variant: 'solid', onClick: () => open(projectId) }]"
      />
    </div>

    <div v-else class="flex flex-1" aria-busy="true">
      <div class="hidden w-62 shrink-0 space-y-3 border-e border-default/70 bg-muted p-4 lg:block">
        <USkeleton class="h-6 w-40" />
        <USkeleton class="h-8 w-full" />
        <USkeleton v-for="i in 9" :key="i" class="h-5 w-3/4" />
      </div>
      <div class="flex-1 space-y-4 p-6 lg:p-10">
        <USkeleton class="h-8 w-64" />
        <USkeleton class="h-4 w-96 max-w-full" />
        <USkeleton v-for="i in 5" :key="i" class="h-11 w-full max-w-3xl" />
      </div>
      <span class="sr-only">{{ t('common.status.loading') }}</span>
    </div>
  </UDashboardGroup>
</template>
