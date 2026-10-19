<script setup lang="ts">
/**
 * An interview answer: plain text in the author's voice that grows with what is written, a dotted
 * baseline at rest and the accent frame on focus, like the free text (DESIGN.md "Inputs", long
 * fields). While it has the focus it keeps what is being typed; a value changed elsewhere is taken
 * when the author leaves the field.
 */
const props = defineProps<{ modelValue: string, lang?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const el = useTemplateRef<HTMLTextAreaElement>('el')
const draft = ref(props.modelValue)
const focused = ref(false)

watch(() => props.modelValue, (value) => {
  if (!focused.value && value !== draft.value) draft.value = value
})

function resize() {
  const area = el.value
  if (!area) return
  area.style.height = 'auto'
  area.style.height = `${area.scrollHeight}px`
}

watch(draft, () => nextTick(resize))
onMounted(resize)

// A narrower column wraps more lines: measure again when the width changes.
let width = 0
useResizeObserver(el, (entries) => {
  const next = Math.round(entries[0]?.contentRect.width ?? 0)
  if (next !== width) {
    width = next
    resize()
  }
})

function onInput(event: Event) {
  draft.value = (event.target as HTMLTextAreaElement).value
  emit('update:modelValue', draft.value)
}

function onBlur() {
  focused.value = false
  if (props.modelValue !== draft.value) draft.value = props.modelValue
}
</script>

<template>
  <textarea
    ref="el"
    :value="draft"
    rows="1"
    :lang="lang"
    spellcheck="true"
    maxlength="20000"
    class="voice-author -mx-2 block w-[calc(100%+1rem)] resize-none overflow-hidden rounded-[4.5px] border-b border-dotted border-(--ui-border-accented) bg-transparent px-2 py-1.5 text-[1.0625rem] leading-relaxed text-default transition-colors duration-150 focus:border-transparent focus:outline-2 focus:outline-offset-2 focus:outline-(--ui-primary)"
    @input="onInput"
    @focus="focused = true"
    @blur="onBlur"
  />
</template>
