<script lang="ts">
import { isEmptyDoc } from '#shared/utils/richtext'
import type { RichDoc } from '#shared/types/domain'

/** The document with its keys sorted: jsonb hands documents back with their keys reordered. */
function canonical(doc: RichDoc | null | undefined): string {
  if (isEmptyDoc(doc)) return ''
  return JSON.stringify(doc, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value,
  )
}

/** true when two copies of a document hold the same text (an empty document equals none). */
export function sameDoc(a: RichDoc | null | undefined, b: RichDoc | null | undefined): boolean {
  return canonical(a) === canonical(b)
}
</script>

<script setup lang="ts">
/**
 * DRichText bound to a stored text (description, notes, a free-text profile section), set like the
 * page: the author's face, a dotted baseline at rest, the frame on focus. The parent saves each
 * change (saving.ts: a second after the last keystroke, at least every ten seconds while typing).
 * The editor only receives a value that differs in substance from what it shows, so a save coming
 * back (jsonb reorders the keys) never resets the text and the cursor under the author, and only real
 * edits go up.
 */
const props = withDefaults(defineProps<{
  modelValue: RichDoc | null | undefined
  placeholder?: string
  ariaLabel?: string
}>(), { placeholder: '', ariaLabel: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: RichDoc] }>()

const area = useTemplateRef<HTMLElement>('area')

const shown = shallowRef(props.modelValue)

watch(() => props.modelValue, (value) => {
  if (!sameDoc(value, shown.value)) shown.value = value
})

function onUpdate(doc: RichDoc) {
  const changed = !sameDoc(doc, props.modelValue)
  shown.value = doc
  if (changed) emit('update:modelValue', doc)
}

// The editable element is a multi-line text box named after its field, once the editor has mounted it.
function label(): boolean {
  const editable = area.value?.querySelector('.ProseMirror')
  if (!editable) return false
  editable.setAttribute('role', 'textbox')
  editable.setAttribute('aria-multiline', 'true')
  if (props.ariaLabel) editable.setAttribute('aria-label', props.ariaLabel)
  return true
}
const { stop } = useMutationObserver(area, () => { if (label()) stop() }, { childList: true, subtree: true })
onMounted(() => { if (label()) stop() })
watch(() => props.ariaLabel, label)
</script>

<template>
  <div
    ref="area"
    class="characters-rich-field -mx-2 rounded-[4.5px] border-b border-dotted border-(--ui-border-accented) px-2 py-1.5 transition-colors duration-150 focus-within:border-transparent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--ui-primary)"
  >
    <DRichText :model-value="shown" prose :placeholder="placeholder" @update:model-value="onUpdate" />
  </div>
</template>

<style scoped>
.characters-rich-field :deep(.tiptap) {
  min-height: 1.6em;
}
</style>
