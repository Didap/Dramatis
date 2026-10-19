<script setup lang="ts">
import { ENTITY_COLORS } from '#shared/utils/constants'
import type { EntityColor } from '#shared/types/domain'

/** Chooses one of the twelve named entity colours. */
const model = defineModel<EntityColor | '' | string>({ default: '' })
withDefaults(defineProps<{ size?: 'xs' | 'sm' | 'md' }>(), { size: 'sm' })

const { t } = useI18n()
const { label } = useEnums()
const open = ref(false)

function pick(color: EntityColor) {
  model.value = color
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      color="neutral"
      variant="ghost"
      :size="size"
      :aria-label="`${t('common.fields.color')}: ${model ? label('color', model) : t('common.empty.none')}`"
    >
      <DColorDot :color="model || null" size="md" />
      <span class="text-sm">{{ model ? label('color', model) : t('common.fields.color') }}</span>
    </UButton>
    <template #content>
      <div class="grid grid-cols-6 gap-1.5 p-2.5" role="listbox" :aria-label="t('common.fields.color')">
        <UTooltip v-for="color in ENTITY_COLORS" :key="color" :text="label('color', color)">
          <button
            type="button"
            role="option"
            :aria-selected="model === color"
            :aria-label="label('color', color)"
            class="grid size-8 place-items-center rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
            @click="pick(color)"
          >
            <span
              class="size-6 rounded-full"
              :class="model === color ? 'ring-2 ring-offset-2 ring-offset-(--ui-bg) ring-(--ui-text-highlighted)' : ''"
              :style="{ background: `var(--entity-${color})` }"
            />
          </button>
        </UTooltip>
      </div>
    </template>
  </UPopover>
</template>
