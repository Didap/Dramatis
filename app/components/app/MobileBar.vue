<script setup lang="ts">
/**
 * The phone navigation (spec 1.4): Panoramica, Manoscritto (Copione), Aggiungi (the capture drawer,
 * the screen's one solid control), Mondo, Altro. Labels always visible, 44px targets, safe area.
 */
const emit = defineEmits<{ capture: [], more: [] }>()
const store = useProjectStore()
const route = useRoute()
const { term } = useTerms()
const { t } = useI18n()

const base = computed(() => `/p/${store.projectId}`)
const WORLD = ['world', 'characters', 'groups', 'locations', 'objects', 'relations', 'codex']
const section = computed(() => route.path.slice(base.value.length + 1).split('/')[0] ?? '')
const isWorld = computed(() => WORLD.includes(section.value))
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default pb-[env(safe-area-inset-bottom)] lg:hidden"
    :aria-label="t('common.nav.more')"
  >
    <ul class="mx-auto grid h-14 max-w-lg grid-cols-5 items-stretch">
      <li>
        <NuxtLink :to="base" class="flex h-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium" :class="section === '' ? 'text-highlighted' : 'text-muted'" :aria-current="section === '' ? 'page' : undefined">
          <UIcon :name="SECTION_ICONS.overview" class="size-5" :class="section === '' ? 'text-primary' : ''" />
          {{ term('overview') }}
        </NuxtLink>
      </li>
      <li>
        <NuxtLink :to="`${base}/manuscript`" class="flex h-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium" :class="section === 'manuscript' ? 'text-highlighted' : 'text-muted'" :aria-current="section === 'manuscript' ? 'page' : undefined">
          <UIcon :name="store.isGame ? SECTION_ICONS.script : SECTION_ICONS.manuscript" class="size-5" :class="section === 'manuscript' ? 'text-primary' : ''" />
          {{ term('manuscript') }}
        </NuxtLink>
      </li>
      <li class="flex items-center justify-center">
        <button
          type="button"
          class="grid size-11 place-items-center rounded-full bg-primary text-inverted shadow-(--shadow-floating) outline-none hover:bg-(--ui-primary-hover)"
          :aria-label="t('common.nav.add')"
          @click="emit('capture')"
        >
          <UIcon :name="SECTION_ICONS.add" class="size-6" />
        </button>
      </li>
      <li>
        <NuxtLink :to="`${base}/world`" class="flex h-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium" :class="isWorld ? 'text-highlighted' : 'text-muted'" :aria-current="isWorld ? 'page' : undefined">
          <UIcon :name="SECTION_ICONS.world" class="size-5" :class="isWorld ? 'text-primary' : ''" />
          {{ term('world') }}
        </NuxtLink>
      </li>
      <li>
        <button type="button" class="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium text-muted" @click="emit('more')">
          <UIcon :name="SECTION_ICONS.more" class="size-5" />
          {{ t('common.nav.more') }}
        </button>
      </li>
    </ul>
  </nav>
</template>
