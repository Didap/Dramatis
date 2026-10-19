/**
 * Keeps unsaved work from being lost: flushes queued changes when leaving a route,
 * and asks the browser to confirm closing the tab while something is still being saved.
 */
export function useLeaveGuard() {
  const store = useProjectStore()

  onBeforeRouteLeave(async () => {
    await Promise.all([store.flush(), store.flushProject()])
  })

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!store.saving) return
    void store.flush()
    void store.flushProject()
    event.preventDefault()
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
}
