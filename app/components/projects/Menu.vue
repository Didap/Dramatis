<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

/** One entry of a projects menu: an action, or a link when `to` is set. */
export interface ProjectAction {
  key: string
  label: string
  description?: string
  icon?: string
  color?: 'error'
  to?: string
  onSelect?: () => void
}

/**
 * A menu of the projects page. A dropdown from 1024px; below, where the page is laid out for the
 * phone, a drawer with 44px rows (DESIGN.md "menus become drawers"), as in the workspace.
 * The default slot is the button that opens it.
 */
const props = withDefaults(defineProps<{
  groups: ProjectAction[][]
  /** Names the menu: the drawer's title, and with `tooltip` the button's tooltip on a desktop. */
  title: string
  tooltip?: boolean
  disabled?: boolean
  /** Width of the dropdown. */
  width?: string
}>(), { tooltip: false, disabled: false, width: 'w-56' })

/** Fired when the menu closes, before the focus goes back to its button: prevent it to put the focus elsewhere. */
const emit = defineEmits<{ closeAutoFocus: [event: Event] }>()

const desktop = useIsDesktop()
const open = ref(false)

const content = { align: 'end' as const, onCloseAutoFocus: (event: Event) => emit('closeAutoFocus', event) }

const items = computed<DropdownMenuItem[][]>(() => props.groups.map(group => group.map(action => ({
  label: action.label,
  description: action.description,
  icon: action.icon,
  color: action.color,
  to: action.to,
  onSelect: action.onSelect,
}))))

function run(action: ProjectAction) {
  open.value = false
  // Once the closing drawer has let go of the focus: an action may move it (rename, to the title field).
  if (action.onSelect) setTimeout(action.onSelect, 0)
}
</script>

<template>
  <UDrawer
    v-if="!desktop"
    v-model:open="open"
    :title="title"
    :content="{ onCloseAutoFocus: content.onCloseAutoFocus }"
    :ui="{ body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }"
  >
    <slot />
    <template #body>
      <div class="divide-y divide-default">
        <ul v-for="(group, index) in groups" :key="index" class="py-1.5 first:pt-0 last:pb-0">
          <li v-for="action in group" :key="action.key">
            <UButton
              :to="action.to"
              color="neutral"
              variant="ghost"
              block
              class="min-h-11 justify-start gap-3 py-2 text-start"
              :class="action.color === 'error' ? 'text-error' : 'text-default'"
              @click="run(action)"
            >
              <UIcon
                v-if="action.icon"
                :name="action.icon"
                class="size-5 shrink-0"
                :class="[action.description ? 'mt-0.5 self-start' : '', action.color === 'error' ? '' : 'text-muted']"
              />
              <span class="min-w-0">
                <span class="block text-base">{{ action.label }}</span>
                <span v-if="action.description" class="mt-0.5 block text-sm font-normal text-muted text-pretty">{{ action.description }}</span>
              </span>
            </UButton>
          </li>
        </ul>
      </div>
    </template>
  </UDrawer>
  <!-- The tooltip inside the menu: UTooltip hands the menu's trigger attributes on to the button, the other way round they are lost. -->
  <UDropdownMenu v-else :items="items" :content="content" :disabled="disabled" :ui="{ content: width, itemDescription: 'text-pretty' }">
    <UTooltip :text="title" :disabled="!tooltip">
      <slot />
    </UTooltip>
  </UDropdownMenu>
</template>
