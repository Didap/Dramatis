<script setup lang="ts">
import type { Note } from '#shared/types/entities'

/**
 * The notebook (spec 4.3): notes in the author's order, pinned ones first, each with its title, when it
 * was last edited and its first line; a new note opens at once, ready to write. Reorder by drag,
 * Alt+Up/Down or menu; trash with undo. `pane` is the narrow list kept beside an open note from xl.
 */
withDefaults(defineProps<{ pane?: boolean }>(), { pane: false })

const store = useProjectStore()
const route = useRoute()
const { t } = useI18n()
const { term } = useTerms()
const desktop = useMediaQuery('(min-width: 1024px)')

const guidance = computed(() => store.project?.settings.guidance ?? true)
const pinned = computed(() => store.rows.notes.filter(n => n.pinned))
const others = computed(() => store.rows.notes.filter(n => !n.pinned))
const groups = computed(() => [
  { key: 'pinned', label: t('notes.pinnedGroup'), items: pinned.value },
  { key: 'others', label: t('notes.othersGroup'), items: others.value },
].filter(g => g.items.length))

/** The order of every note, pinned first, after one group was reordered. */
function onReorder(group: string, ids: string[]) {
  const all = group === 'pinned' ? [...ids, ...others.value.map(n => n.id)] : [...pinned.value.map(n => n.id), ...ids]
  store.reorder('notes', all).catch(() => {})
}

const creating = ref(false)

async function create() {
  if (creating.value) return
  creating.value = true
  try {
    const note = await store.create('notes', { title: '' })
    await navigateTo({ path: store.refPath({ type: 'note', id: note.id }), query: { new: '1' } })
  }
  catch {
    // The store has already said what went wrong.
  }
  finally {
    creating.value = false
  }
}

const label = (note: Note) => note.title.trim() || t('common.untitled.note')
</script>

<template>
  <section class="@container" :class="pane ? 'pb-10' : ''">
    <DPageHeader v-if="!pane" :title="term('notes')" :description="guidance ? t('notes.intro') : undefined">
      <template v-if="store.rows.notes.length" #actions>
        <UButton color="primary" :variant="desktop ? 'solid' : 'outline'" icon="i-lucide-plus" :loading="creating" :label="t('notes.new')" class="max-lg:min-h-11" @click="create" />
      </template>
    </DPageHeader>
    <div v-else class="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-default/60 bg-default px-4">
      <NuxtLink :to="`/p/${store.projectId}/notes`" class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ term('notes') }}</NuxtLink>
      <UTooltip :text="t('notes.new')">
        <UButton icon="i-lucide-plus" color="neutral" variant="ghost" :loading="creating" :aria-label="t('notes.new')" @click="create" />
      </UTooltip>
    </div>

    <div :class="pane ? 'px-2 pt-3' : ''">
      <div v-if="store.rows.notes.length" class="space-y-6">
        <section v-for="group in groups" :key="group.key" :aria-label="groups.length > 1 ? group.label : term('notes')">
          <h2 v-if="groups.length > 1" class="mb-1 px-2 text-sm font-medium text-muted" :class="pane ? '' : '-mx-2'">{{ group.label }}</h2>
          <ArchitectureSortableList
            :items="group.items"
            :item-label="label"
            :label="groups.length > 1 ? group.label : term('notes')"
            :class="pane ? '' : '-mx-2'"
            @reorder="(ids) => onReorder(group.key, ids)"
          >
            <template #default="{ item, first, last, move }">
              <NotesRow :note="item" :first="first" :last="last" :active="route.params.noteId === item.id" @move="move" />
            </template>
          </ArchitectureSortableList>
        </section>
      </div>

      <div v-else-if="!pane">
        <ArchitectureGhostRows leading="none" :lines="2" class="-mx-2" />
        <DEmptyState
          :title="t('notes.empty.title')"
          :description="guidance ? t('notes.empty.body') : undefined"
          :actions="[
            { label: t('notes.empty.action'), icon: 'i-lucide-plus', color: 'primary', variant: desktop ? 'solid' : 'outline', loading: creating, onClick: create, class: 'max-lg:min-h-11' },
            { label: t(`notes.empty.wayOut.${store.kind}`), color: 'neutral', variant: 'link', to: `/p/${store.projectId}/architecture/premise`, class: 'max-lg:min-h-11' },
          ]"
        />
      </div>
    </div>
  </section>
</template>
