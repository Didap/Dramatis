<script setup lang="ts">
import type { CharacterProfileSection, RichNode } from '#shared/types/domain'
import { hasAnswers, hasFreeText, profileSectionsFor, questionLabel, sectionMode } from '~/components/characters/ProfileSections.vue'
import { useCharacterSaves } from '~/components/characters/saving'

/**
 * A profile section (spec 4.4, 5.2): the interview or free text, both kept. Answers and free text
 * save a second after the last keystroke, merged section by section and answer by answer as the
 * server does, kept and retried while offline, one save at a time (saving.ts). Previous and next
 * section at the foot (fixed above the bar on a phone).
 */
const route = useRoute()
const store = useProjectStore()
const { t, te } = useI18n()
const { term } = useTerms()
const toast = useToast()
const { save: saveSoon } = useCharacterSaves()
const desktop = useMediaQuery('(min-width: 1024px)')

const characterId = String(route.params.characterId)
const sectionKey = String(route.params.section)

const character = computed(() => store.get('characters', characterId))
const sections = computed(() => (character.value ? profileSectionsFor(store.kind, character.value.importance) : []))
const index = computed(() => sections.value.findIndex(s => s.key === sectionKey))
const section = computed(() => sections.value[index.value])
const previous = computed(() => (index.value > 0 ? sections.value[index.value - 1] : undefined))
const next = computed(() => (index.value >= 0 ? sections.value[index.value + 1] : undefined))

const content = computed(() => character.value?.profile[sectionKey])
const guidance = computed(() => store.project?.settings.guidance ?? true)
const sheetPath = computed(() => store.refPath({ type: 'character', id: characterId }))
const pathOf = (key: string) => `${sheetPath.value}/${key}`
const titleOf = (key: string) => t(`profile.sections.${key}.title`)

/** A change of this section only: the store and the server merge it into the rest of the profile. */
function save(patch: CharacterProfileSection, delay?: number) {
  if (character.value) saveSoon('characters', characterId, { profile: { [sectionKey]: patch } }, delay)
}

function answer(key: string, value: string) {
  save({ answers: { [key]: value } })
}

// ---------------------------------------------------------------- modes

/** The first answer has the focus when the page opens on a desktop, not when the author switches mode. */
const focusFirstAnswer = ref(desktop.value)
const mode = computed({
  get: () => sectionMode(content.value),
  set: (value: 'interview' | 'free') => {
    focusFirstAnswer.value = false
    save({ mode: value }, 0)
  },
})
const modeItems = computed(() => [
  { label: t('characters.section.interview'), value: 'interview', slot: 'interview' as const, icon: 'i-lucide-messages-square' },
  { label: t('characters.section.free'), value: 'free', slot: 'free' as const, icon: 'i-lucide-pen-line' },
])
const otherHasContent = computed(() => (mode.value === 'interview' ? hasFreeText(content.value) : hasAnswers(content.value)))

// UTabs gives its tab list no name of its own: name it here.
const modeSwitch = useTemplateRef<HTMLElement>('modeSwitch')
watchEffect(() => {
  modeSwitch.value?.querySelector('[role="tablist"]')?.setAttribute('aria-label', t('characters.section.mode'))
})

// ---------------------------------------------------------------- "Usa le risposte come traccia" (P1)

const paragraph = (content: RichNode[]): RichNode => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' })
const bold = (text: string) => paragraph([{ type: 'text', text, marks: [{ type: 'bold' }] }])

/** An answer as paragraphs: blank lines part paragraphs, a single line break stays a line break. */
const answerBlocks = (text: string): RichNode[] => text.split(/\n{2,}/).map(block => paragraph(block.split('\n').flatMap((line, i) => [
  ...(i ? [{ type: 'hardBreak' }] : []),
  ...(line ? [{ type: 'text', text: line }] : []),
])))

