<script lang="ts">
/** The model value of a scene that will be created on save. */
export const NEW_SCENE = '__new__'
</script>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
/**
 * Picks a scene by title or code, with its chapter beside it (spec 5.5, "Porta a"). With
 * `creatable`, a title that matches nothing becomes "Nuova scena «...»": the model turns into
 * NEW_SCENE and `newTitle` holds the title; the caller creates the scene when the form is saved.
 * A scene in the trash still shows as what it is, never as its id. The field is named by the label
 * of its UFormField (or by its own text); pass `ariaLabel` only where there is neither.
 */
const props = withDefaults(defineProps<{
  modelValue: string | null
  newTitle?: string | null
  creatable?: boolean
  placeholder?: string
  ariaLabel?: string
  invalid?: boolean
}>(), { newTitle: null, creatable: false, placeholder: undefined, ariaLabel: undefined, invalid: false })

const emit = defineEmits<{ 'update:modelValue': [value: string | null], 'update:newTitle': [value: string | null] }>()

const store = useProjectStore()
const { t } = useI18n()
/** On a phone the keyboard would cover the list: the search waits for a tap. */
const desktop = useMediaQuery('(min-width: 1024px)')

interface SceneItem {
  id: string
  label: string
  code: string
  chapter: string
  description: string
  icon?: string
  disabled?: boolean
}

/** The model is a scene in the trash (a choice whose target was trashed). */
const trashed = computed(() => !!props.modelValue && props.modelValue !== NEW_SCENE && !store.get('scenes', props.modelValue))

const items = computed<SceneItem[]>(() => {
  const list: SceneItem[] = store.orderedScenes.map((scene) => {
    const chapter = store.get('chapters', scene.chapterId)?.title || t('common.untitled.chapter')
    return {
      id: scene.id,
      label: scene.title || t('common.untitled.scene'),
      code: scene.code,
      chapter,
      description: chapter,
      icon: store.modules.scene_kinds ? SCENE_KIND_ICONS[scene.kind] : undefined,
    }
  })
  if (props.newTitle) list.unshift({ id: NEW_SCENE, label: props.newTitle, code: '', chapter: '', description: t('flow.picker.newSceneHint'), icon: 'i-lucide-plus' })
  else if (trashed.value) {
    list.unshift({ id: props.modelValue!, label: t('flow.text.trashedScene'), code: '', chapter: '', description: '', icon: 'i-lucide-trash-2', disabled: true })
  }
  return list
})

const value = computed({
  get: () => props.modelValue ?? undefined,
  set: (id: string | undefined) => {
    emit('update:modelValue', id ?? null)
    if (id !== NEW_SCENE) emit('update:newTitle', null)
  },
})

/** The menu closes on a pick, and on "Nuova scena «...»" too (it would keep the focus otherwise). */
const menuOpen = ref(false)

function onCreate(title: string) {
  const clean = title.trim().slice(0, 200)
  if (!clean) return
  emit('update:newTitle', clean)
  emit('update:modelValue', NEW_SCENE)
  menuOpen.value = false
}
</script>

<template>
  <USelectMenu
    v-model="value"
    v-model:open="menuOpen"
    :items="items"
    value-key="id"
    label-key="label"
    :filter-fields="['label', 'code', 'chapter']"
    :placeholder="placeholder ?? t('flow.picker.placeholder')"
    :aria-label="ariaLabel"
    :search-input="{ placeholder: t('flow.picker.search'), autofocus: desktop }"
    :create-item="creatable ? { position: 'bottom', when: 'always' } : false"
    :color="invalid ? 'error' : 'primary'"
    :highlight="invalid"
    :aria-invalid="invalid || undefined"
    :ui="{ value: trashed ? 'text-muted' : 'voice-author', content: 'min-w-72' }"
    class="w-full min-w-0 max-lg:h-11"
    @create="onCreate"
  >
    <template #item-label="{ item }">
      <span class="flex min-w-0 items-baseline gap-2">
        <span v-if="item.code" class="shrink-0 font-mono text-xs text-dimmed">{{ item.code }}</span>
        <span class="truncate" :class="item.disabled ? 'text-muted' : 'voice-author text-highlighted'">{{ item.label }}</span>
      </span>
    </template>
    <template #create-item-label="{ item }">
      {{ t('flow.picker.newScene', { title: item }) }}
    </template>
    <template #empty="{ searchTerm }">
      <span class="text-sm text-muted">{{ searchTerm ? t('flow.picker.noMatch') : t('flow.picker.noScenes') }}</span>
    </template>
  </USelectMenu>
</template>
