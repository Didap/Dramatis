<script setup lang="ts">
/**
 * Changing the password: the current one first, then the new one (at least 10 characters).
 * Errors under the field they belong to; the change is confirmed in words, never silently.
 */
const props = defineProps<{ email: string }>()
const emit = defineEmits<{ saved: [] }>()

const { t } = useI18n()
const toast = useToast()

const current = ref('')
const next = ref('')
const show = ref(false)
const busy = ref(false)
const errors = reactive<{ current: string, next: string }>({ current: '', next: '' })
const done = ref(false)

watch([current, next], () => { done.value = false })

async function submit() {
  errors.current = current.value ? '' : t('account.password.currentMissing')
  errors.next = next.value.length >= 10 ? '' : t('account.password.tooShort')
  if (errors.current || errors.next) return
  busy.value = true
  try {
    await $fetch('/api/account/password', { method: 'POST', body: { current: current.value, password: next.value } })
    current.value = ''
    next.value = ''
    done.value = true
    emit('saved')
    toast.add({ title: t('account.password.changed'), icon: 'i-lucide-key-round' })
  }
  catch (error) {
    if (errorStatus(error) === 403) errors.current = t('account.password.wrong')
    else if (errorStatus(error) === 400) errors.next = t('account.password.tooShort')
    else notifyError(error)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="account-password max-w-md space-y-4" novalidate @submit.prevent="submit">
    <input type="email" autocomplete="username" :value="props.email" class="sr-only" tabindex="-1" aria-hidden="true" readonly>
    <UFormField :label="t('account.password.current')" name="current" :error="errors.current || undefined">
      <UInput
        v-model="current"
        :type="show ? 'text' : 'password'"
        autocomplete="current-password"
        class="w-full"
        :aria-invalid="!!errors.current"
      />
      <template v-if="errors.current" #error="{ error }">
        <span class="flex items-center gap-1.5"><UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />{{ error }}</span>
      </template>
    </UFormField>
    <UFormField :label="t('account.password.next')" name="password" :help="errors.next ? undefined : t('account.password.hint')" :error="errors.next || undefined">
      <UInput
        v-model="next"
        :type="show ? 'text' : 'password'"
        autocomplete="new-password"
        minlength="10"
        class="w-full"
        :aria-invalid="!!errors.next"
      />
      <template v-if="errors.next" #error="{ error }">
        <span class="flex items-center gap-1.5"><UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />{{ error }}</span>
      </template>
    </UFormField>
    <UCheckbox v-model="show" :label="t('account.password.show')" />
    <div class="flex flex-wrap items-center gap-3">
      <UButton type="submit" :label="t('account.password.submit')" color="neutral" variant="outline" :loading="busy" class="max-lg:min-h-11" />
      <p v-if="done" class="flex items-center gap-1.5 text-sm text-success" role="status">
        <UIcon name="i-lucide-check" class="size-4" />{{ t('account.password.changed') }}
      </p>
    </div>
  </form>
</template>
