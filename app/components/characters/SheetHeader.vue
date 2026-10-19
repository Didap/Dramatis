<script setup lang="ts">
import { CHARACTER_ROLES, GAME_ONLY_ROLES } from '#shared/utils/constants'
import type { CharacterImportance, CharacterRole, EntityColor, PlanningStatus } from '#shared/types/domain'
import type { Character, UpdateInput } from '#shared/types/entities'
import { useCharacterSaves } from './saving'

/**
 * The head of the character sheet (spec 4.4): portrait, name, one-line description, then the facts
 * that place the character in the story: importance, role, planning status, colour, playable (games),
 * other names, labels. Everything edits in place and saves like typing (see saving.ts), so a choice
 * made offline is kept and sent when the connection comes back.
 */
const props = defineProps<{ character: Character }>()

const store = useProjectStore()
const { t } = useI18n()
const { label, options } = useEnums()
const { save } = useCharacterSaves()
const desktop = useMediaQuery('(min-width: 1024px)')
const uid = useId()

const TAGLINE_MAX = 140
/** Limits of the server (validation.ts): other names, labels. */
const ALIAS_MAX = 100
const ALIASES_MAX = 20
const TAG_MAX = 60
const TAGS_MAX = 40
/** Reka's select refuses an empty value: "no role" travels as this key. */
const NO_ROLE = 'none'

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase()
const duplicate = computed(() => {
  const name = fold(props.character.name)
  return !!name && store.rows.characters.some(c => c.id !== props.character.id && fold(c.name) === name)
})

const roleItems = computed(() => [
  { value: NO_ROLE, label: t('characters.sheet.noRole') },
  ...CHARACTER_ROLES
    .filter(role => store.isGame || !GAME_ONLY_ROLES.includes(role) || role === props.character.role)
    .map(role => ({ value: role, label: label('role', role) })),
])

/** A choice (select, switch, chips): sent at once, or after the save on its way. */
function set(patch: UpdateInput<'characters'>) {
  save('characters', props.character.id, patch, 0)
}

/** Short texts of a list as the server keeps them: trimmed, cut to length, no empties. */
function clean(values: string[], length: number, count: number) {
  return values.map(v => v.trim().slice(0, length)).filter(Boolean).slice(0, count)
}

// ---------------------------------------------------------------- one line, 140 characters

const taglineFocused = ref(false)
const taglineLeft = computed(() => TAGLINE_MAX - props.character.tagline.length)
/** Said to screen readers only near the limit, not at every keystroke. */
const taglineNotice = ref('')
watch(taglineLeft, (left) => {
  if (left > 20) taglineNotice.value = ''
  else if (left % 5 === 0) taglineNotice.value = t('characters.sheet.taglineLeft', { n: left }, left)
})

/** One line: a pasted line break becomes a space. */
function setTagline(value: string) {
  save('characters', props.character.id, { tagline: value.replace(/\s*[\r\n]+\s*/g, ' ') })
}

const fieldUi = { label: 'text-xs font-medium text-muted', container: 'mt-0.5' }
const chipUi = {
  item: 'min-h-6 text-[0.8125rem]',
  itemDelete: 'pointer-coarse:size-6 pointer-coarse:justify-center',
  itemDeleteIcon: 'pointer-coarse:size-4',
}
const selectUi = { base: 'pointer-coarse:min-h-11' }
/** One column per field from sm: importance, role, race (module), status, colour, playable (games). */
const FIELD_COLUMNS: Record<number, string> = {
  4: 'sm:grid-cols-[repeat(4,minmax(0,auto))]',
  5: 'sm:grid-cols-[repeat(5,minmax(0,auto))]',
  6: 'sm:grid-cols-[repeat(6,minmax(0,auto))]',
}
</script>

