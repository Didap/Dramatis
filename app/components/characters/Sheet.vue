<script setup lang="ts">
import { hasFullProfile } from '#shared/content/profile'
import { isEmptyDoc } from '#shared/utils/richtext'
import type { Character } from '#shared/types/entities'
import { hasHiddenProfile, profileSectionsFor } from './ProfileSections.vue'
import { useCharacterSaves } from './saving'

/**
 * The character sheet (spec 4.4): everything about this person in one place. The profile for main
 * and secondary characters, a description for minor ones (games: also the voice), traits, relationships, groups,
 * the scenes, the events, the lines spoken, images and notes. The page of a character, and whatever
 * else wants to show one whole (a slideover from a mention card).
 */
const props = defineProps<{ character: Character }>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { save } = useCharacterSaves()

const sections = computed(() => profileSectionsFor(store.kind, props.character.importance))
const full = computed(() => hasFullProfile(props.character.importance))
/** Main and secondary characters keep a description written before, above the sections. */
const showDescription = computed(() => !full.value || !isEmptyDoc(props.character.description))
const keptProfile = computed(() => !full.value && hasHiddenProfile(props.character.profile, sections.value))

// ---------------------------------------------------------------- images dropped on the gallery (spec 5.2 step 8)

const { attach, uploading } = useMediaUpload()
const dropping = ref(false)
let dropTimer: ReturnType<typeof setTimeout> | undefined
const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files')

/** dragover repeats while files hover the gallery; when it stops, the frame goes. */
function onDragOver(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  dropping.value = true
  clearTimeout(dropTimer)
  dropTimer = setTimeout(() => { dropping.value = false }, 200)
}

async function onDrop(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  clearTimeout(dropTimer)
  dropping.value = false
  const files = [...(event.dataTransfer?.files ?? [])].filter(file => file.type.startsWith('image/'))
  for (const file of files) await attach(file, { type: 'character', id: props.character.id }).catch(() => {})
}

// A file dropped just beside the gallery must not make the browser leave the page to show it.
const keepPage = (event: DragEvent) => { if (hasFiles(event)) event.preventDefault() }
useEventListener(window, 'dragover', keepPage)
useEventListener(window, 'drop', keepPage)
onBeforeUnmount(() => clearTimeout(dropTimer))
</script>

<template>
  <div class="characters-sheet">
    <CharactersSheetHeader :character="character" />

    <div class="mt-10 space-y-8">
      <CharactersSection v-if="showDescription" :title="t('characters.description.title')">
        <CharactersRichField
          :model-value="character.description"
          :placeholder="t('characters.description.placeholder')"
          :aria-label="t('characters.description.title')"
          @update:model-value="doc => save('characters', character.id, { description: doc })"
        />
        <p v-if="keptProfile" class="mt-3 flex items-start gap-2 text-sm text-muted">
          <UIcon name="i-lucide-archive" class="mt-0.5 size-4 shrink-0" />
          {{ t('characters.profile.kept') }}
        </p>
      </CharactersSection>

      <CharactersProfileSections v-if="sections.length" :character="character" />

      <CharactersTraits :character="character" />

      <CharactersSection :title="term('relations')">
        <RelationsPanel entity-type="character" :entity-id="character.id" />
      </CharactersSection>

      <CharactersGroups :character="character" />

      <CharactersSection :title="t('characters.appearances.title')">
        <ManuscriptAppearances entity-type="character" :entity-id="character.id" />
      </CharactersSection>

      <CharactersSection :title="term('event', 2)">
        <TimelineEntityEvents entity-type="character" :entity-id="character.id" />
      </CharactersSection>

      <CharactersLines v-if="store.modules.script" :character="character" />

      <CharactersSection :title="t('characters.images.title')">
        <div
          class="-m-2 rounded-[6px] p-2 outline-2 outline-offset-2 outline-dashed transition-[outline-color] duration-150"
          :class="dropping ? 'outline-(--ui-primary)' : 'outline-transparent'"
          @dragover="onDragOver"
          @drop="onDrop"
        >
          <DImageGallery owner-type="character" :owner-id="character.id" :name="character.name" />
          <p class="mt-2 hidden items-center gap-1.5 text-sm text-muted pointer-fine:flex" aria-live="polite">
            <UIcon v-if="uploading" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin" />
            {{ uploading ? t('characters.images.uploading') : t('characters.images.drop') }}
          </p>
        </div>
      </CharactersSection>

      <CharactersSection :title="t('characters.notes.title')">
        <CharactersRichField
          :model-value="character.notes"
          :placeholder="t('characters.notes.placeholder')"
          :aria-label="t('characters.notes.title')"
          @update:model-value="doc => save('characters', character.id, { notes: doc })"
        />
      </CharactersSection>
    </div>
  </div>
</template>
