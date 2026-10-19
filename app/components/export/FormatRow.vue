<script setup lang="ts">
/**
 * One format of the export page: a row with a native radio (every row of the page shares the same name,
 * so the arrow keys move through all of them), the format and one line on what it is for. The chosen
 * row opens below with its options and the page's one solid button. The whole row is the label; the
 * radio is named by the format alone and described by the line, so a screen reader says each once.
 */
const props = withDefaults(defineProps<{
  value: string
  name: string
  label: string
  hint?: string
  disabled?: boolean
}>(), { hint: undefined, disabled: false })

const model = defineModel<string>({ required: true })
const selected = computed(() => model.value === props.value)
const id = useId()
</script>

<template>
  <div class="export-format rounded-[calc(var(--ui-radius)*2)] transition-colors duration-150" :class="selected ? 'bg-elevated/60' : ''">
    <label
      :for="id"
      class="group flex min-h-11 items-start gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-2.5 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--ui-primary)"
      :class="disabled ? 'cursor-not-allowed' : selected ? 'cursor-default' : 'cursor-pointer hover:bg-elevated'"
    >
      <input
        :id="id"
        v-model="model"
        type="radio"
        class="peer sr-only"
        :name="name"
        :value="value"
        :disabled="disabled"
        :aria-labelledby="`${id}-label`"
        :aria-describedby="hint ? `${id}-hint` : undefined"
      >
      <span
        aria-hidden="true"
        class="mt-0.5 size-4 shrink-0 rounded-full border border-(--ui-border-accented) bg-default transition-[border-width,border-color] duration-150 peer-checked:border-[5px] peer-checked:border-(--ui-primary) peer-disabled:opacity-50"
      />
      <span class="min-w-0 flex-1" :class="disabled ? 'opacity-60' : ''">
        <span :id="`${id}-label`" class="block text-sm font-medium text-highlighted">{{ label }}</span>
        <span v-if="hint" :id="`${id}-hint`" class="mt-0.5 block text-sm text-pretty text-muted">{{ hint }}</span>
      </span>
    </label>
    <div v-if="selected && $slots.default" class="px-2 pb-4 pt-1 sm:ps-9">
      <slot />
    </div>
  </div>
</template>
