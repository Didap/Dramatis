<script setup lang="ts">
import type { DurationUnit } from '#shared/types/domain'
import type { SceneDatePatch } from './timeline-model'

/**
 * Gives a scene its place in story time, inline (spec 4.5): the date, the date as written in the story,
 * the duration. Everything goes out together, so the scene moves along the timeline only once; the
 * page saves it (the scene, and this editor with it, may move elsewhere on the page). After a save
 * that failed, the page opens it again on what the author had typed (`initial`).
 */
const props = withDefaults(defineProps<{
  sceneId: string
  /** A date to start from when the scene has none (the scene before it, usually). */
  suggest?: string | null
  initial?: SceneDatePatch | null
}>(), { suggest: null, initial: null })
const emit = defineEmits<{ save: [patch: SceneDatePatch], cancel: [] }>()

const store = useProjectStore()
const { t } = useI18n()
const scene = computed(() => store.get('scenes', props.sceneId))

const start = { ...scene.value, ...props.initial }
const at = ref<string | null>(start.storyAt ?? null)
const valid = ref(true)
const label = ref(start.storyTimeLabel ?? '')
const durationValue = ref<number | null>(start.durationValue ?? null)
const durationUnit = ref<DurationUnit | null>(start.durationUnit ?? null)
const strict = ref(false)
const root = ref<HTMLElement | null>(null)

onMounted(() => {
  // Straight to the first field, selected: the author came here to type a date over the suggested one.
  const input = root.value?.querySelector<HTMLInputElement>('input')
  if (input) {
    input.focus()
    input.select()
  }
  else root.value?.querySelector<HTMLElement>('button')?.focus()
})

function save() {
  if (!scene.value) return
  if (!valid.value) {
    strict.value = true
    root.value?.querySelector<HTMLElement>('[aria-invalid="true"], input')?.focus()
    return
  }
  emit('save', {
    storyAt: at.value,
    storyTimeLabel: label.value.trim(),
    durationValue: durationValue.value,
    durationUnit: durationValue.value === null ? null : durationUnit.value,
  })
}
</script>

<template>
  <form
    ref="root"
    class="@container relative mt-2 space-y-4 rounded-[calc(var(--ui-radius)*2)] bg-muted px-3 py-3 sm:px-4"
    :aria-label="t('timeline.dating.formLabel', { title: scene?.title || t('common.untitled.scene') })"
    @submit.prevent="save"
    @keydown.esc.stop.prevent="emit('cancel')"
  >
    <TimelineStoryTimeField
      v-model="at"
      v-model:valid="valid"
      :suggest="suggest"
      :strict="strict"
      start="day"
    />
    <div class="grid gap-4 @xl:grid-cols-[minmax(0,1fr)_auto]">
      <UFormField :label="t('timeline.when.label')">
        <UInput
          v-model="label"
          :maxlength="120"
          :placeholder="t('timeline.when.labelPlaceholder')"
          class="w-full"
          :ui="{ base: 'voice-author text-base max-lg:min-h-11' }"
        />
      </UFormField>
      <TimelineDurationField v-model:value="durationValue" v-model:unit="durationUnit" />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <UButton type="submit" color="primary" variant="subtle" class="max-lg:min-h-11" :label="t('timeline.dating.save')" />
      <UButton color="neutral" variant="ghost" class="max-lg:min-h-11" :label="t('common.actions.cancel')" @click="emit('cancel')" />
    </div>
  </form>
</template>
