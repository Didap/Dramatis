<script lang="ts">
import type { RichDoc } from '#shared/types/domain'
import { richToPlainText } from '#shared/utils/richtext'

/*
 * Comparing two texts (spec 5.7, P1): paragraph by paragraph first, then word by word inside the
 * paragraphs that changed, so long scenes stay quick and the differences read the way they were made.
 */

export type DiffPart = { type: 'same' | 'added' | 'removed', text: string }

/** Longest common subsequence of two token lists, as edit operations. null when it would be too large. */
function lcs(a: string[], b: string[], limit = 4_000_000): ('same' | 'added' | 'removed')[] | null {
  const n = a.length
  const m = b.length
  if ((n + 1) * (m + 1) > limit) return null
  const table = new Uint32Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * (m + 1) + j] = a[i] === b[j] ? table[(i + 1) * (m + 1) + j + 1]! + 1 : Math.max(table[(i + 1) * (m + 1) + j]!, table[i * (m + 1) + j + 1]!)
    }
  }
  const ops: ('same' | 'added' | 'removed')[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push('same')
      i++
      j++
    }
    else if (table[(i + 1) * (m + 1) + j]! >= table[i * (m + 1) + j + 1]!) {
      ops.push('removed')
      i++
    }
    else {
      ops.push('added')
      j++
    }
  }
  while (i++ < n) ops.push('removed')
  while (j++ < m) ops.push('added')
  return ops
}

function push(parts: DiffPart[], type: DiffPart['type'], text: string) {
  const last = parts.at(-1)
  if (last && last.type === type) last.text += text
  else parts.push({ type, text })
}

/** The words of two versions of one paragraph, with what was added and removed. */
function diffWords(before: string, after: string): DiffPart[] {
  const a = before.match(/\s+|[^\s]+/g) ?? []
  const b = after.match(/\s+|[^\s]+/g) ?? []
  const ops = lcs(a, b)
  if (!ops) return [{ type: 'removed', text: before }, { type: 'added', text: after }]
  const parts: DiffPart[] = []
  let i = 0
  let j = 0
  for (const op of ops) {
    if (op === 'same') {
      push(parts, 'same', a[i++]!)
      j++
    }
    else if (op === 'removed') push(parts, 'removed', a[i++]!)
    else push(parts, 'added', b[j++]!)
  }
  return parts
}

/** Paragraphs of the comparison from `before` to `after`: each a list of parts. */
export function compareDocs(before: RichDoc | null, after: RichDoc | null): DiffPart[][] {
  const a = richToPlainText(before).split(/\n{2,}/).filter(p => p.length)
  const b = richToPlainText(after).split(/\n{2,}/).filter(p => p.length)
  const ops = lcs(a, b) ?? [...a.map(() => 'removed' as const), ...b.map(() => 'added' as const)]
  const out: DiffPart[][] = []
  let i = 0
  let j = 0
  let removed: string[] = []
  let added: string[] = []
  // A run of removed paragraphs followed by added ones is a change: pair them and compare their words.
  const settle = () => {
    const pairs = Math.min(removed.length, added.length)
    for (let k = 0; k < pairs; k++) out.push(diffWords(removed[k]!, added[k]!))
    for (const p of removed.slice(pairs)) out.push([{ type: 'removed', text: p }])
    for (const p of added.slice(pairs)) out.push([{ type: 'added', text: p }])
    removed = []
    added = []
  }
  for (const op of ops) {
    if (op === 'same') {
      settle()
      out.push([{ type: 'same', text: a[i++]! }])
      j++
    }
    else if (op === 'removed') removed.push(a[i++]!)
    else added.push(b[j++]!)
  }
  settle()
  return out
}
</script>

<script setup lang="ts">
import type { PreviewRequest } from './RevisionsPanel.vue'

/**
 * A revision or a stored version, read in place of the editor (spec 5.7): read only, with the way back
 * ("Ripristina come nuova revisione", or "Usa questa revisione"), Confronta with the text being
 * written, and Chiudi.
 */
const props = defineProps<{
  request: PreviewRequest
  /** The text in the editor now, for Confronta. */
  current: () => RichDoc | null
}>()
const emit = defineEmits<{ close: [] }>()

const scene = useOpenScene()
const { t } = useI18n()
const toast = useToast()

const doc = shallowRef<RichDoc | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const busy = ref(false)
const comparing = ref(props.request.compare ?? false)

async function load() {
  status.value = 'loading'
  try {
    const answer = props.request.kind === 'snapshot' ? await scene.readSnapshot(props.request.id) : await scene.readRevision(props.request.id)
    doc.value = answer.content
    status.value = 'ready'
  }
  catch (error) {
    notifyError(error)
    status.value = 'error'
  }
}

watch(() => props.request.id, () => {
  comparing.value = props.request.compare ?? false
  void load()
}, { immediate: true })

