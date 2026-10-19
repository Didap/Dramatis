<script setup lang="ts">
import type { RichDoc } from '#shared/types/domain'

/**
 * A long text of the story bible (premise, fabula, setting, a note, a codex entry, a description), in
 * the author's face at the page's measure, with the phone keyboard bar. The parent saves every change
 * (patchSoon, updateProjectSoon); while the author types without a pause this also sends the queue at
 * least every ten seconds (spec 5.11).
 * - `manuscript`: the manuscript typography (pillars): size, leading and indented paragraphs of the book.
 * - `framed`: a field inside a sheet: the full frame on focus instead of the accent baseline.
 * The text is marked with the language of the work, so the browser spell checks it in that language.
 */
const props = withDefaults(defineProps<{
  modelValue: RichDoc | null | undefined
  placeholder?: string
  manuscript?: boolean
  framed?: boolean
  autofocus?: boolean
  ariaLabel?: string
}>(), { placeholder: '', manuscript: false, framed: false, autofocus: false, ariaLabel: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: RichDoc] }>()

const store = useProjectStore()
const area = ref<HTMLElement | null>(null)

let since = 0
watch(() => store.queued, (queued) => { if (!queued) since = 0 })

function onInput(doc: RichDoc) {
  emit('update:modelValue', doc)
  const now = Date.now()
  if (!since) since = now
  else if (now - since >= 10_000) {
    since = now
    void store.flush()
    void store.flushProject()
  }
}

// The editable element (created by the editor a moment after mounting) is named after its field.
function labelEditable(attempt = 0) {
  const editable = area.value?.querySelector('.ProseMirror')
  if (!editable) {
    if (attempt < 20) setTimeout(() => labelEditable(attempt + 1), 50)
    return
  }
  editable.setAttribute('aria-multiline', 'true')
  if (props.ariaLabel) editable.setAttribute('aria-label', props.ariaLabel)
}
onMounted(() => labelEditable())
watch(() => props.ariaLabel, () => labelEditable())
</script>

<template>
  <div
    ref="area"
    :lang="store.project?.language"
    class="d-long-text"
    :class="[manuscript ? 'd-long-text--manuscript' : 'd-long-text--page', framed ? 'd-long-text--framed' : '']"
  >
    <DRichText :model-value="modelValue" prose size="lg" :placeholder="placeholder" :autofocus="autofocus" @update:model-value="onInput" />
    <ArchitectureKeyboardBar :target="area" />
  </div>
</template>

<style scoped>
.d-long-text {
  max-width: calc(var(--manuscript-measure) * var(--manuscript-avg-char));
}
.d-long-text :deep(.tiptap) {
  padding-inline: 0;
  min-height: 6rem;
}
/* The editable area has no outline of its own: the baseline (or the frame) shows the focus. */
.d-long-text :deep(.ProseMirror:focus-visible) {
  outline: none;
}

/*
 * Long fields look like the page (DESIGN.md "Inputs"): a dotted baseline at rest, drawn like the
 * leader. On a page of text it turns into a solid accent rule while the author writes; a framed field
 * shows the full frame instead.
 */
.d-long-text:not(.d-long-text--framed) :deep(.d-rich-text),
.d-long-text--framed {
  background-image: radial-gradient(circle, var(--ui-border-accented) 0.75px, transparent 1px);
  background-size: 4px 4px;
  background-repeat: repeat-x;
  background-position: left bottom;
}
.d-long-text:not(.d-long-text--framed) :deep(.d-rich-text) {
  padding-bottom: 0.75rem;
}
.d-long-text:not(.d-long-text--framed) :deep(.d-rich-text:focus-within) {
  background-image: linear-gradient(var(--ui-primary), var(--ui-primary));
  background-size: 100% 2px;
}
/* Mentions are plain text with a dotted underline (DESIGN.md), not coloured labels. */
.d-long-text :deep(.mention) {
  color: inherit;
  font-weight: inherit;
}

.d-long-text--manuscript {
  font-size: var(--manuscript-size);
}
.d-long-text--manuscript :deep(.tiptap) {
  font-size: var(--manuscript-size);
  line-height: var(--manuscript-leading);
  min-height: 12rem;
}
.d-long-text--manuscript :deep(.tiptap > p) {
  margin-block: 0;
  line-height: var(--manuscript-leading);
}
.d-long-text--manuscript :deep(.tiptap > p + p) {
  text-indent: 1.5em;
}

.d-long-text--page {
  font-size: 1.0625rem;
}
.d-long-text--page :deep(.tiptap) {
  font-size: 1.0625rem;
  line-height: 1.6;
}
.d-long-text--page :deep(.tiptap > *) {
  margin-block: 0.75em;
}
.d-long-text--page :deep(.tiptap > p) {
  line-height: 1.6;
}
.d-long-text--page :deep(.tiptap > :first-child) {
  margin-top: 0;
}

.d-long-text--framed {
  max-width: none;
  padding: 0.25rem 0 0.5rem;
  transition: box-shadow 150ms var(--ease-out-expo);
}
.d-long-text--framed :deep(.tiptap) {
  min-height: 3rem;
}
.d-long-text--framed:focus-within {
  background-image: none;
  border-radius: calc(var(--ui-radius) * 2);
  box-shadow: 0 0 0 2px var(--ui-primary);
  padding-inline: 0.75rem;
  margin-inline: -0.75rem;
}

@media (max-width: 639.98px) {
  .d-long-text--manuscript,
  .d-long-text--manuscript :deep(.tiptap) {
    font-size: 1.125rem;
  }
  .d-long-text--manuscript :deep(.tiptap),
  .d-long-text--manuscript :deep(.tiptap > p) {
    line-height: calc(var(--manuscript-leading) - 0.05);
  }
}
</style>
