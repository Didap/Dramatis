<script setup lang="ts">
import type { EditorPreferences, UserPreferences } from '#shared/types/domain'
import type { ProjectSummary, User } from '#shared/types/entities'

/**
 * The account (spec 4.1, 7.1): who you are and how the app behaves for you. Name, password,
 * language and theme, time zone, the defaults of the writing surface, guidance in new projects,
 * backups, and deleting the account. One page with anchored sections; each section saves on its own.
 */
const { t, locale, setLocale } = useI18n()
const { fetch: refreshSession } = useUserSession()
const colorMode = useColorMode()
const desktop = useMediaQuery('(min-width: 1024px)')

useHead({ title: () => `${t('account.title')} · Dramatis`, htmlAttrs: { lang: () => locale.value } })

const { data: account, error: loadError, refresh } = useLazyFetch<User>('/api/account')
const { data: projects } = useLazyFetch<ProjectSummary[]>('/api/projects')

/** When each section last saved, for its "Salvato" mark. */
const savedAt = reactive<Record<string, number | null>>({})
const timers: Record<string, ReturnType<typeof setTimeout>> = {}
function markSaved(section: string) {
  savedAt[section] = Date.now()
  clearTimeout(timers[section])
  timers[section] = setTimeout(() => { savedAt[section] = null }, 2500)
}

async function save(section: string, body: Partial<Pick<User, 'name' | 'locale' | 'timezone'>> & { preferences?: UserPreferences }) {
  try {
    account.value = await $fetch<User>('/api/account', { method: 'PATCH', body })
    markSaved(section)
    return true
  }
  catch (error) {
    notifyError(error)
    return false
  }
}

// ---------------------------------------------------------------- profile

const name = ref('')
const nameDirty = computed(() => !!account.value && name.value.trim() !== account.value.name)
watch(account, (value, before) => {
  // A save elsewhere on the page must not undo a name being typed.
  if (value && (!before || name.value.trim() === before.name)) name.value = value.name
}, { immediate: true })
const nameBusy = ref(false)
async function saveName() {
  if (!name.value.trim()) return
  nameBusy.value = true
  if (await save('profile', { name: name.value.trim() })) await refreshSession()
  nameBusy.value = false
}

// ---------------------------------------------------------------- language and theme

const languages = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
]
async function changeLanguage(code: 'it' | 'en') {
  await setLocale(code)
  await save('appearance', { locale: code })
}
const themes = computed(() => (['light', 'dark', 'system'] as const).map(value => ({ value, label: t(`common.theme.${value}`) })))
const theme = computed(() => (['light', 'dark', 'system'].includes(colorMode.preference) ? colorMode.preference : 'system') as 'light' | 'dark' | 'system')
async function changeTheme(theme: 'light' | 'dark' | 'system') {
  colorMode.preference = theme
  await save('appearance', { preferences: { theme } })
}

// ---------------------------------------------------------------- time zone

const browserZone = ref('')
const zones = ref<{ value: string, label: string }[]>([])
onMounted(() => {
  browserZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [browserZone.value]
  const now = new Date()
  zones.value = all.map((zone) => {
    let offset = ''
    try {
      offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? ''
    }
    catch {}
    return { value: zone, label: `${zone.replaceAll('_', ' ')}${offset ? ` (${offset.replace('GMT', 'UTC')})` : ''}` }
  })
})
const zoneItems = computed(() => {
  const current = account.value?.timezone
  return current && !zones.value.some(z => z.value === current) ? [{ value: current, label: current }, ...zones.value] : zones.value
})
function changeZone(zone: string) {
  if (zone && zone !== account.value?.timezone) void save('timezone', { timezone: zone })
}

// ---------------------------------------------------------------- writing and guidance

const editor = ref<EditorPreferences>({})
// A change waiting for the server: an older answer arriving meanwhile must not move the sliders back.
let editorPending = false
watch(account, (value) => {
  if (value && !editorPending) editor.value = { ...value.preferences.editor }
}, { immediate: true })
const saveEditor = useDebounceFn(async () => {
  const sent = { ...editor.value }
  await save('editor', { preferences: { editor: sent } })
  // Only the answer to the latest values ends the wait.
  if (JSON.stringify(sent) === JSON.stringify(editor.value)) editorPending = false
}, 500)
function changeEditor(value: EditorPreferences) {
  editor.value = value
  editorPending = true
  void saveEditor()
}

