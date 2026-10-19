<script setup lang="ts">
import type { ProfileSectionDef } from '#shared/content/profile'
import { questionLabel } from './ProfileSections.vue'

/**
 * The interview of one profile section (spec 4.4, appendix A): the house asks in its own voice, the
 * author answers in theirs. Answers are kept by question key; one whose question the interview no
 * longer asks stays visible under "Altre risposte", with its question when another section asks it.
 */
const props = withDefaults(defineProps<{
  section: ProfileSectionDef
  answers: Record<string, string>
  /** Hint lines under the questions (guidance). */
  hints?: boolean
  /** Focus the first unanswered question (desktop only: on a phone the keyboard would cover the page). */
  autofocus?: boolean
}>(), { hints: true, autofocus: false })

const emit = defineEmits<{ answer: [key: string, value: string] }>()

const { t, te } = useI18n()
const store = useProjectStore()
const uid = useId()

const base = computed(() => `profile.sections.${props.section.key}.questions`)
const questions = computed(() => props.section.questions as readonly string[])
const others = computed(() =>
  Object.keys(props.answers).filter(key => !questions.value.includes(key) && props.answers[key]?.trim()),
)
const fieldId = (key: string) => `${uid}-${key}`
const hintId = (key: string) => `${uid}-${key}-hint`
const hasHint = (key: string) => props.hints && te(`${base.value}.${key}.hint`)
const otherQuestion = (key: string) => questionLabel(props.section.key, key, { t, te })

onMounted(() => {
  if (!props.autofocus) return
  const first = questions.value.find(key => !props.answers[key]?.trim()) ?? questions.value[0]
  if (first) document.getElementById(fieldId(first))?.focus({ preventScroll: false })
})
</script>

<template>
  <div>
    <ol class="space-y-9" role="list">
      <li v-for="key in questions" :key="key">
        <label :for="fieldId(key)" class="block text-[0.9375rem] font-medium leading-snug text-highlighted text-pretty">
          {{ t(`${base}.${key}.label`) }}
        </label>
        <p v-if="hasHint(key)" :id="hintId(key)" class="mt-1 text-sm text-muted text-pretty">
          {{ t(`${base}.${key}.hint`) }}
        </p>
        <CharactersAnswerField
          :id="fieldId(key)"
          class="mt-2"
          :model-value="answers[key] ?? ''"
          :lang="store.project?.language"
          :aria-describedby="hasHint(key) ? hintId(key) : undefined"
          @update:model-value="(value: string) => emit('answer', key, value)"
        />
      </li>
    </ol>

    <section v-if="others.length" class="mt-14" :aria-labelledby="`${uid}-others`">
      <h2 :id="`${uid}-others`" class="text-base font-semibold text-highlighted">{{ t('characters.section.otherAnswers') }}</h2>
      <p class="mt-1 text-sm text-muted">{{ t('characters.section.otherAnswersHint') }}</p>
      <div v-for="key in others" :key="key" class="mt-6">
        <label
          :for="fieldId(key)"
          class="block text-[0.9375rem] font-medium leading-snug text-pretty"
          :class="otherQuestion(key) ? 'text-highlighted' : 'text-muted'"
        >
          {{ otherQuestion(key) ?? t('characters.section.formerQuestion') }}
        </label>
        <CharactersAnswerField
          :id="fieldId(key)"
          class="mt-1.5"
          :model-value="answers[key] ?? ''"
          :lang="store.project?.language"
          @update:model-value="(value: string) => emit('answer', key, value)"
        />
      </div>
    </section>
  </div>
</template>
