<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { toVariableName, typeDefault } from './ChoiceSentence.vue'

/**
 * Picks a state variable (names in mono, type beside them). Typing a name that does not exist offers
 * to create it on the spot; the new variable is a "Sì o no" until its type is changed.
 */
const props = withDefaults(defineProps<{
  modelValue: string | null | undefined
  /** The variable is in the trash: the field shows it as an error. */
  invalid?: boolean
  ariaLabel?: string
}>(), { invalid: false, ariaLabel: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: string], 'created': [id: string] }>()

const store = useProjectStore()
const { t } = useI18n()
/** On a phone the keyboard would cover the list: the search waits for a tap. */
const desktop = useMediaQuery('(min-width: 1024px)')
const { label } = useEnums()

const items = computed(() => {
  const list: { id: string, label: string, description?: string, disabled?: boolean }[] = store.rows.variables.map(v => ({ id: v.id, label: v.name, description: label('variableType', v.type) }))
  // A variable in the trash still shows as what it is, never as its id.
  if (props.modelValue && !store.get('variables', props.modelValue)) list.unshift({ id: props.modelValue, label: t('flow.text.trashedVariable'), disabled: true })
  return list
})

const value = computed({
  get: () => props.modelValue ?? undefined,
  set: (id: string | undefined) => { if (id) emit('update:modelValue', id) },
})

/** The menu closes on a pick, and once a typed name has become a variable. */
const menuOpen = ref(false)
const creating = ref(false)
async function onCreate(raw: string) {
  const name = toVariableName(raw)
  if (!name || creating.value) return
  const existing = store.rows.variables.find(v => v.name === name)
  if (existing) {
    emit('update:modelValue', existing.id)
    menuOpen.value = false
    return
  }
  creating.value = true
  try {
    const row = await store.create('variables', { name, type: 'boolean', defaultValue: typeDefault('boolean') })
    emit('update:modelValue', row.id)
    emit('created', row.id)
    menuOpen.value = false
  }
  catch {}
  finally {
    creating.value = false
  }
}
</script>

<template>
  <USelectMenu
    v-model="value"
    v-model:open="menuOpen"
    :items="items"
    value-key="id"
    label-key="label"
    :filter-fields="['label']"
    :placeholder="t('flow.rules.pickVariable')"
    :aria-label="ariaLabel ?? t('flow.rules.variable')"
    :search-input="{ placeholder: t('flow.rules.searchVariable'), autofocus: desktop }"
    :create-item="{ position: 'bottom', when: 'empty' }"
    :loading="creating"
    :color="invalid ? 'error' : 'primary'"
    :highlight="invalid"
    :ui="{ value: 'font-mono', itemLabel: 'font-mono', content: 'min-w-60' }"
    class="w-full min-w-0 max-lg:h-11"
    @create="onCreate"
  >
    <template #item-label="{ item }">
      <span class="font-mono text-highlighted">{{ item.label }}</span>
    </template>
    <template #create-item-label="{ item }">
      {{ t('flow.rules.createVariable', { name: toVariableName(String(item)) || String(item) }) }}
    </template>
    <template #empty>
      <span class="text-sm text-muted">{{ t('flow.rules.noVariables') }}</span>
    </template>
  </USelectMenu>
</template>
