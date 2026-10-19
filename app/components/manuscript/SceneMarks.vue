<script setup lang="ts">
/** The flow marks of a game scene (module branching): Inizio, Finale with its label, Irraggiungibile. */
defineProps<{
  start?: boolean
  ending?: boolean
  endingLabel?: string
  unreachable?: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <span v-if="start" class="inline-flex items-center gap-1 text-xs font-medium text-toned" :title="t('manuscript.scene.startHint')">
    <UIcon name="i-lucide-play" class="size-3.5 text-primary" aria-hidden="true" />{{ t('manuscript.scene.start') }}
  </span>
  <span v-if="ending" class="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-toned">
    <UIcon name="i-lucide-flag" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
    <span class="shrink-0">{{ t('manuscript.scene.ending') }}</span>
    <!-- The ending's own label is the author's words. -->
    <span v-if="endingLabel?.trim()" class="voice-author truncate font-normal text-muted italic sm:max-w-[11rem]"><span aria-hidden="true">· </span>{{ endingLabel }}</span>
  </span>
  <span v-if="unreachable" class="inline-flex items-center gap-1 text-xs font-medium text-warning" :title="t('manuscript.scene.unreachableHint')">
    <UIcon name="i-lucide-unlink" class="size-3.5" aria-hidden="true" />{{ t('manuscript.scene.unreachable') }}
  </span>
</template>
