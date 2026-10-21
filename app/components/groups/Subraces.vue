<script setup lang="ts">
import type { RichDoc, Subrace } from '#shared/types/domain'

/**
 * The subraces of a race described freely (VRS-565): a name and a description each, in the order they
 * were added, with "Aggiungi sottorazza" below. Removing one asks nothing and offers undo, which puts
 * it back where it was in the list as it is now.
 */
const props = defineProps<{ groupId: string }>()

const store = useProjectStore()
const toast = useToast()
const { t } = useI18n()

const group = computed(() => store.get('groups', props.groupId))
const subraces = computed<Subrace[]>(() => group.value?.subraces ?? [])
const nameOf = (subrace: Subrace) => subrace.name.trim() || t('groups.race.subraceUntitled')
const root = ref<HTMLElement | null>(null)

function save(next: Subrace[], soon = false) {
  if (soon) store.patchSoon('groups', props.groupId, { subraces: next })
  else store.update('groups', props.groupId, { subraces: next }).catch(() => {})
}

function change(id: string, patch: Partial<Subrace>) {
  save(subraces.value.map(s => (s.id === id ? { ...s, ...patch } : s)), true)
}

function add() {
  const subrace: Subrace = { id: crypto.randomUUID(), name: '', description: null }
  save([...subraces.value, subrace])
  nextTick(() => root.value?.querySelector<HTMLElement>(`[data-subrace="${subrace.id}"] input, [data-subrace="${subrace.id}"] textarea`)?.focus())
}

function remove(subrace: Subrace) {
  const list = subraces.value
  const index = list.findIndex(s => s.id === subrace.id)
  const previous = list[index - 1]?.id ?? null
  const groupId = props.groupId
  save(list.filter(s => s.id !== subrace.id))
  toast.add({
    title: t('groups.race.subraceRemoved', { name: nameOf(subrace) }),
    icon: 'i-lucide-trash-2',
    actions: [{ label: t('common.actions.undo'), onClick: () => putBack(groupId, subrace, previous, index) }],
  })
  // The focus goes to the next subrace, or to the one before, or to "Aggiungi sottorazza".
  const next = list[index + 1]?.id ?? previous
  nextTick(() => (root.value?.querySelector<HTMLElement>(next ? `[data-subrace="${next}"] [data-subrace-remove]` : '[data-subrace-add]'))?.focus())
}

/** Undo: the subrace comes back after the one that preceded it (or where it was), into the list as it is now. */
function putBack(groupId: string, subrace: Subrace, previous: string | null, index: number) {
  const list = [...(store.get('groups', groupId)?.subraces ?? [])]
  if (list.some(s => s.id === subrace.id)) return
  const after = previous ? list.findIndex(s => s.id === previous) : -1
  list.splice(after >= 0 ? after + 1 : Math.min(index, list.length), 0, subrace)
  store.update('groups', groupId, { subraces: list }).catch(() => {})
}
</script>

<template>
  <WorldSection :title="t('groups.race.subraces')" :count="subraces.length">
    <div ref="root">
      <p v-if="!subraces.length" class="text-sm text-muted">{{ t('groups.race.subracesEmpty') }}</p>
      <ul v-else class="space-y-6" role="list">
        <li v-for="subrace in subraces" :key="subrace.id" :data-subrace="subrace.id" class="border-s-2 border-default ps-4">
          <div class="flex items-start gap-2">
            <DInlineText
              :model-value="subrace.name"
              variant="heading"
              :maxlength="120"
              :placeholder="t('groups.race.subraceNamePlaceholder')"
              :aria-label="t('groups.race.subraceName')"
              class="voice-author min-w-0 flex-1"
              @update:model-value="(name: string) => change(subrace.id, { name })"
            />
            <UButton
              data-subrace-remove
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              class="max-lg:min-h-11 max-lg:min-w-11 max-lg:justify-center"
              :aria-label="t('groups.race.subraceRemove', { name: nameOf(subrace) })"
              @click="remove(subrace)"
            />
          </div>
          <WorldLongText
            bare
            class="mt-1"
            :title="t('groups.race.subraceDescription', { name: nameOf(subrace) })"
            :model-value="subrace.description"
            :placeholder="t('groups.race.subraceDescriptionPlaceholder')"
            @update:model-value="(description: RichDoc) => change(subrace.id, { description })"
          />
        </li>
      </ul>
      <UButton
        data-subrace-add
        class="mt-4 max-lg:min-h-11"
        color="neutral"
        variant="outline"
        icon="i-lucide-plus"
        :label="t('groups.race.subraceAdd')"
        @click="add"
      />
    </div>
  </WorldSection>
</template>
