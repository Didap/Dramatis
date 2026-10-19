import type { NuxtApp } from '#app'

interface FetchLikeError {
  statusCode?: number
  status?: number
  response?: { status?: number }
  data?: { message?: string, data?: unknown }
}

/** Context captured in a setup function, for use after an await (where composables are gone). */
export interface ErrorContext {
  toast?: ReturnType<typeof useToast>
  nuxtApp?: NuxtApp
}

/** HTTP status of a failed $fetch, or 0 when the request never reached the server. */
export function errorStatus(error: unknown): number {
  const e = error as FetchLikeError | undefined
  return e?.statusCode ?? e?.status ?? e?.response?.status ?? 0
}

/** A short, translated sentence for a failed request. */
export function errorMessage(error: unknown, nuxtApp: NuxtApp = useNuxtApp()): string {
  const t = (key: string) => nuxtApp.$i18n.t(key)
  switch (errorStatus(error)) {
    case 0: return t('common.errors.network')
    case 400: return t('common.errors.invalid')
    case 401: return t('common.errors.signedOut')
    case 403:
    case 404: return t('common.errors.notFound')
    case 409: return t('common.errors.conflict')
    case 413: return t('common.errors.tooLarge')
    case 415: return t('common.errors.unsupported')
    case 429: return t('common.errors.tooMany')
    default: return t('common.errors.generic')
  }
}

/**
 * Shows a failed request as a toast; a lost session goes back to sign-in. Pass the context when
 * calling after an await (stores, async handlers).
 */
export function notifyError(error: unknown, context: ErrorContext = {}) {
  const nuxtApp = context.nuxtApp ?? useNuxtApp()
  const toast = context.toast ?? useToast()
  toast.add({ title: errorMessage(error, nuxtApp), color: 'error', icon: 'i-lucide-circle-alert' })
  if (errorStatus(error) === 401) {
    // The browser still believes it is signed in: forget the session first, or the guard sends us back.
    void nuxtApp.runWithContext(async () => {
      const redirect = useRoute().fullPath
      await useUserSession().clear()
      await navigateTo({ path: '/login', query: { redirect } })
    })
  }
}
