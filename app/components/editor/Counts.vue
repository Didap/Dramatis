<script setup lang="ts">
/** The counts of the scene, each name joined to its number by the leader. */
const props = defineProps<{
  words: number
  chars: number
  charsNoSpaces: number
  /** Words selected, 0 without a selection. */
  selection: number
  /** Words added (or removed) since the scene was opened. */
  session: number
  /** Words written today in the project, as the writing log counts them. */
  today: number
}>()

const { t } = useI18n()
const { number } = useFormat()

/** +412, −30 (a real minus sign), 0. */
const signed = (n: number) => (n > 0 ? `+${number(n)}` : n < 0 ? `−${number(-n)}` : number(0))

const rows = computed(() => [
  { key: 'words', label: t('editor.counts.words'), value: number(props.words) },
  ...(props.selection ? [{ key: 'selection', label: t('editor.counts.selection'), value: number(props.selection) }] : []),
  { key: 'chars', label: t('editor.counts.chars'), value: number(props.chars) },
  { key: 'charsNoSpaces', label: t('editor.counts.charsNoSpaces'), value: number(props.charsNoSpaces) },
  { key: 'session', label: t('editor.counts.session'), value: signed(props.session) },
  { key: 'today', label: t('editor.counts.today'), value: number(props.today) },
])
</script>

<template>
  <ul class="space-y-1.5" :aria-label="t('editor.counts.title')">
    <li v-for="row in rows" :key="row.key" class="group flex items-baseline gap-3 text-sm">
      <span class="text-default">{{ row.label }}</span>
      <DLeader />
      <span class="tabular text-highlighted">{{ row.value }}</span>
    </li>
  </ul>
</template>
