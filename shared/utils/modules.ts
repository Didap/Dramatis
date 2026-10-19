import type { ProjectKind, ProjectModule, ProjectModules } from '../types/domain'
import { PROJECT_MODULES } from './constants'

/** Modules switched on by default for each kind of project. */
export const DEFAULT_MODULES: Record<ProjectKind, Record<ProjectModule, boolean>> = {
  novel: { branching: false, variables: false, quests: false, codex: false, script: false, scene_kinds: false },
  game: { branching: true, variables: true, quests: true, codex: true, script: true, scene_kinds: true },
}

/** The effective modules of a project: its explicit choices over the defaults of its kind. */
export function resolveModules(kind: ProjectKind, modules: ProjectModules | null | undefined): Record<ProjectModule, boolean> {
  const defaults = DEFAULT_MODULES[kind] ?? DEFAULT_MODULES.novel
  const resolved = { ...defaults }
  for (const key of PROJECT_MODULES) {
    const value = modules?.[key]
    if (typeof value === 'boolean') resolved[key] = value
  }
  // State variables only make sense with branches.
  if (resolved.variables) resolved.branching = true
  return resolved
}
