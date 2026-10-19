<script setup lang="ts">
/**
 * The frame of every workspace page: a 3.5rem bar (breadcrumb or back link, save state, actions),
 * then the content at the page's width with the gutters of DESIGN.md. On a phone the bar becomes
 * the top bar (back, title, search). The page title itself lives in the content (DPageHeader).
 */
const props = withDefaults(defineProps<{
  /** Shown in the bar on a phone and as the document title. */
  title: string
  /** Where the back arrow leads (deeper pages); none on section roots. */
  back?: string
  backLabel?: string
  /** Content width: prose (reading), default, wide (tables, graphs), full (canvas). */
  width?: 'prose' | 'default' | 'wide' | 'full'
  /** Remove the padding of the content (canvases, split views). */
  bare?: boolean
}>(), { back: undefined, backLabel: undefined, width: 'default', bare: false })

const { t } = useI18n()
const store = useProjectStore()
const search = useState('dramatis:search-open', () => false)

useHead({ title: () => (store.project ? `${props.title} · ${store.project.title}` : props.title) })

const widthClass = computed(() => ({
  prose: 'max-w-3xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
}[props.width]))
</script>

<template>
  <div class="d-page flex min-h-full shrink-0 flex-col">
    <header class="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-default/60 bg-default/95 px-2 backdrop-blur-none sm:px-4 lg:px-6">
      <UButton
        v-if="back"
        :to="back"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        :aria-label="backLabel ?? t('common.actions.back')"
        class="-ms-1"
      />
      <div class="min-w-0 flex-1">
        <slot name="breadcrumb">
          <p class="truncate text-sm font-medium text-highlighted lg:hidden">{{ title }}</p>
          <p v-if="backLabel" class="hidden truncate text-sm text-muted lg:block">{{ backLabel }}</p>
        </slot>
      </div>
      <DSaveIndicator class="shrink-0" />
      <div class="flex shrink-0 items-center gap-1">
        <slot name="actions" />
        <UButton
          class="lg:hidden"
          icon="i-lucide-search"
          color="neutral"
          variant="ghost"
          :aria-label="t('common.nav.search')"
          @click="search = true"
        />
      </div>
    </header>
    <main
      id="main"
      class="mx-auto w-full flex-1"
      :class="[widthClass, bare ? '' : 'px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-16']"
    >
      <slot />
    </main>
  </div>
</template>
