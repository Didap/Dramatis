<script setup lang="ts">
import { docFromParagraphs } from '#shared/utils/richtext'
import { useManuscriptStructure } from '~/components/manuscript/Structure.vue'

/**
 * "Aggiungi" (spec 1.4): a quick note first and largest, with the keyboard up, so an idea takes
 * two taps; then a scene (appended to the last edited chapter), a character, a place, an object,
 * a group, an event, a codex entry.
 */
const open = defineModel<boolean>('open', { default: false })
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { date } = useFormat()
const note = ref('')
const busy = ref(false)

async function saveNote() {
  const text = note.value.trim()
  if (!text) return
  busy.value = true
  try {
    await store.create('notes', { title: date(new Date(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), content: docFromParagraphs(text.split(/\n{2,}/)) })
    note.value = ''
    open.value = false
    useToast().add({ title: t('common.capture.noteSaved'), icon: 'i-lucide-check' })
  }
  finally {
    busy.value = false
  }
}

const structure = useManuscriptStructure()

async function newScene() {
  // Appended to the last edited chapter; the manuscript creates the first chapter (in a part when parts are on)
  // and makes a game's first scene its start.
  const lastEdited = [...store.rows.scenes].filter(s => s.editedAt).sort((a, b) => b.editedAt!.localeCompare(a.editedAt!))[0]
  const scene = await structure.createScene({ chapterId: lastEdited?.chapterId ?? store.orderedChapters.at(-1)?.id })
  open.value = false
  await navigateTo(store.refPath({ type: 'scene', id: scene.id }))
}

async function newItem(collection: 'characters' | 'locations' | 'objects' | 'groups', type: 'character' | 'location' | 'object' | 'group', name: string) {
  const extra = collection === 'groups' && store.isGame ? { kind: 'faction' } : {}
  const row = await store.create(collection, { name, ...extra } as never)
  open.value = false
  await navigateTo(store.refPath({ type, id: row.id }))
}

async function newEvent() {
  const row = await store.create('events', { title: t('common.untitled.event') })
  open.value = false
  await navigateTo(store.refPath({ type: 'event', id: row.id }))
}

async function newCodexEntry() {
  const category = store.rows.codexCategories[0] ?? await store.create('codexCategories', { name: term('codex') })
  const row = await store.create('codexEntries', { categoryId: category.id, title: t('common.untitled.entry') })
  open.value = false
  await navigateTo(store.refPath({ type: 'codex', id: row.id }))
}

const actions = computed(() => [
  { key: 'scene', label: term('scene'), icon: 'i-lucide-file-plus', run: newScene },
  { key: 'character', label: term('character'), icon: SECTION_ICONS.characters, run: () => newItem('characters', 'character', t('common.untitled.character')) },
  { key: 'location', label: term('location'), icon: SECTION_ICONS.locations, run: () => newItem('locations', 'location', t('common.untitled.location')) },
  { key: 'object', label: term('object'), icon: SECTION_ICONS.objects, run: () => newItem('objects', 'object', store.isGame ? t('common.untitled.item') : t('common.untitled.object')) },
  { key: 'group', label: term('group'), icon: SECTION_ICONS.groups, run: () => newItem('groups', 'group', store.isGame ? t('common.untitled.faction') : t('common.untitled.group')) },
  { key: 'event', label: term('event'), icon: SECTION_ICONS.timeline, run: newEvent },
  ...(store.modules.codex ? [{ key: 'codex', label: term('codexEntry'), icon: SECTION_ICONS.codex, run: newCodexEntry }] : []),
])
</script>

<template>
  <UDrawer v-model:open="open" :title="t('common.nav.add')" :ui="{ body: 'pb-[calc(1rem+env(safe-area-inset-bottom))]' }">
    <template #body>
      <form class="space-y-2" @submit.prevent="saveNote">
        <label for="quick-note" class="text-sm font-medium text-default">{{ t('common.capture.quickNote') }}</label>
        <UTextarea
          id="quick-note"
          v-model="note"
          autofocus
          autoresize
          :rows="3"
          :placeholder="t('common.capture.placeholder')"
          class="w-full"
          :ui="{ base: 'voice-author text-base' }"
        />
        <UButton type="submit" color="primary" variant="solid" block :loading="busy" :disabled="!note.trim()" :label="t('common.capture.saveNote')" />
      </form>
      <ul class="mt-5 grid grid-cols-2 gap-1">
        <li v-for="action in actions" :key="action.key">
          <UButton color="neutral" variant="ghost" block class="min-h-11 justify-start" :icon="action.icon" :label="action.label" @click="action.run" />
        </li>
      </ul>
    </template>
  </UDrawer>
</template>
