<script setup lang="ts">
import { isEmail } from '~/components/auth/EmailInput.vue'

/**
 * Sign up (spec 4.1): name, email, password of at least 10 characters, the interface language
 * (prefilled from the browser, applied at once). The time zone comes from the browser.
 * Afterwards the author lands on the projects.
 */
definePageMeta({ layout: 'auth' })

const { t, locale, setLocale } = useI18n()
const route = useRoute()
const nuxtApp = useNuxtApp()
const { fetch: refreshSession } = useUserSession()

useHead({ title: () => t('auth.signup.metaTitle') })

const MIN_PASSWORD = 10

const form = reactive({ name: '', email: '', password: '' })
const touched = reactive({ email: false, password: false })
const submitted = ref(false)
const busy = ref(false)
const failure = ref('')
/** The email the server said is already registered. */
const takenEmail = ref('')
const passwordInput = useTemplateRef('passwordInput')

const language = computed({
  get: () => locale.value,
  set: (code: string) => { if (code === 'it' || code === 'en') void setLocale(code) },
})
const languages = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
]

const problems = computed(() => ({
  name: form.name.trim() ? '' : t('auth.errors.nameRequired'),
  email: !form.email.trim() ? t('auth.errors.emailRequired') : isEmail(form.email) ? '' : t('auth.errors.emailInvalid'),
  password: !form.password ? t('auth.errors.passwordRequired') : form.password.length < MIN_PASSWORD ? t('auth.errors.passwordShort') : '',
}))
const errors = computed(() => ({
  name: submitted.value ? problems.value.name : '',
  email: submitted.value || (touched.email && form.email.trim()) ? problems.value.email : '',
  password: submitted.value || (touched.password && form.password) ? problems.value.password : '',
}))
const taken = computed(() => !!takenEmail.value && takenEmail.value === form.email.trim().toLowerCase())

/** Below the password: how many characters are still missing, then a quiet confirmation. */
const passwordHelp = computed(() => {
  const missing = MIN_PASSWORD - form.password.length
  return form.password && missing > 0 ? t('auth.password.remaining', { n: missing }, missing) : t('auth.password.rule')
})

watch(() => [form.name, form.email, form.password], () => { failure.value = '' })

/** Moves to a field once its error is on the page, so the field is announced together with it. */
async function focusField(field: 'name' | 'email' | 'password') {
  await nextTick()
  if (field === 'password') passwordInput.value?.focus()
  else document.getElementById(`signup-${field}`)?.focus()
}

async function submit() {
  submitted.value = true
  failure.value = ''
  const first = (['name', 'email', 'password'] as const).find(field => problems.value[field]) ?? (taken.value ? 'email' : undefined)
  if (first) return focusField(first)
  busy.value = true
  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        locale: locale.value,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    })
    await refreshSession()
    await navigateTo('/projects', { replace: true })
  }
  catch (error) {
    if (errorStatus(error) === 409) {
      takenEmail.value = form.email.trim().toLowerCase()
      void focusField('email')
    }
    else {
      failure.value = errorStatus(error) === 0 ? t('auth.errors.network') : errorMessage(error, nuxtApp)
    }
  }
  finally {
    busy.value = false
  }
}

const loginLink = computed(() => ({ path: '/login', query: route.query.redirect ? { redirect: route.query.redirect } : undefined }))
</script>

<template>
  <div>
    <h1 class="font-serif text-[1.875rem]/[1.2] font-semibold tracking-tight text-highlighted">{{ t('auth.signup.title') }}</h1>
    <p class="mt-2 font-serif text-lg/snug italic text-muted text-pretty">{{ t('auth.signup.lead') }}</p>

    <form class="mt-8 space-y-4" method="post" novalidate @submit.prevent="submit">
      <AuthField :label="t('auth.fields.name')" :help="t('auth.fields.nameHelp')" :error="errors.name">
        <UInput
          id="signup-name"
          v-model="form.name"
          name="name"
          autocomplete="name"
          autocapitalize="words"
          enterkeyhint="next"
          maxlength="100"
          size="lg"
          class="w-full"
          :ui="{ base: 'min-h-11 sm:min-h-9' }"
        />
      </AuthField>

      <AuthField :label="t('auth.fields.email')" :error="taken ? t('auth.signup.taken', { link: t('auth.signup.takenLink') }) : errors.email">
        <AuthEmailInput id="signup-email" v-model="form.email" name="email" enterkeyhint="next" @blur="touched.email = true" />
        <template v-if="taken" #error>
          <i18n-t keypath="auth.signup.taken" scope="global">
            <template #link>
              <ULink :to="{ path: '/login', query: loginLink.query }" class="font-medium text-error underline">{{ t('auth.signup.takenLink') }}</ULink>
            </template>
          </i18n-t>
        </template>
      </AuthField>

      <AuthField :label="t('auth.fields.password')" :help="passwordHelp" :error="errors.password">
        <AuthPasswordInput id="signup-password" ref="passwordInput" v-model="form.password" name="password" autocomplete="new-password" @blur="touched.password = true" />
        <template #help>
          <span class="flex items-center gap-1.5">
            <UIcon v-if="form.password.length >= MIN_PASSWORD" name="i-lucide-check" class="size-4 shrink-0 text-success" />
            {{ passwordHelp }}
          </span>
        </template>
      </AuthField>

      <AuthField :label="t('auth.fields.language')">
        <USelect
          id="signup-language"
          v-model="language"
          :items="languages"
          size="lg"
          class="w-full"
          :ui="{ base: 'min-h-11 sm:min-h-9' }"
        />
      </AuthField>

      <p v-if="failure" role="alert" class="flex items-start gap-1.5 text-sm text-error">
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
        {{ failure }}
      </p>

      <UButton
        type="submit"
        color="primary"
        variant="solid"
        size="lg"
        block
        :loading="busy"
        :label="t('auth.signup.submit')"
        class="mt-2 min-h-11 sm:min-h-9"
      />
    </form>

    <i18n-t keypath="auth.signup.haveAccount" tag="p" class="mt-6 text-sm text-muted" scope="global">
      <template #link>
        <ULink :to="loginLink" class="font-medium text-primary underline">{{ t('auth.signup.haveAccountLink') }}</ULink>
      </template>
    </i18n-t>
  </div>
</template>