<template>
  <header class="characters-sheet-header">
    <h1 class="sr-only">{{ character.name }}</h1>
    <div class="flex items-start gap-4 sm:gap-6">
      <DEntityImage
        owner-type="character"
        :owner-id="character.id"
        :name="character.name"
        :color="character.color"
        :size="desktop ? 'xl' : 'lg'"
      />
      <div class="min-w-0 flex-1 pt-0.5">
        <DInlineText
          :model-value="character.name"
          required
          variant="title"
          :maxlength="200"
          :aria-label="t('characters.sheet.name')"
          class="voice-author text-[1.5rem]! leading-[1.2]! lg:text-[2.25rem]! lg:leading-[1.15]!"
          @update:model-value="(value: string) => save('characters', character.id, { name: value })"
        />
        <p v-if="duplicate" class="mt-1 flex items-center gap-1.5 text-sm text-warning">
          <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />
          {{ t('characters.sheet.duplicate', { name: character.name }) }}
        </p>
        <!-- Shift+Enter would start a second line in a one-line description. -->
        <div
          class="relative mt-1.5"
          @focusin="taglineFocused = true"
          @focusout="taglineFocused = false"
          @keydown.enter.shift.prevent
        >
          <DInlineText
            :model-value="character.tagline"
            multiline
            :maxlength="TAGLINE_MAX"
            :placeholder="t('characters.sheet.taglinePlaceholder')"
            :aria-label="t('characters.sheet.tagline')"
            :aria-describedby="`${uid}-count`"
            class="voice-author text-[1.0625rem]! leading-snug! italic text-muted! lg:text-lg!"
            @update:model-value="setTagline"
          />
          <p v-show="taglineFocused" :id="`${uid}-count`" class="tabular mt-0.5 text-end text-xs text-dimmed">
            {{ t('characters.sheet.taglineCount', { n: character.tagline.length, max: TAGLINE_MAX }) }}
          </p>
          <span class="sr-only" aria-live="polite">{{ taglineNotice }}</span>
        </div>
      </div>
    </div>

    <div
      class="mt-6 grid grid-cols-2 gap-x-4 gap-y-3"
      :class="FIELD_COLUMNS[4 + (store.isGame ? 1 : 0) + (store.modules.races ? 1 : 0)]"
    >
      <UFormField :label="t('characters.sheet.importance')" :ui="fieldUi">
        <USelect
          :model-value="character.importance"
          :items="options('importance')"
          color="neutral"
          variant="ghost"
          class="-ms-2.5 w-full"
          :ui="selectUi"
          @update:model-value="(value: unknown) => set({ importance: value as CharacterImportance })"
        />
      </UFormField>
      <UFormField :label="t('characters.sheet.role')" :ui="fieldUi">
        <USelect
          :model-value="character.role || NO_ROLE"
          :items="roleItems"
          color="neutral"
          variant="ghost"
          class="-ms-2.5 w-full"
          :ui="{ ...selectUi, value: character.role ? '' : 'text-muted' }"
          @update:model-value="(value: unknown) => set({ role: value === NO_ROLE ? '' : value as CharacterRole })"
        />
      </UFormField>
      <UFormField v-if="store.modules.races" :label="t('characters.sheet.race')" :ui="fieldUi">
        <CharactersRace :character="character" />
      </UFormField>
      <UFormField :label="t('characters.sheet.status')" :ui="fieldUi">
        <DStatusSelect
          :model-value="character.status"
          kind="planning"
          size="md"
          class="-ms-2.5 pointer-coarse:min-h-11"
          @update:model-value="(value: string) => set({ status: value as PlanningStatus })"
        />
      </UFormField>
      <UFormField :label="t('characters.sheet.color')" :ui="fieldUi">
        <DColorPicker
          :model-value="character.color"
          size="md"
          class="-ms-2.5 pointer-coarse:min-h-11"
          @update:model-value="(value: string) => set({ color: value as EntityColor })"
        />
      </UFormField>
      <UFormField v-if="store.isGame" :label="t('characters.sheet.playable')" :ui="fieldUi">
        <div class="flex h-9 items-center pointer-coarse:h-11">
          <USwitch
            :model-value="character.playable"
            size="lg"
            :aria-label="t('characters.sheet.playable')"
            @update:model-value="(value: boolean) => set({ playable: value })"
          />
        </div>
      </UFormField>
    </div>

    <div class="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-x-4">
      <UFormField :label="t('characters.sheet.aliases')" :ui="fieldUi">
        <UInputTags
          :model-value="character.aliases"
          :placeholder="t('characters.sheet.aliasesPlaceholder')"
          :max-length="ALIAS_MAX"
          :max="ALIASES_MAX"
          color="neutral"
          variant="ghost"
          add-on-blur
          add-on-paste
          class="-ms-2.5 w-full"
          :ui="{ ...chipUi, item: `${chipUi.item} voice-author font-normal`, input: 'min-w-32' }"
          @update:model-value="(value: string[]) => set({ aliases: clean(value, ALIAS_MAX, ALIASES_MAX) })"
        />
      </UFormField>
      <UFormField :label="t('characters.sheet.tags')" :ui="fieldUi">
        <DTagsInput
          :model-value="character.tags"
          size="md"
          :max-length="TAG_MAX"
          :max="TAGS_MAX"
          :ui="chipUi"
          class="-ms-2.5"
          @update:model-value="(value: string[]) => set({ tags: clean(value, TAG_MAX, TAGS_MAX) })"
        />
      </UFormField>
    </div>
  </header>
</template>
