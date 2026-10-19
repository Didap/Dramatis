<script setup lang="ts">
/**
 * Deleting the account (spec 4.1): it destroys everything, so the backups come first and the email
 * must be typed. Inline, never a surprise.
 */
const props = defineProps<{
  email: string
  /** Projects that will be destroyed with the account, deleted ones included. */
  projects: number
}>()

const { t } = useI18n()
const { clear } = useUserSession()
const store = useProjectStore()
const toast = useToast()

const open = ref(false)
const typed = ref('')
const busy = ref(false)
const ready = computed(() => typed.value.trim().toLowerCase() === props.email.toLowerCase())
const inputRef = useTemplateRef<{ inputRef: HTMLInputElement | null }>('input')
const startRef = useTemplateRef<{ $el: HTMLElement }>('start')

// The form takes the focus on the email field and gives it back to the button when it closes.
watch(open, async (value) => {
  typed.value = ''
  await nextTick()
  if (value) inputRef.value?.inputRef?.focus()
  else startRef.value?.$el?.focus()
})

function showBackups() {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById('backup')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
}

async function remove() {
  if (!ready.value) return
  busy.value = true
  try {
    await $fetch('/api/account', { method: 'DELETE', body: { email: typed.value.trim() } })
    store.reset()
    await clear()
    await navigateTo('/')
    toast.add({ title: t('account.delete.done'), icon: 'i-lucide-check' })
  }
  catch (error) {
    notifyError(error)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="account-delete">
    <UButton
      v-if="!open"
      ref="start"
      icon="i-lucide-user-x"
      :label="t('account.delete.start')"
      color="error"
      variant="outline"
      class="max-lg:min-h-11"
      @click="open = true"
    />
    <form
      v-else
      class="max-w-xl space-y-4 rounded-[calc(var(--ui-radius)*2)] border border-error/40 p-4 sm:p-5"
      @submit.prevent="remove"
      @keydown.esc="open = false"
    >
      <p class="text-pretty text-default">{{ t('account.delete.warning', { n: projects }, projects) }}</p>
      <p class="text-sm text-pretty text-toned">
        {{ t('account.delete.backupFirst') }}
        <UButton :label="t('account.delete.toBackups')" color="primary" variant="link" class="px-0 align-baseline underline underline-offset-3" @click="showBackups" />
      </p>
      <UFormField :label="t('account.delete.typeEmail', { email })" name="confirm-email">
        <UInput ref="input" v-model="typed" type="email" autocomplete="off" spellcheck="false" class="w-full" />
      </UFormField>
      <div class="flex flex-wrap gap-2">
        <UButton :label="t('common.actions.cancel')" color="neutral" variant="ghost" class="max-lg:min-h-11" @click="open = false" />
        <UButton type="submit" :label="t('account.delete.confirm')" color="error" variant="solid" :disabled="!ready" :loading="busy" class="max-lg:min-h-11" />
      </div>
    </form>
  </div>
</template>
