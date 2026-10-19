<script setup lang="ts">
import type { ProjectSummary, User } from '#shared/types/entities'
import { isEmail } from '~/components/auth/EmailInput.vue'

/**
 * Sign in (spec 4.1). Errors are inline and never say which of the two was wrong. Afterwards the
 * account's language and theme apply, and the author goes back to the page that asked for sign-in,
 * to the last opened project, or to the projects.
 */
definePageMeta({ layout: 'auth' })

const { t, setLocale } = useI18n()
const route = useRoute()
const colorMode = useColorMode()
const nuxtApp = useNuxtApp()
const { fetch: refreshSession } = useUserSession()

useHead({ title: () => t('auth.login.metaTitle') })

const form = reactive({ email: '', password: '' })
const touched = reactive({ email: false })
const submitted = ref(false)
const busy = ref(false)
const failure = ref('')
const passwordInput = useTemplateRef('passwordInput')

const problems = computed(() => ({
  email: !form.email.trim() ? t('auth.errors.emailRequired') : isEmail(form.email) ? '' : t('auth.errors.emailInvalid'),
  password: form.password ? '' : t('auth.errors.passwordRequired'),
}))
// Missing fields are pointed out on submit; a malformed email as soon as the author leaves the field.
const errors = computed(() => ({
  email: submitted.value || (touched.email && form.email.trim()) ? problems.value.email : '',
  password: submitted.value ? problems.value.password : '',
}))

watch(() => [form.email, form.password], () => { failure.value = '' })

/**
 * A ?redirect= that stays inside the app. A browser reads "/\evil.example", or a tab or line break
 * inside the slashes, as "//evil.example": another site.
 */
function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  if (/[\\\u0000-\u001F\u007F]/.test(value)) return null
  if (/^\/(login|signup)(\/|\?|#|$)/.test(value)) return null
  return value
}

/** Where to go after signing in: the page that asked for it, the last opened project if it still exists, or the projects. */
async function destination(user: User): Promise<string> {
  const redirect = safeRedirect(route.query.redirect)
  if (redirect) return redirect
  const last = user.preferences?.lastProjectId
  if (last) {
    const projects = await $fetch<ProjectSummary[]>('/api/projects').catch(() => [] as ProjectSummary[])
    if (projects.some(p => p.id === last && !p.deletedAt)) return `/p/${last}`
  }
  return '/projects'
}

function onEmailEnter(event: KeyboardEvent) {
  // Enter on the email moves on to the password while it is still empty.
  if (!form.password) {
    event.preventDefault()
    touched.email = true
    passwordInput.value?.focus()
  }
}

async function submit() {
  submitted.value = true
  failure.value = ''
  if (problems.value.email || problems.value.password) {
    // Once the error is on the page, so the field is announced together with it.
    await nextTick()
    if (problems.value.email) document.getElementById('login-email')?.focus()
    else passwordInput.value?.focus()
    return
  }
  busy.value = true
  let user: User
  try {
    ;({ user } = await $fetch<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email: form.email.trim(), password: form.password },
    }))
  }
  catch (error) {
    const status = errorStatus(error)
    failure.value = status === 401 ? t('auth.login.wrong') : status === 0 ? t('auth.errors.network') : errorMessage(error, nuxtApp)
    busy.value = false
    return
  }
  // Signed in: from here on nothing is a sign-in failure, and the author always leaves this page.
  try {
    await refreshSession()
    if (user.locale === 'it' || user.locale === 'en') await setLocale(user.locale)
    if (user.preferences?.theme) colorMode.preference = user.preferences.theme
    await navigateTo(await destination(user), { replace: true })
  }
  catch {
    await navigateTo('/projects', { replace: true })
  }
  finally {
    busy.value = false
  }
}

const signupLink = computed(() => ({ path: '/signup', query: route.query.redirect ? { redirect: route.query.redirect } : undefined }))
</script>

<template>
  <div>
    <h1 class="font-serif text-[1.875rem]/[1.2] font-semibold tracking-tight text-highlighted">{{ t('auth.login.title') }}</h1>
    <p class="mt-2 font-serif text-lg/snug italic text-muted">{{ t('auth.login.lead') }}</p>

    <form class="mt-8 space-y-4" method="post" novalidate @submit.prevent="submit">
      <AuthField :label="t('auth.fields.email')" :error="errors.email">
        <AuthEmailInput
          id="login-email"
          v-model="form.email"
          name="email"
          enterkeyhint="next"
          autofocus
          @blur="touched.email = true"
          @keydown.enter="onEmailEnter"
        />
      </AuthField>

      <AuthField :label="t('auth.fields.password')" :error="errors.password">
        <AuthPasswordInput id="login-password" ref="passwordInput" v-model="form.password" name="password" autocomplete="current-password" />
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
        :label="t('auth.login.submit')"
        class="mt-2 min-h-11 sm:min-h-9"
      />
    </form>

    <i18n-t keypath="auth.login.noAccount" tag="p" class="mt-6 text-sm text-muted" scope="global">
      <template #link>
        <ULink :to="signupLink" class="font-medium text-primary underline">{{ t('auth.login.noAccountLink') }}</ULink>
      </template>
    </i18n-t>
  </div>
</template>
