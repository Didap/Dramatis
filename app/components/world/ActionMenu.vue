<script lang="ts">
/** One action of a world menu. */
export interface WorldAction {
  key: string
  label: string
  icon: string
  color?: 'error'
  kbds?: string[]
  disabled?: boolean
  /** Runs once the menu has closed, and places the focus itself (the moved row, the next row). */
  onSelect: () => void
}
</script>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

/**
 * The "⋯" menu of a world row or sheet: a dropdown on desktop and, below 1024px where the workspace
 * uses the phone layout, a drawer with 44px rows (DESIGN.md "menus become drawers"). The chosen
 * action runs after the menu has closed, so the focus goes where the action puts it instead of
 * back to a button that may be gone with its row.
 */
const props = withDefaults(defineProps<{
  groups: WorldAction[][]
  /** Accessible name of the button and title of the drawer ("Azioni per Casa Didonna"). */
  label: string
  /** In a row: a dimmed button with the `d-action-quiet` class, which the row reveals on hover. */
  quiet?: boolean
}>(), { quiet: false })

const desktop = useIsDesktop()
const open = ref(false)
let chosen: (() => void) | null = null

const items = computed<DropdownMenuItem[][]>(() => props.groups.map(group => group.map(action => ({
  label: action.label,
  icon: action.icon,
  color: action.color,
  kbds: action.kbds,
  disabled: action.disabled,
  onSelect: () => { chosen = action.onSelect },
}))))

function choose(action: WorldAction) {
  chosen = action.onSelect
  open.value = false
}

/** The menu has closed: with an action chosen, the action moves the focus, not the menu. */
function onCloseAutoFocus(event: Event) {
  const run = chosen
  chosen = null
  if (!run) return
  event.preventDefault()
  run()
}
</script>

<template>
  <UDropdownMenu v-if="desktop" :items="items" :content="{ align: 'end', onCloseAutoFocus }">
    <UButton
      icon="i-lucide-ellipsis"
      color="neutral"
      variant="ghost"
      class="shrink-0"
      :class="props.quiet ? 'd-action-quiet text-dimmed' : ''"
      :aria-label="props.label"
    />
  </UDropdownMenu>
  <UDrawer
    v-else
    v-model:open="open"
    :title="props.label"
    :content="{ onCloseAutoFocus }"
    :ui="{ body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }"
  >
    <UButton
      icon="i-lucide-ellipsis"
      color="neutral"
      variant="ghost"
      class="size-11 shrink-0 justify-center"
      :class="props.quiet ? 'd-action-quiet text-dimmed' : ''"
      :aria-label="props.label"
    />
    <template #body>
      <div class="space-y-3">
        <ul v-for="(group, index) in props.groups" :key="index" role="list">
          <li v-for="action in group" :key="action.key">
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="min-h-11 justify-start"
              :class="action.color === 'error' ? 'text-error' : ''"
              :disabled="action.disabled"
              @click="choose(action)"
            >
              <UIcon :name="action.icon" class="size-5 shrink-0" :class="action.color === 'error' ? '' : 'text-muted'" />
              <span class="truncate">{{ action.label }}</span>
            </UButton>
          </li>
        </ul>
      </div>
    </template>
  </UDrawer>
</template>
