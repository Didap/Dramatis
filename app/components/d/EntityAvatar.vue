<script setup lang="ts">
/**
 * The picture of an entity. Characters are 3:4 portraits, like a theatre-programme headshot; other
 * entities are a rounded square with their icon. Without an image: the entity's tint with initials
 * (or its icon) in its ink. Photos get a 1px inset frame in the entity's colour.
 */
const props = withDefaults(defineProps<{
  name: string
  imageId?: string | null
  color?: string | null
  /** xs 1rem, sm a list row (1.5x2rem), md 2.25x3rem, lg 4.5x6rem, xl a desktop page (6x8rem). */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** portrait (3:4) for characters, square for everything else, round for dots in chips. */
  shape?: 'portrait' | 'square' | 'round'
  /** Icon instead of initials (places, objects, groups). */
  icon?: string
  /**
   * Text for assistive technology. Leave it out when the name is already written next to the
   * picture (rows, chips): the avatar is then decorative and not read twice.
   */
  alt?: string
}>(), { imageId: null, color: null, size: 'sm', shape: 'portrait', icon: undefined, alt: undefined })

const initials = computed(() =>
  props.name
    .trim()
    .split(/\s+/)
    .filter(word => /\p{L}/u.test(word))
    .slice(0, 2)
    .map(word => [...word].find(ch => /\p{L}/u.test(ch))!.toLocaleUpperCase())
    .join('') || '·',
)

const SIZES = {
  portrait: { xs: 'w-3 h-4 text-[0.45rem]', sm: 'w-6 h-8 text-[0.7rem]', md: 'w-9 h-12 text-sm', lg: 'w-18 h-24 text-2xl', xl: 'w-24 h-32 text-3xl' },
  square: { xs: 'size-4 text-[0.5rem]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-18 text-2xl', xl: 'size-24 text-3xl' },
  round: { xs: 'size-4 text-[0.5rem]', sm: 'size-6 text-[0.65rem]', md: 'size-8 text-xs', lg: 'size-12 text-base', xl: 'size-16 text-xl' },
} as const

const box = computed(() => SIZES[props.shape][props.size])
const radius = computed(() => (props.shape === 'round' ? 'rounded-full' : props.shape === 'portrait' ? 'rounded-[1.5px]' : 'rounded-[calc(var(--ui-radius)*2)]'))
const thumb = computed(() => props.size !== 'xl' && props.size !== 'lg')
const tint = computed(() => props.color
  ? { '--d-avatar-tint-bg': `var(--entity-${props.color}-tint)`, '--d-avatar-ink': `var(--entity-${props.color}-ink)`, '--d-avatar-frame': `var(--entity-${props.color})` }
  : undefined)
const failed = ref(false)
watch(() => props.imageId, () => { failed.value = false })
</script>

<template>
  <span
    class="d-entity-avatar relative inline-grid shrink-0 place-items-center overflow-hidden select-none"
    :class="[box, radius]"
    :style="tint"
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : 'true'"
  >
    <img
      v-if="imageId && !failed"
      :src="mediaUrl(imageId, thumb ? 'thumb' : 'full')"
      alt=""
      class="size-full object-cover"
      loading="lazy"
      @error="failed = true"
    >
    <UIcon v-else-if="icon" :name="icon" class="size-[55%]" aria-hidden="true" />
    <span v-else aria-hidden="true" class="font-semibold leading-none">{{ initials }}</span>
    <span v-if="imageId && !failed && color" class="pointer-events-none absolute inset-0 ring-1 ring-inset ring-(--d-avatar-frame)" :class="radius" aria-hidden="true" />
  </span>
</template>
