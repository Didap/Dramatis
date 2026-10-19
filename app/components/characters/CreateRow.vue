<script setup lang="ts">
import type { CharacterImportance } from '#shared/types/domain'
import type { Character } from '#shared/types/entities'

/**
 * "Nuovo personaggio" inline (spec 5.2): the name focused, importance preselected (main while the
 * project has none). Enter creates the character with status to do; Esc gives up. A name already
 * in use is allowed, and said.
 */
const props = defineProps<{ importance: CharacterImportance }>()
const emit = defineEmits<{ cancel: [], created: [character: Character] }>()

const store = useProjectStore()
const { t } = useI18n()
const { options } = useEnums()

const name = ref('')
const importance = ref<CharacterImportance>(props.importance)
const busy = ref(false)
const duplicateId = useId()

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase()
const duplicate = computed(() => {
  const wanted = fold(name.value)
  return wanted ? store.rows.characters.find(c => fold(c.name) === wanted) : undefined
})

async function submit() {
  const value = name.value.trim()
  if (!value || busy.value) return
  busy.value = true
  try {
    const row = await store.create('characters', { name: value.slice(0, 200), importance: importance.value, status: 'todo' })
    emit('created', row)
  }
  catch {
    // The store has already said what went wrong; the row stays open with the name.
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <form
    class="rounded-[calc(var(--ui-radius)*2)] bg-elevated/60 p-2"
    :aria-label="t('characters.list.new')"
    @submit.prevent="submit"
    @keydown.esc.prevent="emit('cancel')"
  >
    <div class="flex flex-wrap items-center gap-2">
      <DEntityAvatar :name="name || '·'" size="sm" class="hidden sm:inline-grid" />
      <UInput
        v-model="name"
        autofocus
        :maxlength="200"
        :placeholder="t('characters.create.name')"
        :aria-label="t('characters.create.name')"
        :aria-describedby="duplicate ? duplicateId : undefined"
        class="min-w-0 flex-1 basis-52"
        :ui="{ base: 'voice-author font-semibold placeholder:font-sans placeholder:font-normal pointer-coarse:min-h-11' }"
      />
      <USelect
        v-model="importance"
        :items="options('importance')"
        :aria-label="t('characters.create.importance')"
        class="w-40"
        :ui="{ base: 'pointer-coarse:min-h-11' }"
      />
      <div class="flex items-center gap-1">
        <UButton type="submit" color="neutral" variant="outline" class="pointer-coarse:min-h-11" :loading="busy" :disabled="!name.trim()" :label="t('characters.create.submit')" />
        <UButton color="neutral" variant="ghost" class="pointer-coarse:min-h-11" :label="t('common.actions.cancel')" @click="emit('cancel')" />
      </div>
    </div>
    <p v-if="duplicate" :id="duplicateId" class="mt-1.5 flex items-center gap-1.5 ps-1 text-sm text-warning sm:ps-9">
      <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />
      {{ t('characters.create.duplicate', { name: duplicate.name }) }}
    </p>
  </form>
</template>
