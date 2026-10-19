<script setup lang="ts">
import type { Scene } from '#shared/types/entities'
import { SCENE_STATUSES } from '#shared/utils/constants'
import { STATUS_TEXT } from './Structure.vue'

/** "3 pianificate · 2 bozze · 4 riviste · 5 definitive", each count with its status glyph. */
const props = defineProps<{ scenes: readonly Pick<Scene, 'status'>[] }>()
const { t } = useI18n()
const { number } = useFormat()

const counts = computed(() => SCENE_STATUSES
  .map(status => ({ status, n: props.scenes.filter(s => s.status === status).length }))
  .filter(c => c.n > 0))
</script>

<template>
  <span v-if="counts.length" class="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
    <span v-for="c in counts" :key="c.status" class="inline-flex items-center gap-1">
      <UIcon :name="statusIcon('scene', c.status)" class="size-3.5 shrink-0" :class="STATUS_TEXT[c.status]" aria-hidden="true" />
      <ManuscriptFigures :text="t(`manuscript.statusCount.${c.status}`, { n: number(c.n) }, c.n)" />
    </span>
  </span>
</template>
