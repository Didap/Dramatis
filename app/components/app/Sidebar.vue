<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { NavGroup } from '~/composables/useProjectNav'

/** The desktop sidebar of the workspace (spec 1.3, DESIGN.md "Desktop shell"). */
const collapsed = defineModel<boolean>('collapsed', { default: false })
const { groups } = useProjectNav()
const { t } = useI18n()
const route = useRoute()
const search = useState('dramatis:search-open', () => false)

function toMenu(group: NavGroup): NavigationMenuItem[] {
  const items: NavigationMenuItem[] = group.items.map(item => ({
    label: item.label,
    icon: item.icon,
    to: item.to,
    exact: item.exact,
    active: item.exact ? route.path === item.to : route.path === item.to || route.path.startsWith(`${item.to}/`),
    ...(item.badge ? { badge: { label: String(item.badge), color: item.key === 'flow' ? 'warning' as const : 'neutral' as const, variant: 'subtle' as const, 'aria-label': item.badgeLabel } } : {}),
    tooltip: true,
  }))
  return group.label && !collapsed.value ? [{ label: group.label, type: 'label' }, ...items] : items
}

const main = computed(() => groups.value.filter(g => g.key !== 'footer'))
const footer = computed(() => groups.value.find(g => g.key === 'footer')!)
const ui = { link: 'font-normal data-active:font-medium data-active:text-highlighted data-active:before:bg-elevated', linkLeadingIcon: 'group-data-active:text-primary', label: 'text-xs font-medium text-muted px-2.5 pt-4 pb-1' }
</script>

<template>
  <UDashboardSidebar
    v-model:collapsed="collapsed"
    collapsible
    resizable
    :min-size="13"
    :default-size="15.5"
    :max-size="22"
    :collapsed-size="3.5"
    :toggle="false"
    class="hidden lg:flex"
    :ui="{ root: 'bg-muted border-e border-default/70', header: 'h-auto px-2 pt-3 pb-1', body: 'gap-0 px-2 pb-2', footer: 'border-t border-default/70 px-2 py-2 flex-col items-stretch gap-1' }"
  >
    <template #header="{ collapsed: c }">
      <AppProjectSwitcher :collapsed="c" />
    </template>

    <template #default="{ collapsed: c }">
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-search"
        :square="c"
        block
        class="mb-1 mt-1 justify-start text-muted"
        :aria-label="t('common.nav.searchHint')"
        @click="search = true"
      >
        <template v-if="!c">
          <span class="flex-1 text-start text-sm font-normal">{{ t('common.nav.search') }}</span>
          <span class="flex items-center gap-0.5"><UKbd value="meta" variant="subtle" size="sm" /><UKbd value="K" variant="subtle" size="sm" /></span>
        </template>
      </UButton>
      <UNavigationMenu
        v-for="group in main"
        :key="group.key"
        :collapsed="c"
        :items="toMenu(group)"
        orientation="vertical"
        :ui="ui"
      />
    </template>

    <template #footer="{ collapsed: c }">
      <UNavigationMenu :collapsed="c" :items="toMenu(footer)" orientation="vertical" :ui="ui" />
      <AppUserMenu :collapsed="c" />
    </template>
  </UDashboardSidebar>
</template>
