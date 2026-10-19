<script setup lang="ts">
/** Text with the matched ranges marked (search results); plain text, never HTML. */
const props = defineProps<{
  text: string
  /** [start, end) ranges inside `text`. */
  marks?: [number, number][]
}>()

const pieces = computed(() => {
  const out: { text: string, mark: boolean }[] = []
  let at = 0
  for (const [start, end] of [...(props.marks ?? [])].sort((a, b) => a[0] - b[0])) {
    if (start < at || end > props.text.length || end <= start) continue
    if (start > at) out.push({ text: props.text.slice(at, start), mark: false })
    out.push({ text: props.text.slice(start, end), mark: true })
    at = end
  }
  if (at < props.text.length) out.push({ text: props.text.slice(at), mark: false })
  return out
})
</script>

<template>
  <span><template v-for="(piece, i) in pieces" :key="i"><mark v-if="piece.mark" class="rounded-[2px] bg-(--ui-selection) px-px text-highlighted">{{ piece.text }}</mark><template v-else>{{ piece.text }}</template></template></span>
</template>
