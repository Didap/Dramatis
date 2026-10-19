<script lang="ts">
/**
 * Whether this browser prints the page numbers of the PDF. They come from @page margin boxes
 * ("@bottom-right { content: counter(page) }"), which Chromium (Chrome, Edge, from version 131) lays out and
 * Firefox and WebKit (Safari, and every browser on iPhone and iPad) drop when they read the style sheet:
 * a margin rule that survives parsing is the test.
 */
export function printsPageNumbers(): boolean {
  if (typeof document === 'undefined') return true
  const style = document.createElement('style')
  style.textContent = '@page { @bottom-center { content: counter(page); } }'
  document.head.append(style)
  try {
    const rule = style.sheet?.cssRules[0] as (CSSRule & { cssRules?: CSSRuleList }) | undefined
    return !!rule?.cssRules?.length
  }
  catch {
    return true
  }
  finally {
    style.remove()
  }
}
</script>

<script setup lang="ts">
/**
 * The note shown where a PDF is made, in a browser that would print it without page numbers (and, for the
 * book, maybe not on A5): Chrome or Edge print it as laid out, and the DOCX has real page numbers. With
 * `action`, a button offers the DOCX. Nothing is shown in Chromium.
 */
const props = withDefaults(defineProps<{ layout?: 'manuscript' | 'book', action?: boolean }>(), { layout: 'manuscript', action: false })
defineEmits<{ docx: [] }>()

const { t } = useI18n()
const missing = ref(false)
onMounted(() => { missing.value = !printsPageNumbers() })
const message = computed(() => t(props.layout === 'book' ? 'export.pageNumbers.missingBook' : 'export.pageNumbers.missing'))
</script>

<template>
  <div v-if="missing" class="export-page-numbers flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <p class="flex items-start gap-1.5 text-sm text-pretty text-toned">
      <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0 text-warning" />
      <span>{{ message }}</span>
    </p>
    <UButton
      v-if="action"
      color="neutral"
      variant="outline"
      size="sm"
      icon="i-lucide-file-text"
      :label="t('export.pageNumbers.useDocx')"
      class="min-h-11 shrink-0 self-start sm:min-h-0 sm:self-auto"
      @click="$emit('docx')"
    />
  </div>
</template>
