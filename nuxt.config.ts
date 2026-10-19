import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Namespaces of the translation files. Each feature owns its own file in
// i18n/locales/<locale>/<namespace>.json, whose single top-level key is the namespace.
const I18N_NAMESPACES = [
  'common',
  'auth',
  'landing',
  'projects',
  'account',
  'overview',
  'goals',
  'architecture',
  'strands',
  'notes',
  'characters',
  'groups',
  'locations',
  'objects',
  'world',
  'codex',
  'relations',
  'manuscript',
  'editor',
  'flow',
  'timeline',
  'analysis',
  'search',
  'trash',
  'settings',
  'export',
  'profile',
  'structures',
  'guide',
] as const

const localesDir = fileURLToPath(new URL('./i18n/locales/', import.meta.url))
const localeFiles = (code: string) =>
  I18N_NAMESPACES.map(ns => `${code}/${ns}.json`).filter(file => existsSync(localesDir + file))

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',

  modules: ['@nuxt/ui', '@nuxtjs/i18n', '@pinia/nuxt', '@vueuse/nuxt', 'nuxt-auth-utils'],

  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  // Only .vue files are components: the .ts helpers next to them (models, calendars) are plain modules.
  components: [{ path: '~/components', extensions: ['.vue'] }],

  app: {
    head: {
      htmlAttrs: { lang: 'it' },
      title: 'Dramatis',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Dramatis: scrivi il tuo romanzo o la storia del tuo videogioco, dalla premessa al manoscritto.' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },

  // The workspace is an authenticated, editor-heavy app: render it on the client.
  // The landing and the sign-in pages stay server-rendered.
  routeRules: {
    '/projects/**': { ssr: false },
    '/account': { ssr: false },
    '/p/**': { ssr: false },
    '/print/**': { ssr: false },
  },

  devServer: { port: 3070 },

  runtimeConfig: {
    databaseUrl: '',
    session: {
      name: 'dramatis-session',
      maxAge: 60 * 60 * 24 * 30,
    },
  },

  ui: {
    theme: {
      colors: ['primary', 'success', 'info', 'warning', 'error', 'neutral'],
    },
  },

  colorMode: {
    preference: 'system',
    fallback: 'light',
    storageKey: 'dramatis-color-mode',
  },

  fonts: {
    families: [
      { name: 'Schibsted Grotesk', provider: 'google', weights: [400, 500, 600], styles: ['normal'] },
      { name: 'Literata', provider: 'google', weights: ['200 900'], styles: ['normal', 'italic'] },
      { name: 'Atkinson Hyperlegible Next', provider: 'google', weights: ['200 800'], styles: ['normal', 'italic'] },
      { name: 'IBM Plex Mono', provider: 'google', weights: [400, 500], styles: ['normal'] },
    ],
  },

  icon: {
    serverBundle: { collections: ['lucide'] },
    clientBundle: { scan: true },
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'it',
    langDir: 'locales',
    locales: [
      { code: 'it', language: 'it-IT', name: 'Italiano', files: localeFiles('it') },
      { code: 'en', language: 'en-GB', name: 'English', files: localeFiles('en') },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'dramatis_locale',
      redirectOn: 'root',
      fallbackLocale: 'it',
    },
  },

  nitro: {
    serverAssets: [{ baseName: 'demo', dir: 'content/demo' }],
  },

  vite: {
    optimizeDeps: {
      include: [
        '@vue-flow/core',
        '@vue-flow/background',
        '@vue-flow/controls',
        '@vue-flow/minimap',
        'd3-force',
        'vue-draggable-plus',
      ],
    },
  },

  typescript: {
    strict: true,
  },
})
