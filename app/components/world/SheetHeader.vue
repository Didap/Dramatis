<script lang="ts">
/** Items whose name has already taken the caret once in this session. */
const offered = new Set<string>()

/**
 * Whether a sheet opens on an item just created with a placeholder name ("Nuova fazione", from the
 * capture drawer or the palette), so that its name takes the caret, selected. The creator may say so
 * with `?new=1` (cleared at once); otherwise the item must carry one of the placeholder names (given
 * as i18n keys; a key that does not exist is skipped) and be at most two minutes old. Once per item:
 * a name the author chose to keep is left alone afterwards.
 */
export function useJustCreated() {
  const route = useRoute()
  const router = useRouter()
  const { t, te } = useI18n()
  return (item: { id: string, name: string, createdAt: string } | undefined, placeholders: string[]) => {
    const flagged = route.query.new === '1'
    if (flagged) {
      const query = { ...route.query }
      delete query.new
      void router.replace({ query })
    }
    if (!item || offered.has(item.id)) return false
    const recent = Date.now() - new Date(item.createdAt).getTime() < 120_000
    const names = placeholders.filter(key => te(key)).map(key => t(key))
    const fresh = flagged || (recent && names.includes(item.name.trim()))
    if (fresh) offered.add(item.id)
    return fresh
  }
}
</script>

<script setup lang="ts">
/**
 * The head of a world sheet: the primary image (upload, replace, remove), the name edited in place in
 * the author's face (display size on desktop, title size on a phone; a long name wraps instead of
 * being cut, but stays one line of text), and the short fields of the sheet in the default slot.
 */
const props = withDefaults(defineProps<{
  ownerType: 'group' | 'location' | 'object'
  ownerId: string
  name: string
  color?: string | null
  icon: string
}>(), { color: null })

const emit = defineEmits<{ 'update:name': [value: string] }>()

const { t } = useI18n()
const desktop = useIsDesktop()
const title = ref<HTMLElement | null>(null)

/** Where the author is busy: the sheet itself, a menu or a dialog they have just opened. */
const BUSY = '#main, [role="menu"], [role="dialog"][data-state="open"]'
let stopGuarding: (() => void) | null = null
onBeforeUnmount(() => stopGuarding?.())

/**
 * Puts the caret in the name with the text selected (a sheet just created with a placeholder name).
 * A drawer that has just closed (capture) hands the focus back to the button that opened it a moment
 * later, or drops it: for a second and a half the name takes it back, unless the author has moved
 * on meanwhile (a tap in the description, a menu just opened).
 */
function focusName() {
  const field = () => title.value?.querySelector<HTMLTextAreaElement>('textarea')
  const select = () => {
    const input = field()
    if (!input || document.activeElement === input) return
    input.focus()
    input.select()
  }
  select()
  stopGuarding?.()
  let retakes = 3
  const retake = () => {
    if (retakes-- > 0) select()
  }
  const onFocusIn = (event: FocusEvent) => {
    if (event.target === field()) return
    if (event.target instanceof Element && event.target.closest(BUSY)) stopGuarding?.()
    else retake()
  }
  const dropped = () => {
    if (!document.activeElement || document.activeElement === document.body) retake()
  }
  const timers = [setTimeout(dropped, 400), setTimeout(dropped, 900), setTimeout(() => stopGuarding?.(), 1500)]
  document.addEventListener('focusin', onFocusIn)
  stopGuarding = () => {
    document.removeEventListener('focusin', onFocusIn)
    timers.forEach(clearTimeout)
    stopGuarding = null
  }
}
defineExpose({ focusName })

/** Enter commits the name; it never starts a new line, not even with Shift. */
function onEnter(event: KeyboardEvent) {
  event.preventDefault()
  ;(event.target as HTMLElement).blur()
}
</script>

<template>
  <header class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-5 sm:gap-x-6">
    <DEntityImage
      :owner-type="props.ownerType"
      :owner-id="props.ownerId"
      :name="props.name"
      :color="props.color"
      :icon="props.icon"
      shape="square"
      :size="desktop ? 'xl' : 'lg'"
    />
    <div class="min-w-0 self-center">
      <h1 ref="title" @keydown.enter.capture="onEnter">
        <DInlineText
          :model-value="props.name"
          required
          multiline
          variant="title"
          :maxlength="200"
          :aria-label="t('common.fields.name')"
          class="voice-author leading-tight lg:text-4xl"
          @update:model-value="(value: string) => emit('update:name', value.replace(/\s*\n+\s*/g, ' '))"
        />
      </h1>
    </div>
    <div v-if="$slots.default" class="col-span-2 sm:col-span-1 sm:col-start-2">
      <slot />
    </div>
  </header>
</template>
