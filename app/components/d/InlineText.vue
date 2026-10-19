<script setup lang="ts">
/**
 * Text that edits in place (a name, a title). Looks like text, behaves like an input.
 * Emits every change (use store.patchSoon) and `commit` on Enter or blur.
 * With `required`, an empty value reverts to the last one.
 */
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  required?: boolean
  /** Visual size, from page title to small label. */
  variant?: 'title' | 'heading' | 'body' | 'small'
  maxlength?: number
  ariaLabel?: string
  multiline?: boolean
}>(), { placeholder: '', required: false, variant: 'body', maxlength: 300, ariaLabel: undefined, multiline: false })

const emit = defineEmits<{ 'update:modelValue': [value: string], 'commit': [value: string] }>()

const draft = ref(props.modelValue)
let lastGood = props.modelValue
/**
 * While the field has focus the author's draft wins: the saved value comes back trimmed
 * ("San " after a pause), and overwriting the draft would eat the space being typed.
 * The field resyncs when it loses focus.
 */
const focused = ref(false)
let atFocus = props.modelValue
function onFocus() {
  focused.value = true
  atFocus = props.modelValue
}
watch(() => props.modelValue, (v) => {
  if (v.trim()) lastGood = v
  if (focused.value) return
  if (v !== draft.value) draft.value = v
})

const area = ref<HTMLTextAreaElement | null>(null)

/** Grows the multi-line field with its text (CSS field-sizing is not everywhere yet). */
function autosize() {
  const el = area.value
  if (!el || (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content'))) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
onMounted(autosize)
watch(draft, () => nextTick(autosize))

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  draft.value = value
  if (!props.required || value.trim()) emit('update:modelValue', value)
}

function commit() {
  focused.value = false
  if (props.required && !draft.value.trim()) {
    draft.value = lastGood
    emit('update:modelValue', lastGood)
  }
  else if (draft.value !== draft.value.trim()) {
    // The saved value is trimmed: say so now, so field and store agree.
    draft.value = draft.value.trim()
    emit('update:modelValue', draft.value)
  }
  else if (props.modelValue !== draft.value && props.modelValue.trim() !== draft.value) {
    // Something else changed the value while the field had focus (another device): show it.
    draft.value = props.modelValue
  }
  emit('commit', draft.value.trim())
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !(props.multiline && event.shiftKey)) {
    event.preventDefault()
    ;(event.target as HTMLElement).blur()
  }
  if (event.key === 'Escape') {
    draft.value = atFocus
    emit('update:modelValue', atFocus)
    ;(event.target as HTMLElement).blur()
  }
}

const classes = computed(() => ({
  title: 'text-2xl font-semibold tracking-tight text-highlighted',
  heading: 'text-lg font-semibold text-highlighted',
  body: 'text-base text-default',
  small: 'text-sm text-toned',
}[props.variant]))
</script>

<template>
  <textarea
    v-if="multiline"
    ref="area"
    :value="draft"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :aria-label="ariaLabel ?? placeholder"
    rows="1"
    class="d-inline-text field-sizing-content w-full resize-none rounded-md bg-transparent px-1 -mx-1 outline-none placeholder:text-dimmed hover:bg-elevated/60 focus-visible:bg-elevated focus-visible:ring-2 focus-visible:ring-(--ui-primary)/40"
    :class="classes"
    @input="onInput"
    @focus="onFocus"
    @blur="commit"
    @keydown="onKeydown"
  />
  <input
    v-else
    :value="draft"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :aria-label="ariaLabel ?? placeholder"
    type="text"
    class="d-inline-text w-full min-w-0 rounded-md bg-transparent px-1 -mx-1 outline-none placeholder:text-dimmed hover:bg-elevated/60 focus-visible:bg-elevated focus-visible:ring-2 focus-visible:ring-(--ui-primary)/40"
    :class="classes"
    @input="onInput"
    @focus="onFocus"
    @blur="commit"
    @keydown="onKeydown"
  >
</template>
