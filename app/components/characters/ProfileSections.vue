<script lang="ts">
import { PROFILE_SECTIONS } from '#shared/content/profile'
import type { ProfileSectionDef } from '#shared/content/profile'
import type { CharacterImportance, CharacterProfile, CharacterProfileSection, ProjectKind } from '#shared/types/domain'
import { countWords, docWordCount, isEmptyDoc } from '#shared/utils/richtext'

/**
 * The profile sections a character sees (spec 7.6): main characters every shared section, plus
 * gameplay and voice in game projects; in games secondary and minor characters keep voice.
 * Content of a section that is not shown is never deleted.
 */
export function profileSectionsFor(kind: ProjectKind, importance: CharacterImportance): readonly ProfileSectionDef[] {
  const sections = PROFILE_SECTIONS.filter(s => (s.media as readonly string[]).includes(kind))
  if (importance === 'main') return sections
  return kind === 'game' ? sections.filter(s => s.key === 'voice') : []
}

export function sectionMode(content: CharacterProfileSection | undefined): 'interview' | 'free' {
  return content?.mode ?? 'interview'
}

/** Questions of the section that have an answer. */
export function answeredQuestions(section: ProfileSectionDef, content: CharacterProfileSection | undefined): number {
  const answers = content?.answers ?? {}
  return (section.questions as readonly string[]).filter(key => answers[key]?.trim()).length
}

export function hasAnswers(content: CharacterProfileSection | undefined): boolean {
  return Object.values(content?.answers ?? {}).some(answer => answer.trim())
}

export function hasFreeText(content: CharacterProfileSection | undefined): boolean {
  return !isEmptyDoc(content?.free)
}

/** Words in the section's current mode: from ten words it counts as answered (spec 3.1). */
export function sectionWords(content: CharacterProfileSection | undefined): number {
  if (sectionMode(content) === 'free') return docWordCount(content?.free)
  return Object.values(content?.answers ?? {}).reduce((n, answer) => n + countWords(answer), 0)
}

/** true when some section the character cannot see right now still holds answers or text. */
export function hasHiddenProfile(profile: CharacterProfile, visible: readonly ProfileSectionDef[]): boolean {
  const shown = new Set(visible.map(s => s.key))
  return Object.entries(profile).some(([key, content]) => !shown.has(key) && (hasAnswers(content) || hasFreeText(content)))
}

/**
 * The question an answer was given to: asked in its own section, or now asked in another one; null
 * when the interview no longer asks it (appendix A: such answers stay, under "Altre risposte").
 */
export function questionLabel(
  sectionKey: string,
  key: string,
  i18n: { t: (key: string) => string, te: (key: string) => boolean },
): string | null {
  for (const section of [sectionKey, ...PROFILE_SECTIONS.map(s => s.key).filter(k => k !== sectionKey)]) {
    const path = `profile.sections.${section}.questions.${key}.label`
    if (i18n.te(path)) return i18n.t(path)
  }
  return null
}
</script>

<script setup lang="ts">
import type { Character } from '#shared/types/entities'

/**
 * The profile on the character sheet: one row per section with its progress ("5 di 14 risposte"),
 * each opening its own page. With guidance on, the interview has a way in: solid on a desktop, outlined
 * on a phone, where the bar's Aggiungi is already the solid control of the screen.
 */
const props = defineProps<{ character: Character }>()

const store = useProjectStore()
const { t } = useI18n()
const { words } = useFormat()
const desktop = useMediaQuery('(min-width: 1024px)')

const guidance = computed(() => store.project?.settings.guidance ?? true)
const sections = computed(() => profileSectionsFor(store.kind, props.character.importance))
const pathOf = (key: string) => `${store.refPath({ type: 'character', id: props.character.id })}/${key}`

const rows = computed(() => sections.value.map((section) => {
  const content = props.character.profile[section.key]
  const free = sectionMode(content) === 'free'
  const count = free ? docWordCount(content?.free) : 0
  return {
    key: section.key,
    icon: section.icon,
    title: t(`profile.sections.${section.key}.title`),
    free,
    progress: free
      ? (count ? t('characters.profile.free', { words: words(count) }) : t('characters.profile.freeEmpty'))
      : t('characters.profile.progress', { n: answeredQuestions(section, content), total: section.questions.length }),
    answered: sectionWords(content) >= 10,
    started: hasAnswers(content) || hasFreeText(content),
  }
}))

/** "Comincia l'intervista" on an empty profile, then "Continua" towards the first section still empty. */
const action = computed(() => {
  if (!guidance.value || props.character.importance !== 'main' || !rows.value.length) return null
  const next = rows.value.find(row => !row.answered)
  if (!next) return null
  const started = rows.value.some(row => row.started)
  return { to: pathOf(next.key), label: started ? t('characters.profile.continue') : t('characters.profile.start'), solid: !started && desktop.value }
})
</script>

<template>
  <CharactersSection :title="t('characters.profile.title')">
    <template v-if="action" #actions>
      <UButton
        :to="action.to"
        color="primary"
        :variant="action.solid ? 'solid' : 'outline'"
        size="sm"
        trailing-icon="i-lucide-arrow-right"
        class="pointer-coarse:min-h-11"
        :label="action.label"
      />
    </template>
    <ul role="list" class="-mx-2">
      <li v-for="row in rows" :key="row.key">
        <DRow :to="pathOf(row.key)" :name="row.title" ui-name>
          <template #leading>
            <span class="grid w-6 place-items-center" aria-hidden="true">
              <UIcon :name="row.icon" class="size-4 text-dimmed" />
            </span>
          </template>
          <template #numbers>
            <!-- Tabular figures for "5 di 14"; the free text's grouped word count reads better without. -->
            <span :class="[row.started ? 'text-toned' : 'text-muted', row.free ? '' : 'tabular']">{{ row.progress }}</span>
          </template>
          <template #trailing>
            <span class="grid w-5 place-items-center">
              <UIcon v-if="row.answered" name="i-lucide-check" class="size-4 text-success" aria-hidden="true" />
              <span v-if="row.answered" class="sr-only">{{ t('characters.profile.answered') }}</span>
            </span>
          </template>
        </DRow>
      </li>
    </ul>
  </CharactersSection>
</template>
