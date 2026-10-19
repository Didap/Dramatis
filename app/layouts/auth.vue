<script setup lang="ts">
/** The frame of sign-in and sign-up: the house's name, the language, one calm column. */
const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-default">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-default focus:p-2">{{ t('common.a11y.skipToContent') }}</a>
    <header class="mx-auto flex h-16 w-full max-w-6xl shrink-0 items-center gap-2 px-4 sm:px-6 lg:px-8">
      <LandingWordmark />
      <div class="flex-1" />
      <LandingLanguageSwitch />
    </header>
    <main id="main" class="flex flex-1 justify-center px-4 pt-6 pb-16 sm:px-6 sm:pt-[14vh]">
      <div class="w-full max-w-sm">
        <slot />
      </div>
    </main>
  </div>
</template>
