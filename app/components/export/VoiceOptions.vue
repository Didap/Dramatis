<script setup lang="ts">
import { OPTION_ROW } from './ManuscriptOptions.vue'

/**
 * The options of the voice-over script (appendix D.8): the delimiter, the filters by act, chapter and
 * speaker, and only revised and final scenes. Reports how many lines the file will hold.
 */
export interface VoiceExportOptions {
  delimiter: 'comma' | 'semicolon'
  partId: string | null
  chapterId: string | null
  speaker: string | null
  onlyRevised: boolean
}

interface VoiceSummary {
  total: number
  speakers: { key: string, label: string, characterId: string | null, lines: number }[]
  counts: { sceneId: string, speaker: string, lines: number }[]
}

const options = defineModel<VoiceExportOptions>({ required: true })
const lines = defineModel<number | null>('lines', { default: null })

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()

const ALL = '__all__'
const summary = ref<VoiceSummary | null>(null)
const failed = ref(false)

async function load() {
  failed.value = false
  try {
    summary.value = await $fetch<VoiceSummary>(`/api/projects/${store.projectId}/export/voice`)
  }
  catch {
    failed.value = true
  }
}
onMounted(load)

const usesParts = computed(() => store.project?.settings.parts ?? store.isGame)
const showParts = computed(() => usesParts.value && store.orderedParts.length > 0)

const parts = computed(() => [
  { value: ALL, label: t(`export.options.allParts.${store.kind}`) },
  ...store.orderedParts.map((p, i) => ({ value: p.id, label: p.title || `${term('part')} ${i + 1}` })),
])
const chapters = computed(() => [
  { value: ALL, label: t('export.options.allChapters') },
  ...store.orderedChapters
    .filter(c => !options.value.partId || c.partId === options.value.partId)
    .map(c => ({ value: c.id, label: `${store.chapterNumber(c.id)}. ${c.title || t('common.untitled.chapter')}` })),
])
// Speakers are the author's names (in the manuscript face); "everyone" and "no speaker" are the app's words.
const speakers = computed(() => [
  { value: ALL, label: t('export.options.allSpeakers'), name: false },
  ...(summary.value?.speakers ?? []).map(s => ({ value: s.key, label: s.label || t('export.options.noSpeaker'), name: !!s.label, ...(s.label ? { ui: { itemLabel: 'voice-author' } } : {}) })),
])
const delimiters = computed(() => (['comma', 'semicolon'] as const).map(value => ({ value, label: t(`export.options.delimiters.${value}`) })))

/** Lines matching the filters, from the per-scene counts and the outline in the store. */
const matching = computed(() => {
  if (!summary.value) return null
  const o = options.value
  let n = 0
  for (const count of summary.value.counts) {
    const scene = store.get('scenes', count.sceneId)
    if (!scene) continue
    const chapter = store.get('chapters', scene.chapterId)
    if (o.partId && chapter?.partId !== o.partId) continue
    if (o.chapterId && scene.chapterId !== o.chapterId) continue
    if (o.speaker && count.speaker !== o.speaker) continue
    if (o.onlyRevised && scene.status !== 'revised' && scene.status !== 'final') continue
    n += count.lines
  }
  return n
})
watch(matching, (n) => { lines.value = n }, { immediate: true })

// Filters remembered on this device may point to what is gone: an act once acts are off, a chapter or a
// speaker that no longer exists. They are dropped, so every filter in force is one the selects show.
watchEffect(() => {
  const o = options.value
  let { partId, chapterId, speaker } = o
  if (partId && (!showParts.value || !store.get('parts', partId))) partId = null
  const chapter = chapterId ? store.get('chapters', chapterId) : null
  if (chapterId && (!chapter || (partId && chapter.partId !== partId))) chapterId = null
  if (speaker?.startsWith('character:') && !store.get('characters', speaker.slice(10))) speaker = null
  else if (speaker && summary.value && !summary.value.speakers.some(s => s.key === speaker)) speaker = null
  if (partId !== o.partId || chapterId !== o.chapterId || speaker !== o.speaker) options.value = { ...o, partId, chapterId, speaker }
})

function set<K extends keyof VoiceExportOptions>(key: K, value: VoiceExportOptions[K]) {
  const next = { ...options.value, [key]: value }
  // A chapter of another act no longer fits the filter.
  if (key === 'partId' && next.chapterId && value && store.get('chapters', next.chapterId)?.partId !== value) next.chapterId = null
  options.value = next
}
const fromSelect = (value: unknown) => (value === ALL || !value ? null : String(value))
const row = `${OPTION_ROW} items-start`
</script>

<template>
  <div class="export-voice-options space-y-5">
    <URadioGroup
      :model-value="options.delimiter"
      variant="card"
      :legend="t('export.options.delimiter')"
      :items="delimiters"
      :ui="{ fieldset: 'gap-y-0', legend: 'text-sm', item: row }"
      @update:model-value="(v) => set('delimiter', v as VoiceExportOptions['delimiter'])"
    />
    <div class="grid gap-x-6 gap-y-4 sm:grid-cols-3">
      <UFormField v-if="showParts" :label="term('part')">
        <USelect :model-value="options.partId ?? ALL" :items="parts" class="w-full" :ui="{ base: 'min-h-11 sm:min-h-8' }" @update:model-value="(v: string) => set('partId', fromSelect(v))" />
      </UFormField>
      <UFormField :label="term('chapter')">
        <USelect :model-value="options.chapterId ?? ALL" :items="chapters" class="w-full" :ui="{ base: 'min-h-11 sm:min-h-8' }" @update:model-value="(v: string) => set('chapterId', fromSelect(v))" />
      </UFormField>
      <UFormField :label="t('export.options.speaker')">
        <USelect
          :model-value="options.speaker ?? ALL"
          :items="speakers"
          :loading="!summary && !failed"
          class="w-full"
          :ui="{ base: 'min-h-11 sm:min-h-8' }"
          @update:model-value="(v: string) => set('speaker', fromSelect(v))"
        >
          <template #default="{ modelValue }">
            <span :class="{ 'voice-author': speakers.find(s => s.value === modelValue)?.name }">{{ speakers.find(s => s.value === modelValue)?.label ?? t('export.options.allSpeakers') }}</span>
          </template>
        </USelect>
      </UFormField>
    </div>
    <UCheckbox
      :model-value="options.onlyRevised"
      variant="card"
      :label="t('export.options.onlyRevised')"
      :ui="{ root: row }"
      @update:model-value="(v: boolean | 'indeterminate') => set('onlyRevised', v === true)"
    />
    <p v-if="failed" class="flex flex-wrap items-center gap-x-1.5 text-sm text-error">
      <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />
      {{ t('export.options.voiceFailed') }}
      <UButton variant="link" color="error" :label="t('common.actions.retry')" class="min-h-11 px-1 sm:min-h-0" @click="load" />
    </p>
  </div>
</template>
