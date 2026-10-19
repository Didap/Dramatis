<script setup lang="ts">
/**
 * A picture of the app drawn in real type, framed like a screenshot. To assistive technology it is
 * one image, named by its caption. Placed in a grid with `lg:row-span-2 lg:grid-rows-subgrid`,
 * frames side by side share their height and their captions line up.
 */
defineProps<{ caption: string }>()
const captionId = useId()
</script>

<template>
  <figure class="flex min-w-0 flex-col gap-3">
    <div
      role="img"
      :aria-labelledby="captionId"
      class="flex flex-col overflow-hidden rounded-[calc(var(--ui-radius)*2)] border border-default bg-default select-none"
    >
      <slot />
    </div>
    <figcaption :id="captionId" class="text-sm text-pretty text-muted">{{ caption }}</figcaption>
  </figure>
</template>
