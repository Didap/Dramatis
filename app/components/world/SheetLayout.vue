<script setup lang="ts">
/**
 * The frame of a world sheet. From xl the list of its section stays on the left while the sheet is
 * open on the right (spec 1.6, the inbox pattern), scrolled to the open item; below xl the sheet is a
 * page of its own.
 */
defineProps<{ listLabel: string }>()

const wide = useIsDesktop(1280)
const aside = ref<HTMLElement | null>(null)

watch(aside, async (element) => {
  if (!element) return
  await nextTick()
  element.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <div class="xl:grid xl:grid-cols-[18rem_minmax(0,1fr)]">
    <aside
      v-if="wide"
      ref="aside"
      class="sticky top-14 h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain border-e border-default/60 px-3 pt-6 pb-10"
      :aria-label="listLabel"
    >
      <slot name="list" />
    </aside>
    <div class="min-w-0 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-16">
      <div class="mx-auto max-w-3xl">
        <slot />
      </div>
    </div>
  </div>
</template>
