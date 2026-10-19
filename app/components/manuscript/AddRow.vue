<script setup lang="ts">
/**
 * "+ Nuova scena" at the end of a list: a quiet button that becomes a title field. Enter creates the
 * item and keeps the field open for the next one, so an outline can be typed in one go; Esc closes.
 * A title typed and left behind (the field loses focus) is created, not lost.
 */
const props = defineProps<{
  label: string
  placeholder: string
  /** Creates the item; the field waits for it before taking the next title. */
  create: (title: string) => Promise<unknown>
}>()

const { t } = useI18n()
const editing = ref(false)
const draft = ref('')
const busy = ref(false)
const input = ref<{ inputRef?: HTMLInputElement | null } | null>(null)

const focusInput = () => nextTick(() => input.value?.inputRef?.focus())

function start() {
  editing.value = true
  void focusInput()
}

async function submit(next: boolean) {
  if (busy.value) return
  busy.value = true
  try {
    await props.create(draft.value.trim())
    draft.value = ''
  }
  catch {
    // The store has already said what went wrong; the title stays in the field.
    return
  }
  finally {
    busy.value = false
  }
  if (next) void focusInput()
  else close()
}

function close() {
  editing.value = false
  draft.value = ''
}

function onBlur() {
  if (busy.value) return
  if (draft.value.trim()) void submit(false)
  else close()
}

defineExpose({ start })
</script>

<template>
  <div class="manuscript-add-row">
    <UButton
      v-if="!editing"
      icon="i-lucide-plus"
      :label="label"
      color="neutral"
      variant="ghost"
      size="sm"
      class="text-muted max-lg:min-h-11"
      @click="start"
    />
    <form v-else class="flex items-center gap-3 py-1" @submit.prevent="submit(true)">
      <UInput
        ref="input"
        v-model="draft"
        :placeholder="placeholder"
        :aria-label="placeholder"
        :loading="busy"
        size="sm"
        :maxlength="300"
        class="min-w-0 flex-1 sm:max-w-md"
        :ui="{ base: 'voice-author max-sm:text-base' }"
        @keydown.esc.prevent="close"
        @blur="onBlur"
      />
      <span class="hidden shrink-0 text-xs text-dimmed sm:inline">{{ t('manuscript.actions.createHint') }}</span>
    </form>
  </div>
</template>
