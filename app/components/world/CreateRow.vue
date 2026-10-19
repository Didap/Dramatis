<script lang="ts">
/**
 * Whether the inline creation of a list page is open. `?new=1` opens it (a link from elsewhere) and
 * is cleared at once, so going back to the list or reloading it does not open it again.
 */
export function useCreating() {
  const route = useRoute()
  const router = useRouter()
  const creating = ref(false)
  watch(() => route.query.new, (value) => {
    if (value !== '1') return
    creating.value = true
    const query = { ...route.query }
    delete query.new
    void router.replace({ query })
  }, { immediate: true })
  return creating
}
</script>

<script setup lang="ts">
/**
 * Creates an item from its name, inline at the top of a list: Enter creates (the page then opens the
 * new sheet), Escape or the cross gives up and gives the focus back to the button that opened the
 * row (or, when that one is gone, to the list's own `data-world-create` button). A failed creation
 * keeps what was typed.
 */
const props = withDefaults(defineProps<{
  placeholder: string
  create: (name: string) => Promise<unknown>
  /** Leading icon of the kind being created. */
  icon?: string
}>(), { icon: undefined })

const emit = defineEmits<{ cancel: [] }>()

const { t } = useI18n()
const name = ref('')
const busy = ref(false)
const form = ref<HTMLFormElement | null>(null)
// Read before the field takes the focus: the button that opened the row.
const active = import.meta.client ? document.activeElement : null
const opener = active instanceof HTMLElement && active !== document.body ? active : null

async function submit() {
  const value = name.value.trim()
  if (!value || busy.value) return
  busy.value = true
  try {
    await props.create(value)
    name.value = ''
  }
  catch {
    // The store already said what went wrong; the name stays for another try.
  }
  finally {
    busy.value = false
  }
}

function cancel() {
  const scope = form.value?.closest<HTMLElement>('aside, main') ?? document.body
  emit('cancel')
  void nextTick(() => {
    const target = opener?.isConnected ? opener : scope.querySelector<HTMLElement>('[data-world-create]')
    target?.focus()
  })
}
</script>

<template>
  <form ref="form" class="flex items-center gap-2 py-1.5" @submit.prevent="submit" @keydown.esc.prevent="cancel">
    <UInput
      v-model="name"
      autofocus
      :icon="icon"
      :placeholder="placeholder"
      :aria-label="placeholder"
      :maxlength="200"
      autocomplete="off"
      class="min-w-0 flex-1"
      :ui="{ base: 'voice-author max-sm:text-base max-lg:min-h-11' }"
    />
    <UButton type="submit" color="neutral" variant="outline" :label="t('common.actions.create')" :disabled="!name.trim()" :loading="busy" class="max-lg:min-h-11" />
    <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="t('common.actions.cancel')" class="max-lg:size-11 max-lg:justify-center" @click="cancel" />
  </form>
</template>
