<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

/** The account menu: account page, theme, language, sign out. */
defineProps<{ collapsed?: boolean }>()
const { t, locale, setLocale } = useI18n()
const { user, clear } = useUserSession()
const colorMode = useColorMode()
const store = useProjectStore()

async function changeLocale(code: 'it' | 'en') {
  await setLocale(code)
  await $fetch('/api/account', { method: 'PATCH', body: { locale: code } }).catch(() => {})
}

async function changeTheme(theme: 'light' | 'dark' | 'system') {
  colorMode.preference = theme
  await $fetch('/api/account', { method: 'PATCH', body: { preferences: { theme } } }).catch(() => {})
}

async function signOut() {
  await store.flush()
  await store.flushProject()
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  store.reset()
  await navigateTo('/login')
}

const items = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.name ?? '', type: 'label' }],
  [{ label: t('common.nav.account'), icon: 'i-lucide-circle-user-round', to: '/account' }],
  [
    {
      label: t('common.theme.label'),
      icon: 'i-lucide-sun-moon',
      children: (['light', 'dark', 'system'] as const).map(theme => ({
        label: t(`common.theme.${theme}`),
        type: 'checkbox' as const,
        checked: colorMode.preference === theme,
        onSelect: (e: Event) => { e.preventDefault(); void changeTheme(theme) },
      })),
    },
    {
      label: t('common.language.label'),
      icon: 'i-lucide-languages',
      children: (['it', 'en'] as const).map(code => ({
        label: code === 'it' ? 'Italiano' : 'English',
        type: 'checkbox' as const,
        checked: locale.value === code,
        onSelect: (e: Event) => { e.preventDefault(); void changeLocale(code) },
      })),
    },
  ],
  [{ label: t('common.actions.signOut'), icon: 'i-lucide-log-out', onSelect: () => { void signOut() } }],
])
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'start', side: 'top' }" :ui="{ content: 'w-56' }">
    <UButton
      color="neutral"
      variant="ghost"
      :square="collapsed"
      class="w-full"
      :aria-label="collapsed ? `${user?.name ?? ''}, ${t('common.nav.account')}` : undefined"
    >
      <DEntityAvatar :name="user?.name ?? ''" shape="round" size="sm" color="slate" />
      <span v-if="!collapsed" class="min-w-0 flex-1 truncate text-start text-sm">{{ user?.name }}</span>
      <UIcon v-if="!collapsed" name="i-lucide-ellipsis-vertical" class="size-4 text-dimmed" />
    </UButton>
  </UDropdownMenu>
</template>