const comparison = computed(() => (comparing.value && doc.value !== null ? compareDocs(doc.value, props.current()) : []))
const changes = computed(() => comparison.value.reduce((n, p) => n + p.filter(part => part.type !== 'same').length, 0))

async function bringBack() {
  busy.value = true
  try {
    if (props.request.kind === 'snapshot') {
      await scene.restoreSnapshot(props.request.id)
      toast.add({ title: t('editor.preview.restored'), icon: 'i-lucide-history' })
    }
    else {
      await scene.activateRevision(props.request.id)
      toast.add({ title: t('editor.revisions.inUseNow', { name: props.request.title }), icon: 'i-lucide-check' })
    }
    emit('close')
  }
  catch (error) {
    notifyError(error)
  }
  finally {
    busy.value = false
  }
}

defineShortcuts({ escape: () => emit('close') })
</script>

<template>
  <section :aria-label="t('editor.preview.label', { title: request.title })">
    <div class="sticky top-(--d-header) z-10 -mx-4 mb-8 space-y-2.5 border-b border-default bg-default px-4 py-3 sm:-mx-6 sm:px-6">
      <p class="flex min-w-0 items-baseline gap-2 text-sm">
        <UIcon :name="comparing ? 'i-lucide-git-compare' : 'i-lucide-eye'" class="size-4 shrink-0 self-center text-muted" aria-hidden="true" />
        <span class="min-w-0">
          <span class="text-muted">{{ request.kind === 'snapshot' ? t('editor.preview.snapshot') : t('editor.preview.revision') }}</span>{{ ' ' }}<span class="voice-author font-semibold text-highlighted">{{ request.title }}</span>
          <span class="ps-2 text-xs text-muted">{{ request.meta }}</span>
        </span>
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="sm"
          variant="outline"
          :icon="comparing ? 'i-lucide-eye' : 'i-lucide-git-compare'"
          :label="comparing ? t('editor.compare.stop') : t('editor.compare.start')"
          :aria-pressed="comparing"
          class="pointer-coarse:min-h-11"
          @click="comparing = !comparing"
        />
        <UButton
          variant="outline"
          size="sm"
          :icon="request.kind === 'snapshot' ? 'i-lucide-history' : 'i-lucide-check'"
          :label="request.kind === 'snapshot' ? t('editor.preview.restore') : t('editor.revisions.use')"
          :loading="busy"
          class="pointer-coarse:min-h-11"
          @click="bringBack"
        />
        <UButton size="sm" icon="i-lucide-x" :label="t('common.actions.close')" class="ms-auto pointer-coarse:min-h-11" @click="emit('close')" />
      </div>
      <p v-if="comparing && status === 'ready'" class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>{{ t('editor.compare.direction') }}</span>
        <span><ins class="d-diff-added">{{ t('editor.compare.addedLegend') }}</ins></span>
        <span><del class="d-diff-removed">{{ t('editor.compare.removedLegend') }}</del></span>
      </p>
    </div>
    <div v-if="status === 'loading'" class="space-y-3" aria-busy="true">
      <USkeleton v-for="i in 6" :key="i" class="h-5" :class="i % 3 ? 'w-full' : 'w-2/3'" />
    </div>
    <template v-else-if="status === 'ready'">
      <div v-if="comparing" class="d-manuscript-text d-diff">
        <p v-if="!changes" class="font-sans text-sm text-muted">{{ t('editor.compare.same') }}</p>
        <p v-for="(paragraph, i) in comparison" v-else :key="i">
          <template v-for="(part, k) in paragraph" :key="k">
            <ins v-if="part.type === 'added'" class="d-diff-added"><span class="sr-only">{{ t('editor.compare.addedStart') }}</span>{{ part.text }}<span class="sr-only">{{ t('editor.compare.end') }}</span></ins>
            <del v-else-if="part.type === 'removed'" class="d-diff-removed"><span class="sr-only">{{ t('editor.compare.removedStart') }}</span>{{ part.text }}<span class="sr-only">{{ t('editor.compare.end') }}</span></del>
            <span v-else>{{ part.text }}</span>
          </template>
        </p>
      </div>
      <EditorRichView v-else :doc="doc" class="d-preview" />
    </template>
    <p v-else class="text-sm text-muted">{{ t('editor.preview.error') }}</p>
  </section>
</template>

<style>
/* Differences: what the text in the editor adds is underlined, what it drops is struck through, both
   with words for screen readers. Colour helps, it never carries the meaning alone. */
.d-diff p {
  white-space: pre-wrap;
}
.d-diff-added {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.2em;
  text-decoration-color: var(--ui-success);
  background: color-mix(in oklch, var(--ui-success) 12%, transparent);
}
.d-diff-removed {
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
  text-decoration-color: var(--ui-error);
  color: var(--ui-text-muted);
  background: color-mix(in oklch, var(--ui-error) 10%, transparent);
}
</style>
