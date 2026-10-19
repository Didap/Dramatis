<script lang="ts">
/**
 * Whether the line for newcomers of a page is shown: while the project's guidance is on, until it is
 * dismissed for good on this device. Shared by the page (which decides where it goes) and <WorldIntro>.
 */
export function useWorldIntro(topic: string) {
  const store = useProjectStore()
  const key = `dramatis:intro:${topic}`
  const dismissed = useState(`dramatis-intro-${topic}`, () => {
    try {
      return localStorage.getItem(key) === '1'
    }
    catch {
      return false
    }
  })
  const visible = computed(() => store.project?.settings.guidance !== false && !dismissed.value)
  function dismiss() {
    dismissed.value = true
    try {
      localStorage.setItem(key, '1')
    }
    catch {}
  }
  return { visible, dismiss }
}
</script>

<script setup lang="ts">
/** The line for newcomers under a page title (DESIGN.md "Page header"), with its way to hide it. */
const props = defineProps<{ topic: string, text: string }>()

const { t } = useI18n()
const { dismiss } = useWorldIntro(props.topic)
const button = ref<HTMLButtonElement | null>(null)

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]'

/** Hides the line for good; the focus moves on to what follows it on the page. */
function hide() {
  const self = button.value
  const main = self?.closest('main')
  const next = self && main
    ? [...main.querySelectorAll<HTMLElement>(FOCUSABLE)].find(element => !!(self.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING))
    : undefined
  dismiss()
  void nextTick(() => next?.focus())
}
</script>

<template>
  <span>
    {{ props.text }}
    <button
      ref="button"
      type="button"
      class="ms-1 inline-block whitespace-nowrap text-sm text-dimmed underline underline-offset-3 hover:text-default max-lg:-my-3 max-lg:py-3"
      @click="hide"
    >{{ t('world.list.hideIntro') }}</button>
  </span>
</template>