/** An empty free text starts from the questions and their answers; those the interview no longer asks come last. */
function useAnswersAsOutline() {
  const def = section.value
  if (!def || hasFreeText(content.value)) return
  const questions = def.questions as readonly string[]
  const answers = Object.fromEntries(Object.entries(content.value?.answers ?? {}).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
  const keys = [...questions.filter(k => answers[k]), ...Object.keys(answers).filter(k => !questions.includes(k))]
  const blocks: RichNode[] = []
  const unasked: string[] = []
  for (const key of keys) {
    const question = questionLabel(def.key, key, { t, te })
    if (!question) {
      unasked.push(key)
      continue
    }
    blocks.push(bold(question), ...answerBlocks(answers[key]!))
  }
  if (unasked.length) blocks.push(bold(t('characters.section.otherAnswers')), ...unasked.flatMap(key => answerBlocks(answers[key]!)))
  if (!blocks.length) return
  save({ free: { type: 'doc', content: blocks }, mode: 'free' }, 0)
  toast.add({ title: t('characters.section.outlineDone'), icon: 'i-lucide-check' })
}

const pageTitle = computed(() => (section.value && character.value ? `${titleOf(section.value.key)} · ${character.value.name}` : term('characters')))
</script>

<template>
  <DPage
    :title="pageTitle"
    :back="sheetPath"
    :back-label="character?.name ?? term('characters')"
    width="prose"
  >
    <template v-if="character && section">
      <CharactersTrashedNotice :character-id="characterId" />
      <DPageHeader :title="titleOf(section.key)">
        <template #eyebrow>
          <i18n-t scope="global" keypath="characters.section.eyebrow" tag="span" class="text-dimmed">
            <template #name>
              <NuxtLink :to="sheetPath" class="voice-author font-semibold text-toned underline-offset-3 hover:underline">{{ character.name }}</NuxtLink>
            </template>
            <template #n>{{ index + 1 }}</template>
            <template #total>{{ sections.length }}</template>
          </i18n-t>
        </template>
        <template v-if="guidance" #description>
          {{ t(`profile.sections.${section.key}.summary`) }}
        </template>
      </DPageHeader>

      <div ref="modeSwitch">
        <UTabs
          v-model="mode"
          :items="modeItems"
          color="neutral"
          variant="pill"
          size="sm"
          :ui="{
            root: 'items-stretch gap-0',
            list: 'w-fit rounded-[6px] p-0.5',
            indicator: 'rounded-[4.5px] bg-default shadow-xs ring ring-(--ui-border)',
            trigger: 'rounded-[4.5px] data-[state=active]:text-highlighted pointer-coarse:min-h-11 pointer-coarse:px-3',
            content: 'mt-6 pb-20 outline-none lg:pb-0',
          }"
        >
          <template #interview>
            <p v-if="otherHasContent" class="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <UIcon name="i-lucide-info" class="size-4 shrink-0" />
              <span>{{ t('characters.section.alsoFree') }}</span>
              <UButton variant="link" color="neutral" size="sm" class="px-0 pointer-coarse:min-h-11" :label="t('characters.section.showFree')" @click="mode = 'free'" />
            </p>
            <CharactersInterview
              :section="section"
              :answers="content?.answers ?? {}"
              :hints="guidance"
              :autofocus="focusFirstAnswer"
              @answer="answer"
            />
          </template>
          <template #free>
            <p v-if="otherHasContent" class="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <UIcon name="i-lucide-info" class="size-4 shrink-0" />
              <span>{{ t('characters.section.alsoAnswers') }}</span>
              <UButton
                v-if="!hasFreeText(content)"
                variant="link"
                color="primary"
                size="sm"
                class="px-0 underline pointer-coarse:min-h-11"
                :label="t('characters.section.useAsOutline')"
                @click="useAnswersAsOutline"
              />
              <UButton variant="link" color="neutral" size="sm" class="px-0 pointer-coarse:min-h-11" :label="t('characters.section.showInterview')" @click="mode = 'interview'" />
            </p>
            <CharactersRichField
              :model-value="content?.free"
              :placeholder="t('characters.section.freePlaceholder')"
              :aria-label="t('characters.section.free')"
              @update:model-value="doc => save({ free: doc })"
            />
          </template>
        </UTabs>
      </div>

      <nav
        :aria-label="t('characters.section.nav')"
        class="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-2 border-t border-default bg-default px-3 py-1.5 lg:static lg:mt-14 lg:border-t lg:px-0 lg:pt-4 lg:pb-0"
      >
        <UButton
          v-if="previous"
          :to="pathOf(previous.key)"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          class="min-w-0 pointer-coarse:min-h-11"
          :aria-label="`${t('characters.section.previous')}: ${titleOf(previous.key)}`"
        >
          <span class="flex min-w-0 flex-col items-start text-start leading-tight">
            <span class="hidden text-xs font-normal text-muted sm:block">{{ t('characters.section.previous') }}</span>
            <span class="max-w-full truncate">{{ titleOf(previous.key) }}</span>
          </span>
        </UButton>
        <span v-else />
        <UButton
          v-if="next"
          :to="pathOf(next.key)"
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-arrow-right"
          class="min-w-0 pointer-coarse:min-h-11"
          :aria-label="`${t('characters.section.next')}: ${titleOf(next.key)}`"
        >
          <span class="flex min-w-0 flex-col items-end text-end leading-tight">
            <span class="hidden text-xs font-normal text-muted sm:block">{{ t('characters.section.next') }}</span>
            <span class="max-w-full truncate">{{ titleOf(next.key) }}</span>
          </span>
        </UButton>
        <UButton
          v-else
          :to="sheetPath"
          color="neutral"
          variant="outline"
          icon="i-lucide-user-round"
          class="pointer-coarse:min-h-11"
          :label="t('characters.section.backToSheet')"
        />
      </nav>
    </template>

    <div v-else class="py-10">
      <p class="text-highlighted">{{ character ? t('characters.section.notFound') : t('characters.sheet.notFound') }}</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <UButton
          :to="character ? sheetPath : `/p/${store.projectId}/characters`"
          color="neutral"
          variant="outline"
          :label="character ? t('characters.section.backToSheet') : t('characters.sheet.backToList')"
        />
        <UButton
          v-if="!character"
          :to="`/p/${store.projectId}/trash`"
          color="neutral"
          variant="ghost"
          :label="t('characters.sheet.openTrash')"
        />
      </div>
    </div>
  </DPage>
</template>
