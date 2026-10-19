<script setup lang="ts">
import { LandingGameSpecimen, LandingNovelSpecimen } from '#components'

/**
 * The landing (spec 4.1, brand register): the promise, the two forms of the craft side by side,
 * the method in three movements, desk and phone, trust, and the plain statement that no AI writes.
 * The app is drawn in real type (specimens) rather than screenshots, so it follows language and theme.
 */
const { t } = useI18n()
const { loggedIn } = useUserSession()

useSeoMeta({
  title: () => t('landing.meta.title'),
  description: () => t('landing.meta.description'),
  ogTitle: () => t('landing.meta.title'),
  ogDescription: () => t('landing.meta.description'),
})

const cta = computed(() => (loggedIn.value
  ? { label: t('landing.hero.ctaSignedIn'), to: '/projects' }
  : { label: t('landing.hero.cta'), to: '/signup' }))

// The two forms of the craft, as an open book: the novel on the left page, the game on the right.
const media = [
  { key: 'novel', icon: 'i-lucide-book-open', specimen: LandingNovelSpecimen, points: ['structure', 'pov', 'analysis', 'export'] },
  { key: 'game', icon: 'i-lucide-gamepad-2', specimen: LandingGameSpecimen, points: ['quests', 'choices', 'lines', 'export'] },
] as const
const steps = ['bible', 'manuscript', 'delivery'] as const
const trust = [
  { key: 'autosave', icon: 'i-lucide-check' },
  { key: 'revisions', icon: 'i-lucide-history' },
  { key: 'devices', icon: 'i-lucide-git-fork' },
  { key: 'trash', icon: 'i-lucide-undo-2' },
  { key: 'backup', icon: 'i-lucide-archive' },
] as const
const devices = [
  { key: 'desk', icon: 'i-lucide-laptop' },
  { key: 'phone', icon: 'i-lucide-smartphone' },
] as const

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8'
const h2 = 'font-serif text-[1.75rem]/[1.2] font-semibold tracking-tight text-highlighted text-balance sm:text-[2.125rem]/[1.15]'
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-default">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-default focus:p-2">{{ t('common.a11y.skipToContent') }}</a>

    <header :class="container" class="flex h-16 shrink-0 items-center gap-1 sm:gap-3">
      <LandingWordmark />
      <div class="flex-1" />
      <LandingLanguageSwitch />
      <UButton
        v-if="!loggedIn"
        to="/login"
        :label="t('landing.signIn')"
        color="neutral"
        variant="outline"
        class="ms-1 min-h-11 sm:min-h-8"
      />
    </header>

    <main id="main" class="flex-1">
      <section :class="container" class="pt-8 pb-14 sm:pt-14 lg:pt-20 lg:pb-20">
        <h1 class="max-w-4xl font-serif text-[2rem]/[1.15] font-semibold tracking-tight text-highlighted text-balance sm:text-5xl/[1.1] lg:text-[3.5rem]/[1.08]">
          {{ t('landing.hero.title') }}
        </h1>
        <p class="mt-5 max-w-2xl text-lg/relaxed text-muted text-pretty sm:mt-6">{{ t('landing.hero.lead') }}</p>
        <UButton
          :to="cta.to"
          :label="cta.label"
          color="primary"
          variant="solid"
          size="xl"
          trailing-icon="i-lucide-arrow-right"
          class="mt-7 min-h-11 sm:mt-8"
        />
      </section>

      <section class="bg-muted" aria-labelledby="landing-media">
        <div :class="container" class="py-14 lg:py-20">
          <h2 id="landing-media" :class="h2">{{ t('landing.media.title') }}</h2>
          <p class="mt-3 max-w-2xl text-muted text-pretty">{{ t('landing.media.lead') }}</p>
          <!-- An open book: the novel on the left page, the game on the right; on a phone one after the other. -->
          <div class="mt-9 grid gap-x-8 gap-y-3 lg:grid-cols-2">
            <template v-for="medium in media" :key="medium.key">
              <component
                :is="medium.specimen"
                class="lg:row-span-2 lg:row-start-1 lg:grid lg:grid-rows-subgrid"
                :class="medium.key === 'novel' ? 'lg:col-start-1' : 'mt-9 lg:col-start-2 lg:mt-0'"
              />
              <div class="mt-3 lg:row-start-3" :class="medium.key === 'novel' ? 'lg:col-start-1' : 'lg:col-start-2'">
                <h3 class="flex items-center gap-2 font-semibold text-highlighted">
                  <UIcon :name="medium.icon" class="size-4.5 text-toned" />
                  {{ t(`landing.media.${medium.key}.title`) }}
                </h3>
                <ul class="mt-2 space-y-1.5 text-default">
                  <li v-for="point in medium.points" :key="point" class="flex gap-2.5">
                    <span class="mt-[0.7em] size-1 shrink-0 rounded-full bg-(--ui-text-dimmed)" aria-hidden="true" />
                    <span class="text-pretty">{{ t(`landing.media.${medium.key}.points.${point}`) }}</span>
                  </li>
                </ul>
              </div>
            </template>
          </div>
        </div>
      </section>

      <section :class="container" class="py-16 lg:py-24" aria-labelledby="landing-method">
        <h2 id="landing-method" :class="h2">{{ t('landing.method.title') }}</h2>
        <ol class="mt-9 grid gap-9 md:grid-cols-3 md:gap-8">
          <li v-for="(step, index) in steps" :key="step" class="border-t border-default pt-4">
            <p class="font-serif text-2xl/none text-dimmed tabular" aria-hidden="true">{{ index + 1 }}</p>
            <h3 class="mt-3 font-semibold text-highlighted">{{ t(`landing.method.${step}.title`) }}</h3>
            <i18n-t v-if="step === 'manuscript'" :keypath="`landing.method.${step}.body`" tag="p" class="mt-1.5 text-muted text-pretty" scope="global">
              <template #at><kbd class="rounded-[calc(var(--ui-radius)*1.5)] bg-elevated px-1.5 py-0.5 font-sans text-sm text-highlighted">@</kbd></template>
            </i18n-t>
            <p v-else class="mt-1.5 text-muted text-pretty">{{ t(`landing.method.${step}.body`) }}</p>
          </li>
        </ol>

        <div class="mt-14 grid items-start gap-8 lg:mt-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div class="lg:pt-6">
            <h3 class="font-serif text-xl/snug font-semibold text-highlighted text-balance">{{ t('landing.interview.title') }}</h3>
            <p class="mt-2 text-muted text-pretty">{{ t('landing.interview.body') }}</p>
          </div>
          <LandingInterviewSpecimen />
        </div>

        <div class="mt-14 lg:mt-20">
          <h3 class="font-serif text-xl/snug font-semibold text-highlighted">{{ t('landing.path.title') }}</h3>
          <p class="mt-2 max-w-2xl text-muted text-pretty">{{ t('landing.path.body') }}</p>
          <LandingPathSpecimen class="mt-6" />
        </div>
      </section>

      <section class="border-t border-default" aria-labelledby="landing-devices">
        <div :class="container" class="grid items-center gap-12 py-16 md:grid-cols-2 md:gap-10 lg:py-24">
          <div>
            <h2 id="landing-devices" :class="h2">{{ t('landing.devices.title') }}</h2>
            <p class="mt-3 max-w-2xl text-muted">{{ t('landing.devices.lead') }}</p>
            <div class="mt-9 space-y-7">
              <div v-for="device in devices" :key="device.key" class="flex max-w-xl gap-4">
                <UIcon :name="device.icon" class="mt-0.5 size-5 shrink-0 text-toned" />
                <div>
                  <h3 class="font-semibold text-highlighted">{{ t(`landing.devices.${device.key}.title`) }}</h3>
                  <p class="mt-1 text-muted text-pretty">{{ t(`landing.devices.${device.key}.body`) }}</p>
                </div>
              </div>
            </div>
          </div>
          <LandingPhoneSpecimen class="md:justify-self-center" />
        </div>
      </section>

      <section class="border-t border-default" aria-labelledby="landing-trust">
        <div :class="container" class="py-16 lg:py-24">
          <h2 id="landing-trust" :class="h2">{{ t('landing.trust.title') }}</h2>
          <dl class="mt-8 max-w-4xl divide-y divide-default">
            <div v-for="item in trust" :key="item.key" class="grid gap-x-8 gap-y-1 py-4 sm:grid-cols-[17rem_minmax(0,1fr)]">
              <dt class="flex items-center gap-3 font-medium text-highlighted">
                <UIcon :name="item.icon" class="size-4.5 shrink-0 text-toned" />
                {{ t(`landing.trust.${item.key}.title`) }}
              </dt>
              <dd class="ps-7.5 text-muted text-pretty sm:ps-0">{{ t(`landing.trust.${item.key}.body`) }}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section class="bg-muted" aria-labelledby="landing-statement">
        <div :class="container" class="py-16 lg:py-24">
          <h2 id="landing-statement" class="max-w-3xl font-serif text-[1.875rem]/[1.2] font-semibold tracking-tight text-highlighted text-balance sm:text-[2.5rem]/[1.15]">
            {{ t('landing.statement.title') }}
          </h2>
          <p class="mt-4 max-w-2xl text-lg/relaxed text-muted">{{ t('landing.statement.body') }}</p>
        </div>
      </section>

      <section :class="container" class="py-16 lg:py-24" aria-labelledby="landing-closing">
        <h2 id="landing-closing" :class="h2">{{ t('landing.closing.title') }}</h2>
        <div class="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <UButton :to="cta.to" :label="cta.label" color="primary" variant="solid" size="xl" trailing-icon="i-lucide-arrow-right" class="min-h-11" />
          <i18n-t v-if="!loggedIn" keypath="landing.closing.signIn" tag="p" class="text-muted" scope="global">
            <template #link><ULink to="/login" class="font-medium text-primary underline">{{ t('landing.signIn') }}</ULink></template>
          </i18n-t>
        </div>
      </section>
    </main>

    <footer class="border-t border-default">
      <div :class="container" class="flex flex-col gap-1 py-6 sm:flex-row sm:items-center sm:gap-4">
        <LandingWordmark size="sm" />
        <p class="text-sm text-muted">{{ t('landing.footer') }}</p>
        <div class="flex-1" />
        <LandingLanguageSwitch class="-ms-2 sm:ms-0" />
      </div>
    </footer>
  </div>
</template>
