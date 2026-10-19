<script setup lang="ts">
import type { RichDoc } from '#shared/types/domain'

/**
 * A long text of a world sheet (description, traditions, notes...) under its heading. It looks like
 * the page (DESIGN.md "Inputs"): the author's face, growing with the text, a dotted baseline at rest
 * and the full frame while writing. Typing @ mentions a character, a group, a place or an object.
 */
defineProps<{
  title: string
  modelValue: RichDoc | null | undefined
  placeholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: RichDoc] }>()
</script>

<template>
  <WorldSection :title="title">
    <div class="d-long-text -mx-3 px-3 py-2">
      <DRichText
        :model-value="modelValue"
        :placeholder="placeholder"
        :aria-label="title"
        prose
        @update:model-value="(value: RichDoc) => emit('update:modelValue', value)"
      />
    </div>
  </WorldSection>
</template>

<style scoped>
.d-long-text {
  border-radius: calc(var(--ui-radius) * 2);
  background-image: radial-gradient(circle, var(--ui-border-accented) 0.75px, transparent 1px);
  background-size: 4px 4px;
  background-repeat: repeat-x;
  background-position: left bottom;
  transition: box-shadow 150ms var(--ease-out-expo);
}
.d-long-text:focus-within {
  background-image: none;
  box-shadow:
    0 0 0 1px var(--ui-border-accented),
    0 0 0 3px color-mix(in oklab, var(--ui-primary) 40%, transparent);
}
/*
 * UEditor's base classes pad the text (sm:px-8), space paragraphs for a document (my-5) and paint
 * mentions in the accent: here the text sits under its heading and mentions stay plain (DESIGN.md).
 */
.d-long-text :deep(.tiptap) {
  padding-inline: 0;
}
.d-long-text :deep(.tiptap > *) {
  margin-block: 0.75rem;
}
.d-long-text :deep(.tiptap > :first-child) {
  margin-top: 0;
}
.d-long-text :deep(.tiptap > :last-child) {
  margin-bottom: 0;
}
.d-long-text :deep(.tiptap .mention) {
  color: inherit;
  font-weight: inherit;
}
/*
 * The placeholder only in an empty field, and taking its own height: UEditor floats it with no
 * height, so a placeholder that wraps (on a phone) would run over the baseline.
 */
.d-long-text :deep(.tiptap .is-empty::before) {
  content: none;
}
.d-long-text :deep(.tiptap > p.is-editor-empty:first-child::after) {
  content: attr(data-placeholder);
  display: block;
  margin-top: -1lh;
  color: var(--ui-text-dimmed);
  pointer-events: none;
}
</style>
