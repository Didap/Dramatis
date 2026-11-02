<script setup lang="ts">
import { useCharacterListFolded } from '~/components/characters/listPanel'

/**
 * The page of a character (spec 4.4): the sheet, with the way back and the trash. From xl, beside the
 * list, a button folds the list away and the sheet widens.
 */
const route = useRoute()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const wide = useMediaQuery('(min-width: 1280px)')
const folded = useCharacterListFolded()
const foldLabel = computed(() => t(folded.value ? 'characters.sheet.showList' : 'characters.sheet.hideList'))

const character = computed(() => store.get('characters', String(route.params.characterId)))
const listPath = computed(() => `/p/${store.projectId}/characters`)

const menu = computed(() => [[
  { label: t('characters.sheet.trash'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: trash },
]])

async function trash() {
  const target = character.value
  if (!target) return
  await navigateTo(listPath.value)
  await store.remove('characters', target.id).catch(() => {})
}
</script>

<template>
  <!-- From xl the list is beside the sheet: no way back is needed. -->
  <DPage
    v-if="character"
    :title="character.name"
    :back="wide ? undefined : listPath"
    :back-label="wide ? undefined : term('characters')"
    :width="wide && folded ? 'default' : 'prose'"
  >
    <template v-if="wide" #leading>
      <UTooltip :text="foldLabel">
        <UButton
          :icon="folded ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
          color="neutral"
          variant="ghost"
          class="-ms-1"
          :aria-label="foldLabel"
          :aria-expanded="!folded"
          aria-controls="characters-list"
          @click="folded = !folded"
        />
      </UTooltip>
    </template>
    <template #actions>
      <UTooltip :text="t('characters.sheet.menu')">
        <UDropdownMenu :items="menu" :content="{ align: 'end' }">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" class="pointer-coarse:size-11 pointer-coarse:justify-center" :aria-label="t('characters.sheet.menu')" />
        </UDropdownMenu>
      </UTooltip>
    </template>
    <CharactersTrashedNotice :character-id="character.id" />
    <CharactersSheet :character="character" />
  </DPage>

  <DPage v-else :title="term('characters')" :back="listPath" :back-label="term('characters')" width="prose">
    <div class="py-10">
      <p class="text-highlighted">{{ t('characters.sheet.notFound') }}</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <UButton :to="listPath" color="neutral" variant="outline" :label="t('characters.sheet.backToList')" />
        <UButton :to="`/p/${store.projectId}/trash`" color="neutral" variant="ghost" :label="t('characters.sheet.openTrash')" />
      </div>
    </div>
  </DPage>
</template>
