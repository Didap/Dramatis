<script setup lang="ts">
/** "Altro" on the phone: every section that is not in the bottom bar, then projects and account. */
const open = defineModel<boolean>('open', { default: false })
const { groups } = useProjectNav()
const { t } = useI18n()
const route = useRoute()
watch(() => route.fullPath, () => { open.value = false })
</script>

<template>
  <UDrawer v-model:open="open" :title="t('common.nav.more')" :ui="{ body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }">
    <template #body>
      <nav class="space-y-4">
        <section v-for="group in groups" :key="group.key">
          <h2 v-if="group.label" class="px-2 pb-1 text-xs font-medium text-muted">{{ group.label }}</h2>
          <ul>
            <li v-for="item in group.items" :key="item.key">
              <NuxtLink :to="item.to" class="flex min-h-11 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 text-default hover:bg-elevated">
                <UIcon :name="item.icon" class="size-5 text-muted" />
                <span class="flex-1">{{ item.label }}</span>
                <UBadge v-if="item.badge" :label="String(item.badge)" :aria-label="item.badgeLabel" size="sm" />
              </NuxtLink>
            </li>
          </ul>
        </section>
        <section>
          <ul>
            <li><NuxtLink to="/projects" class="flex min-h-11 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 hover:bg-elevated"><UIcon name="i-lucide-library" class="size-5 text-muted" />{{ t('common.nav.projects') }}</NuxtLink></li>
            <li><NuxtLink to="/account" class="flex min-h-11 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 hover:bg-elevated"><UIcon name="i-lucide-circle-user-round" class="size-5 text-muted" />{{ t('common.nav.account') }}</NuxtLink></li>
          </ul>
        </section>
      </nav>
    </template>
  </UDrawer>
</template>
