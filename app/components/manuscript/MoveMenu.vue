<script setup lang="ts">
import { UDrawer, UPopover } from '#components'
import type { StructureKind } from './Structure.vue'

/**
 * "Sposta": one step up or down, or into another chapter or part. In a row the trigger is the
 * handle: drag it to reorder (a long press on touch screens), click or tap it for the menu. On a
 * page it is a button. Below 1024px the menu is a drawer. Keyboard users reach the same panel from
 * the row menu, or move with Alt+Up/Down.
 */
const props = withDefaults(defineProps<{
  kind: StructureKind
  id: string
  title: string
  trigger?: 'handle' | 'button'
}>(), { trigger: 'handle' })
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const phone = useMediaQuery('(max-width: 1023.98px)')
const label = computed(() => t('manuscript.actions.moveTitle', { title: props.title }))
</script>

<template>
  <component
    :is="phone ? UDrawer : UPopover"
    v-model:open="open"
    v-bind="phone ? { title: label, ui: { body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' } } : { content: { align: 'start', side: 'bottom', sideOffset: 4 } }"
  >
    <UButton
      v-if="trigger === 'button'"
      icon="i-lucide-move-vertical"
      color="neutral"
      variant="ghost"
      class="max-lg:min-h-11 max-lg:min-w-11 max-lg:justify-center"
      :aria-label="label"
    >
      <span class="hidden sm:inline">{{ t('manuscript.actions.move') }}</span>
    </UButton>
    <!-- A 44px target that reaches into the row's margin, so the row itself does not grow. -->
    <button
      v-else-if="phone"
      type="button"
      :data-drag-handle="kind"
      tabindex="-1"
      class="relative z-[2] -ms-2 grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-[calc(var(--ui-radius)*2)] text-dimmed outline-none active:cursor-grabbing"
      :aria-label="label"
    >
      <UIcon name="i-lucide-grip-vertical" class="size-4" />
    </button>
    <button
      v-else
      type="button"
      :data-drag-handle="kind"
      tabindex="-1"
      class="relative z-[2] grid h-8 w-6 shrink-0 cursor-grab place-items-center rounded-[calc(var(--ui-radius)*2)] text-dimmed opacity-0 outline-none transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-default active:cursor-grabbing data-[state=open]:opacity-100 pointer-coarse:opacity-100"
      :aria-label="label"
    >
      <UIcon name="i-lucide-grip-vertical" class="size-4" />
    </button>
    <template #[phone?`body`:`content`]>
      <ManuscriptMovePanel :kind="kind" :id="id" @done="open = false" />
    </template>
  </component>
</template>
