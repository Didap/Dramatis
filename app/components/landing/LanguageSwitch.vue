<script setup lang="ts">
/**
 * Italiano · English. Before sign-in the choice lives in a cookie; once signed in it is also the
 * account's language. Each name is written in its own language.
 */
const { t, locale, setLocale } = useI18n()
const { loggedIn } = useUserSession()

const LANGUAGES = [
  { code: 'it', name: 'Italiano' },
  { code: 'en', name: 'English' },
] as const

async function choose(code: 'it' | 'en') {
  if (code === locale.value) return
  await setLocale(code)
  if (loggedIn.value) await $fetch('/api/account', { method: 'PATCH', body: { locale: code } }).catch(() => {})
}
</script>

<template>
  <div role="group" :aria-label="t('landing.language')" class="flex items-center">
    <template v-for="(language, index) in LANGUAGES" :key="language.code">
      <span v-if="index" class="text-dimmed" aria-hidden="true">·</span>
      <button
        type="button"
        :lang="language.code"
        :aria-pressed="locale === language.code"
        class="min-h-11 rounded-[calc(var(--ui-radius)*1.5)] px-2 text-sm transition-colors duration-150 hover:text-highlighted"
        :class="locale === language.code ? 'font-medium text-highlighted' : 'text-muted'"
        @click="choose(language.code)"
      >
        {{ language.name }}
      </button>
    </template>
  </div>
</template>