const guidance = computed(() => account.value?.preferences.guidance ?? true)

// ---------------------------------------------------------------- the page

const sections = computed(() => [
  { id: 'profile', label: t('account.profile.title') },
  { id: 'password', label: t('account.password.title') },
  { id: 'appearance', label: t('account.appearance.title') },
  { id: 'timezone', label: t('account.timezone.title') },
  { id: 'editor', label: t('account.editor.title') },
  { id: 'guidance', label: t('account.guidance.title') },
  { id: 'backup', label: t('account.backup.title') },
  { id: 'delete', label: t('account.delete.title') },
])
/** Anchors scroll smoothly unless motion is reduced; the hash stays shareable. */
function go(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(history.state, '', `#${id}`)
}
const route = useRoute()
watch(account, (value) => {
  const id = route.hash.slice(1)
  if (value && id) nextTick(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
}, { once: true })

const lastProject = computed(() => {
  const id = account.value?.preferences.lastProjectId
  return id ? (projects.value ?? []).find(p => p.id === id && !p.deletedAt) : undefined
})
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-default">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-default focus:p-2">{{ t('common.a11y.skipToContent') }}</a>

    <header class="sticky top-0 z-20 border-b border-default/60 bg-default">
      <div class="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        <LandingWordmark to="/projects" :label="t('common.nav.projects')" size="sm" />
        <div class="flex-1" />
        <UButton
          v-if="lastProject"
          :to="`/p/${lastProject.id}`"
          icon="i-lucide-arrow-left"
          :label="lastProject.title"
          color="neutral"
          variant="ghost"
          class="hidden max-w-64 sm:inline-flex"
          :ui="{ label: 'truncate voice-author' }"
        />
        <UButton to="/projects" icon="i-lucide-library" :label="t('common.nav.projects')" color="neutral" variant="ghost" class="hidden sm:inline-flex" />
        <div class="max-w-56">
          <AppUserMenu :collapsed="!desktop" />
        </div>
      </div>
    </header>

    <main id="main" class="mx-auto w-full max-w-5xl flex-1 px-4 pt-8 pb-24 sm:px-6 lg:px-8 lg:pt-12">
      <h1 class="text-2xl font-semibold tracking-tight text-highlighted">{{ t('account.title') }}</h1>
      <p class="mt-1 max-w-prose text-pretty text-muted">{{ t('account.description') }}</p>

      <DEmptyState
        v-if="loadError && !account"
        class="mt-10"
        icon="i-lucide-circle-alert"
        :title="t('account.loadError')"
        :actions="[{ label: t('common.actions.retry'), color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
      />

      <div v-else-if="!account" class="mt-10 space-y-4" aria-busy="true">
        <USkeleton v-for="i in 4" :key="i" class="h-16 w-full max-w-2xl" />
      </div>

      <div v-else class="mt-8 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-12">
        <!-- Sections: a column on a desktop, a row of anchors on a phone. -->
        <nav class="-mx-1 mb-8 flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:flex-col lg:self-start lg:overflow-visible" :aria-label="t('account.sections')">
          <UButton
            v-for="section in sections"
            :key="section.id"
            :href="`#${section.id}`"
            :label="section.label"
            color="neutral"
            variant="ghost"
            size="sm"
            class="shrink-0 max-lg:min-h-11 lg:justify-start"
            @click.prevent="go(section.id)"
          />
        </nav>

        <div class="min-w-0 max-w-2xl space-y-14">
          <AccountSection id="profile" :title="t('account.profile.title')" :saved-at="savedAt.profile">
            <form class="max-w-md space-y-4" @submit.prevent="saveName">
              <UFormField :label="t('account.profile.name')" name="name" :help="t('account.profile.nameHelp')">
                <UInput v-model="name" autocomplete="name" :maxlength="100" class="w-full" />
              </UFormField>
              <div>
                <p class="text-sm font-medium text-default">{{ t('account.profile.email') }}</p>
                <p class="mt-1 text-default">{{ account.email }}</p>
              </div>
              <UButton type="submit" :label="t('common.actions.save')" color="neutral" variant="outline" :disabled="!nameDirty || !name.trim()" :loading="nameBusy" class="max-lg:min-h-11" />
            </form>
          </AccountSection>

          <AccountSection id="password" :title="t('account.password.title')" :description="t('account.password.description')" :saved-at="savedAt.password">
            <AccountPassword :email="account.email" @saved="markSaved('password')" />
          </AccountSection>

          <AccountSection id="appearance" :title="t('account.appearance.title')" :saved-at="savedAt.appearance">
            <div class="space-y-6">
              <URadioGroup
                :model-value="locale"
                :items="languages"
                :legend="t('common.language.label')"
                orientation="horizontal"
                :ui="{ legend: 'text-sm font-medium text-default mb-2', fieldset: 'gap-x-6' }"
                @update:model-value="(value) => changeLanguage(value as 'it' | 'en')"
              />
              <URadioGroup
                :model-value="theme"
                :items="themes"
                :legend="t('common.theme.label')"
                orientation="horizontal"
                :ui="{ legend: 'text-sm font-medium text-default mb-2', fieldset: 'flex-wrap gap-x-6 gap-y-2' }"
                @update:model-value="(value) => changeTheme(value as 'light' | 'dark' | 'system')"
              />
            </div>
          </AccountSection>

          <AccountSection id="timezone" :title="t('account.timezone.title')" :description="t('account.timezone.description')" :saved-at="savedAt.timezone">
            <div class="max-w-md space-y-3">
              <USelectMenu
                :model-value="account.timezone"
                :items="zoneItems"
                value-key="value"
                :search-input="{ placeholder: t('account.timezone.search') }"
                :aria-label="t('account.timezone.title')"
                class="w-full"
                virtualize
                @update:model-value="(value) => changeZone(String(value ?? ''))"
              />
              <UButton
                v-if="browserZone && browserZone !== account.timezone"
                :label="t('account.timezone.useDevice', { zone: browserZone.replaceAll('_', ' ') })"
                icon="i-lucide-locate"
                color="primary"
                variant="link"
                class="px-0 underline underline-offset-3"
                @click="changeZone(browserZone)"
              />
            </div>
          </AccountSection>

          <AccountSection id="editor" :title="t('account.editor.title')" :description="t('account.editor.description')" :saved-at="savedAt.editor">
            <AccountEditor :model-value="editor" @update:model-value="changeEditor" />
          </AccountSection>

          <AccountSection id="guidance" :title="t('account.guidance.title')" :saved-at="savedAt.guidance">
            <div class="flex max-w-xl items-start justify-between gap-6">
              <div>
                <label for="account-guidance" class="text-sm font-medium text-default">{{ t('account.guidance.label') }}</label>
                <p id="account-guidance-help" class="mt-0.5 text-sm text-pretty text-muted">{{ t('account.guidance.help') }}</p>
              </div>
              <USwitch
                id="account-guidance"
                :model-value="guidance"
                aria-describedby="account-guidance-help"
                class="mt-0.5"
                :ui="{ base: 'relative max-lg:after:absolute max-lg:after:-inset-x-1.5 max-lg:after:-inset-y-3.5' }"
                @update:model-value="(value: boolean) => save('guidance', { preferences: { guidance: value } })"
              />
            </div>
          </AccountSection>

          <AccountSection id="backup" :title="t('account.backup.title')" :description="t('account.backup.description')">
            <AccountBackups :projects="projects ?? null" />
          </AccountSection>

          <AccountSection id="delete" :title="t('account.delete.title')" :description="t('account.delete.description')">
            <AccountDelete :email="account.email" :projects="projects?.length ?? 0" />
          </AccountSection>
        </div>
      </div>
    </main>
  </div>
</template>
