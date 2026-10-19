<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'

/**
 * "Solo dialoghi" (P1): the scene's lines alone, as a script, to read an exchange through or to check
 * it before the recording. Read only; a line opens the text right there.
 */
const props = defineProps<{ editor: Editor }>()
const emit = defineEmits<{ open: [pos: number], close: [] }>()

const store = useProjectStore()
const { t } = useI18n()
const { number, words } = useFormat()

interface Line {
  pos: number
  speaker: string
  free: boolean
  direction: string
  text: string
  lineId: string | null
}

// The editor is hidden while this view is open, so its text does not change under it.
const lines: Line[] = []
props.editor.state.doc.descendants((node, pos) => {
  if (node.type.name !== 'dialogueLine') return
  const character = store.get('characters', node.attrs.speakerId)
  lines.push({
    pos,
    speaker: character?.name ?? String(node.attrs.speakerName ?? ''),
    free: !character,
    direction: String(node.attrs.direction ?? ''),
    text: node.textContent,
    lineId: node.attrs.lineId ?? null,
  })
  return false
})

const speakers = (() => {
  const byName = new Map<string, { lines: number, words: number }>()
  for (const line of lines) {
    const entry = byName.get(line.speaker || '?') ?? { lines: 0, words: 0 }
    entry.lines++
    entry.words += line.text.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length
    byName.set(line.speaker || '?', entry)
  }
  return [...byName.entries()].map(([name, n]) => ({ name, ...n })).sort((a, b) => b.lines - a.lines)
})()

defineShortcuts({ escape: () => emit('close') })
</script>

<template>
  <section :aria-label="t('editor.lines.title')">
    <div class="sticky top-(--d-header) z-10 -mx-4 mb-8 space-y-2 border-b border-default bg-default px-4 py-3 sm:-mx-6 sm:px-6">
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-message-square-text" class="size-4 shrink-0 text-muted" aria-hidden="true" />
        <p class="min-w-0 flex-1 text-sm text-default">{{ t('editor.lines.count', { n: number(lines.length) }, lines.length) }}</p>
        <UButton size="sm" variant="outline" icon="i-lucide-text" :label="t('editor.lines.showAll')" @click="emit('close')" />
      </div>
      <ul v-if="speakers.length" class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" :aria-label="t('editor.lines.bySpeaker')">
        <li v-for="speaker in speakers" :key="speaker.name">
          <span class="voice-author text-toned">{{ speaker.name }}</span>
          <span class="tabular ps-1">{{ t('editor.lines.speakerCount', { n: number(speaker.lines), words: words(speaker.words) }, speaker.lines) }}</span>
        </li>
      </ul>
    </div>

    <ol v-if="lines.length" class="d-manuscript-text space-y-1">
      <li v-for="line in lines" :key="line.pos">
        <button
          type="button"
          class="d-line-view group w-full rounded-[calc(var(--ui-radius)*1.5)] py-1 pe-2 text-start outline-none hover:bg-elevated/60 focus-visible:bg-elevated"
          :aria-label="t('editor.lines.open', { speaker: line.speaker || t('editor.line.speakerPlaceholder'), text: line.text })"
          @click="emit('open', line.pos)"
        >
          <span class="d-line-view__speaker" :class="line.free ? 'underline decoration-dotted underline-offset-4' : ''">{{ line.speaker || '?' }}</span>
          <span v-if="line.direction" class="d-line-view__direction">({{ line.direction }})</span>
          <span>{{ line.text }}</span>
          <span v-if="line.lineId" class="ms-3 font-mono text-xs text-dimmed">{{ line.lineId }}</span>
        </button>
      </li>
    </ol>
    <p v-else class="text-sm text-muted">{{ t('editor.lines.empty') }}</p>
  </section>
</template>
