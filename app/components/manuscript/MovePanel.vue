<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import { useManuscriptStructure, type StructureKind } from './Structure.vue'

/**
 * "Sposta": the keyboard and menu alternative to dragging. One step up or down, and for a scene
 * the chapter to move it to (for a chapter, the part), searchable.
 */
const props = defineProps<{ kind: StructureKind, id: string }>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const store = useProjectStore()
const structure = useManuscriptStructure()
// On a touch screen the keyboard would cover the list: the search waits for a tap.
const touch = useMediaQuery('(pointer: coarse)')

const scene = computed(() => (props.kind === 'scene' ? store.get('scenes', props.id) : undefined))
const chapter = computed(() => (props.kind === 'chapter' ? store.get('chapters', props.id) : undefined))

const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  if (props.kind === 'scene') return structure.chapterTargets(pick, scene.value?.chapterId)
  if (props.kind === 'chapter' && structure.usesParts.value) {
    const current = chapter.value ? structure.partOf(chapter.value) : null
    return [{
      id: 'parts',
      items: store.orderedParts.map((part, index) => ({
        id: part.id,
        prefix: structure.partNumeral(index + 1),
        label: structure.partTitle(part),
        suffix: current === part.id ? t('manuscript.actions.here') : undefined,
        disabled: current === part.id,
        onSelect: () => pick(part.id),
      })),
    }]
  }
  return []
})

const placeholder = computed(() => (props.kind === 'scene' ? t('manuscript.actions.searchChapter') : t(`manuscript.actions.searchPart.${store.kind}`)))

function step(delta: -1 | 1) {
  emit('done')
  void structure.step(props.kind, props.id, delta)
}

function pick(containerId: string) {
  emit('done')
  if (props.kind === 'part') return
  void structure.moveInto(props.kind, props.id, containerId)
}
</script>

<template>
  <div class="flex max-h-[min(28rem,70dvh)] w-full flex-col lg:w-80">
    <div class="flex shrink-0 flex-wrap gap-1 border-b border-default p-1.5">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-arrow-up"
        :label="t('common.actions.moveUp')"
        :disabled="!structure.canStep(kind, id, -1)"
        class="min-h-9 flex-1 justify-start max-lg:min-h-11"
        @click="step(-1)"
      >
        <template #trailing>
          <span class="ms-auto hidden items-center gap-0.5 lg:flex"><UKbd value="alt" /><UKbd value="arrowup" /></span>
        </template>
      </UButton>
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-arrow-down"
        :label="t('common.actions.moveDown')"
        :disabled="!structure.canStep(kind, id, 1)"
        class="min-h-9 flex-1 justify-start max-lg:min-h-11"
        @click="step(1)"
      >
        <template #trailing>
          <span class="ms-auto hidden items-center gap-0.5 lg:flex"><UKbd value="alt" /><UKbd value="arrowdown" /></span>
        </template>
      </UButton>
    </div>
    <template v-if="groups.length">
      <p class="shrink-0 px-3 pt-2.5 pb-1 text-xs font-medium text-muted">{{ t('manuscript.actions.moveInto') }}</p>
      <UCommandPalette
        :groups="groups"
        :placeholder="placeholder"
        :autofocus="!touch"
        :close="false"
        :fuse="{ resultLimit: 200 }"
        class="min-h-0 flex-1"
        :ui="{ input: '[&_input]:text-base sm:[&_input]:text-sm', itemLabelPrefix: 'tabular text-dimmed', itemLabelBase: 'voice-author', itemLabelSuffix: 'text-xs text-dimmed' }"
      />
    </template>
  </div>
</template>
