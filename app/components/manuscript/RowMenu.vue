<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { RowActionGroup } from './Structure.vue'

/**
 * The "⋯" menu of a part, chapter or scene row, of a page, or of the selection bar (with its own
 * trigger in the `trigger` slot). A dropdown on desktop; below 1024px, where the workspace uses the
 * phone layout, a drawer with 44px rows (DESIGN.md "menus become drawers").
 */
const props = withDefaults(defineProps<{
  groups: RowActionGroup[]
  /** Accessible name of the button and title of the drawer ("Azioni di «Dettatura»"). */
  label: string
  /** In a row the button stays quiet until the row is hovered or focused. */
  quiet?: boolean
  /** sm in rows; md next to the buttons of a page header. */
  size?: 'sm' | 'md'
  /** Where the dropdown opens (the selection bar sits at the foot of the screen). */
  side?: 'top' | 'bottom'
}>(), { quiet: true, size: 'sm', side: 'bottom' })

const phone = useMediaQuery('(max-width: 1023.98px)')
const open = ref(false)

const items = computed<DropdownMenuItem[][]>(() => {
  const plain: DropdownMenuItem[][] = []
  let current: DropdownMenuItem[] = []
  const flush = () => {
    if (current.length) plain.push(current)
    current = []
  }
  for (const group of props.groups) {
    const actions = group.actions.map<DropdownMenuItem>(action => ({
      label: action.label,
      icon: action.icon,
      color: action.color,
      kbds: action.kbds,
      disabled: action.disabled,
      ...(action.checked !== undefined ? { type: 'checkbox' as const, checked: action.checked } : {}),
      ui: action.iconClass ? { itemLeadingIcon: action.iconClass } : undefined,
      onSelect: action.onSelect,
    }))
    if (group.submenu) {
      current.push({ label: group.submenu.label, icon: group.submenu.icon, children: actions })
    }
    else {
      flush()
      current = actions
      flush()
    }
  }
  flush()
  return plain
})

function run(action: RowActionGroup['actions'][number]) {
  open.value = false
  // Let the drawer close first: some actions move the focus (rename, move).
  setTimeout(() => action.onSelect(), 0)
}
</script>

<template>
  <UDrawer v-if="phone" v-model:open="open" :title="label" :ui="{ body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }">
    <slot name="trigger">
      <UButton
        icon="i-lucide-ellipsis-vertical"
        color="neutral"
        variant="ghost"
        class="relative z-[2] size-11 justify-center text-muted"
        :aria-label="label"
      />
    </slot>
    <template #body>
      <div class="space-y-3">
        <section v-for="group in groups" :key="group.key">
          <h3 v-if="group.submenu" class="px-2 pb-1 text-xs font-medium text-muted">{{ group.submenu.label }}</h3>
          <ul :class="group.submenu ? 'grid grid-cols-2 gap-1' : ''">
            <li v-for="action in group.actions" :key="action.key">
              <UButton
                color="neutral"
                variant="ghost"
                block
                class="min-h-11 justify-start"
                :class="[action.color === 'error' ? 'text-error' : '', action.checked ? 'bg-elevated font-semibold text-highlighted' : '']"
                :disabled="action.disabled"
                :aria-pressed="action.checked === undefined ? undefined : action.checked"
                @click="run(action)"
              >
                <UIcon v-if="action.icon" :name="action.icon" class="size-5 shrink-0" :class="action.iconClass ?? (action.color === 'error' ? '' : 'text-muted')" />
                <span class="truncate">{{ action.label }}</span>
                <UIcon v-if="action.checked" name="i-lucide-check" class="ms-auto size-4 shrink-0 text-primary" />
              </UButton>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </UDrawer>
  <UDropdownMenu v-else v-model:open="open" :items="items" :content="{ align: 'end', side }" :modal="false">
    <slot name="trigger">
      <UButton
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        :size="size"
        class="relative z-[2] text-muted"
        :class="quiet ? 'opacity-70 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100' : ''"
        :aria-label="label"
      />
    </slot>
  </UDropdownMenu>
</template>
