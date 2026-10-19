<script setup lang="ts">
import { en, it } from '@nuxt/ui/locale'

const { locale } = useI18n()
// Nuxt UI's own strings (close, clear, no results...) follow the interface language.
const uiLocale = computed(() => (locale.value === 'en' ? en : it))
useHead({ htmlAttrs: { lang: () => locale.value } })
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
