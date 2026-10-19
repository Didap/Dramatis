import { flowChecks, variableUsage } from '#shared/utils/flow'

/**
 * The flow of the open project (choices, implicit continuation, reachability) and its checks, the
 * same ones the server uses for the path and the export. Empty when the branching module is off.
 */
export function useFlow() {
  const store = useProjectStore()
  const result = computed(() => {
    if (!store.modules.branching) return null
    return flowChecks({
      scenes: store.orderedScenes,
      links: store.rows.links,
      startSceneId: store.project?.startSceneId,
      variables: store.rows.variables,
      variablesModule: store.modules.variables,
    })
  })
  const analysis = computed(() => result.value?.analysis ?? null)
  const checks = computed(() => result.value?.checks ?? [])
  const usage = computed(() => variableUsage(store.rows.links))
  /** Number shown on the sidebar badge: problems, not hygiene hints. */
  const problems = computed(() => result.value?.problems ?? 0)
  return { analysis, checks, usage, problems }
}
