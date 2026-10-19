<script setup lang="ts">
import type { CodexCategory } from '#shared/types/entities'
import { CODEX_DEFAULT_CATEGORIES } from '#shared/utils/constants'

/**
 * The codex, the lore of the world (module codex, spec 4.4): categories in the author's order, each
 * with its entries; a filter by category (`?category=` on the page; chips, or a select on a phone);
 * new entries and categories; rename, reorder and trash in place. `pane` is the narrow list kept
 * beside an open entry from xl.
 */
const props = withDefaults(defineProps<{ pane?: boolean }>(), { pane: false })

const store = useProjectStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { term } = useTerms()
const { number } = useFormat()
const desktop = useMediaQuery('(min-width: 1024px)')

const guidance = computed(() => store.project?.settings.guidance ?? true)
const categories = computed(() => store.rows.codexCategories)
const entriesOf = (categoryId: string) => store.rows.codexEntries.filter(e => e.categoryId === categoryId)

// ---------------------------------------------------------------- the category filter

const selected = useState<string | null>(`dramatis:codex-category:${store.projectId}`, () => null)

if (!props.pane) {
  // On the page the address says which category is shown (spec 1.5, ?category=).
  watch(() => route.query.category, (value) => {
    selected.value = typeof value === 'string' && store.get('codexCategories', value) ? value : null
  }, { immediate: true })
}

function select(categoryId: string | null) {
  selected.value = categoryId
  if (!props.pane) void router.replace({ query: { ...route.query, category: categoryId ?? undefined } })
}

// A category trashed (or gone with an undo) while shown alone: show them all again.
watch(() => categories.value.map(c => c.id), (ids) => {
  if (selected.value && !ids.includes(selected.value)) select(null)
})

const shown = computed(() => (selected.value ? categories.value.filter(c => c.id === selected.value) : categories.value))
const selectItems = computed(() => [
  { value: 'all', label: t('codex.allCategories') },
  ...categories.value.map(c => ({ value: c.id, label: `${c.name} (${number(entriesOf(c.id).length)})` })),
])

// ---------------------------------------------------------------- reorder categories

/** The new order of the categories, in one request (a reorder is not an edit: "last edited" stays). */
function reorderCategories(ids: string[]) {
  store.reorder('codexCategories', ids).catch(() => {})
}

// ---------------------------------------------------------------- creating

const busy = ref(false)

/** A new entry opens at once, with its title ready to be written. */
async function newEntry(categoryId?: string) {
  const target = categoryId ?? selected.value ?? categories.value[0]?.id
  if (!target || busy.value) return
  busy.value = true
  try {
    const entry = await store.create('codexEntries', { categoryId: target, title: t('common.untitled.entry') })
    await navigateTo({ path: store.refPath({ type: 'codex', id: entry.id }), query: { new: '1' } })
  }
  catch {
    // The store has already said what went wrong.
  }
  finally {
    busy.value = false
  }
}

const root = ref<HTMLElement | null>(null)
const addingCategory = ref(false)
const categoryDraft = ref('')
const categoryInput = ref<{ inputRef?: HTMLInputElement } | null>(null)
/**
 * The control that opened the new category field gets the focus back when the field closes; when it
 * is gone (redrawn, or an item of a closed menu), its stand-in: the menu's button or a "Nuova categoria".
 */
let opener: HTMLElement | null = null
let standIn = '.d-new-category'

async function startCategory() {
  const active = document.activeElement
  opener = active instanceof HTMLElement && active !== document.body ? active : null
  standIn = opener?.closest('[role="menu"]') ? '[data-codex-menu]' : '.d-new-category'
  categoryDraft.value = ''
  addingCategory.value = true
  await nextTick()
  categoryInput.value?.inputRef?.focus()
}

async function closeCategory() {
  addingCategory.value = false
  await nextTick()
  const target = opener?.isConnected ? opener : root.value?.querySelector<HTMLElement>(standIn)
  target?.focus()
  opener = null
}

async function createCategory() {
  const name = categoryDraft.value.trim()
  if (!name || busy.value) return
  busy.value = true
  try {
    const category = await store.create('codexCategories', { name })
    select(category.id)
    await closeCategory()
  }
  catch {
    // The store has already said what went wrong.
  }
  finally {
    busy.value = false
  }
}

// A default category's name, from codex.json: the typecheck fails when one is missing in either language.
type NamesIt = (typeof import('~~/i18n/locales/it/codex.json'))['codex']['defaults']
type NamesEn = (typeof import('~~/i18n/locales/en/codex.json'))['codex']['defaults']
const defaultName = (key: keyof NamesIt & keyof NamesEn) => t(`codex.defaults.${key}`)

/** The seven categories a game starts with, in the author's language. */
async function createSuggested() {
  if (busy.value) return
  busy.value = true
  try {
    for (const key of CODEX_DEFAULT_CATEGORIES) await store.create('codexCategories', { name: defaultName(key) })
  }
  catch {
    // The store has already said what went wrong.
  }
  finally {
    busy.value = false
  }
}

const headerMenu = computed(() => [[{ label: t('codex.newCategory'), icon: 'i-lucide-folder-plus', onSelect: () => { void startCategory() } }]])
/** The menu gives the focus back to its button when it closes: when it opened the new category field, the field takes it. */
const headerMenuContent = {
  align: 'end' as const,
  onCloseAutoFocus: (event: Event) => {
    if (!addingCategory.value) return
    event.preventDefault()
    categoryInput.value?.inputRef?.focus()
  },
}
const label = (category: CodexCategory) => category.name
</script>

<template>
  <section ref="root" class="@container" :class="pane ? 'pb-10' : ''">
    <!-- The module is off: the data stays, the page says where to bring it back. -->
    <DEmptyState
      v-if="!store.modules.codex"
      icon="i-lucide-library-big"
      :title="t('codex.moduleOff')"
      :actions="[{ label: t('codex.openSettings'), to: `/p/${store.projectId}/settings`, color: 'neutral', variant: 'outline', class: 'max-lg:min-h-11' }]"
    />

    <template v-else>
      <template v-if="!pane">
        <DPageHeader :title="term('codex')" :description="guidance ? t(`codex.intro.${store.kind}`) : undefined">
          <template v-if="categories.length" #actions>
            <UButton v-if="store.rows.codexEntries.length" color="primary" :variant="desktop ? 'solid' : 'outline'" icon="i-lucide-plus" :loading="busy" :label="t('codex.newEntry')" class="max-lg:min-h-11" @click="newEntry()" />
            <UDropdownMenu :items="headerMenu" :content="headerMenuContent">
              <UButton data-codex-menu icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="t('codex.moreActions')" class="max-lg:size-11 max-lg:justify-center" />
            </UDropdownMenu>
          </template>
        </DPageHeader>
        <DGuide v-if="guidance" topic="codex" :default-open="false" class="-mt-3 mb-6" />
      </template>
      <div v-else class="sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-default/60 bg-default px-4">
        <NuxtLink :to="`/p/${store.projectId}/codex`" class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ term('codex') }}</NuxtLink>
        <UTooltip :text="t('codex.newEntry')">
          <UButton icon="i-lucide-plus" color="neutral" variant="ghost" :loading="busy" :aria-label="t('codex.newEntry')" @click="newEntry()" />
        </UTooltip>
        <UDropdownMenu :items="headerMenu" :content="headerMenuContent">
          <UButton data-codex-menu icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="t('codex.moreActions')" />
        </UDropdownMenu>
      </div>

      <div :class="pane ? 'px-2 pt-3' : ''">
        <!-- No categories at all: the suggested seven, or one of the author's own. -->
        <div v-if="!categories.length && !addingCategory">
          <ArchitectureGhostRows leading="none" :lines="2" class="-mx-2" />
          <DEmptyState
            :title="t(`codex.empty.title.${store.kind}`)"
            :description="guidance ? t('codex.empty.noCategories') : undefined"
            :actions="[
              { label: t('codex.createSuggested'), icon: 'i-lucide-library-big', color: 'primary', variant: desktop ? 'solid' : 'outline', loading: busy, onClick: createSuggested, class: 'max-lg:min-h-11' },
              { label: t('codex.newCategory'), color: 'neutral', variant: 'link', class: 'd-new-category max-lg:min-h-11', onClick: startCategory },
            ]"
          />
        </div>

        <template v-else>
          <!-- Filter by category: chips, or a select on a phone. -->
          <div v-if="categories.length > 1 && store.rows.codexEntries.length" class="mb-4">
            <div v-if="!pane" role="group" :aria-label="t('codex.filter')" class="-mx-1 hidden flex-wrap gap-1.5 px-1 sm:flex">
              <UButton
                size="sm"
                color="neutral"
                :variant="selected === null ? 'soft' : 'ghost'"
                :class="selected === null ? 'text-highlighted' : 'text-muted'"
                :aria-pressed="selected === null"
                class="max-lg:min-h-11"
                @click="select(null)"
              >
                {{ t('codex.all') }}
                <span class="tabular text-dimmed">{{ number(store.rows.codexEntries.length) }}</span>
              </UButton>
              <UButton
                v-for="category in categories"
                :key="category.id"
                size="sm"
                color="neutral"
                :variant="selected === category.id ? 'soft' : 'ghost'"
                :class="selected === category.id ? 'text-highlighted' : 'text-muted'"
                :aria-pressed="selected === category.id"
                class="max-lg:min-h-11"
                @click="select(selected === category.id ? null : category.id)"
              >
                {{ category.name }}
                <span class="tabular text-dimmed">{{ number(entriesOf(category.id).length) }}</span>
              </UButton>
            </div>
            <USelect
              :model-value="selected ?? 'all'"
              :items="selectItems"
              :aria-label="t('codex.filter')"
              class="w-full max-lg:min-h-11"
              :class="pane ? '' : 'sm:hidden'"
              @update:model-value="(value) => select(value === 'all' ? null : String(value))"
            />
          </div>

          <!-- No entries yet: what the codex is for, the first entry. -->
          <div v-if="!store.rows.codexEntries.length && !pane" class="mb-8">
            <ArchitectureGhostRows leading="none" :lines="2" class="-mx-2" />
            <DEmptyState
              :title="t(`codex.empty.title.${store.kind}`)"
              :description="guidance ? t(`codex.empty.body.${store.kind}`) : undefined"
              :actions="[
                { label: t('codex.empty.action'), icon: 'i-lucide-plus', color: 'primary', variant: desktop ? 'solid' : 'outline', loading: busy, onClick: () => newEntry(), class: 'max-lg:min-h-11' },
                { label: t('codex.empty.wayOut'), color: 'neutral', variant: 'link', class: 'd-new-category max-lg:min-h-11', onClick: startCategory },
              ]"
            />
          </div>

          <ArchitectureSortableList
            :items="shown"
            :item-label="label"
            :label="t('codex.categories')"
            handle=".codex-category-handle"
            :disabled="!!selected"
            item-class="pb-5"
            :class="pane ? '' : '-mx-2'"
            @reorder="reorderCategories"
          >
            <template #default="{ item, first, last, move }">
              <CodexCategory
                :category="item"
                :entries="entriesOf(item.id)"
                :first="first"
                :last="last"
                :alone="!!selected"
                @move="move"
                @new-entry="newEntry"
              />
            </template>
          </ArchitectureSortableList>
        </template>

        <!-- A new category, in place. -->
        <form v-if="addingCategory" class="mt-2 flex flex-col gap-2 rounded-[calc(var(--ui-radius)*2)] bg-muted p-3 @lg:flex-row @lg:items-end" @submit.prevent="createCategory" @keydown.esc.stop="closeCategory">
          <UFormField :label="t('codex.categoryName')" class="min-w-0 flex-1">
            <UInput ref="categoryInput" v-model="categoryDraft" maxlength="200" :placeholder="t('codex.categoryPlaceholder')" class="w-full" :ui="{ base: 'voice-author text-base max-lg:min-h-11' }" />
          </UFormField>
          <div class="flex gap-2">
            <UButton type="submit" color="neutral" variant="outline" :loading="busy" :disabled="!categoryDraft.trim()" :label="t('common.actions.create')" class="max-lg:min-h-11" />
            <UButton color="neutral" variant="ghost" :label="t('common.actions.cancel')" class="max-lg:min-h-11" @click="closeCategory" />
          </div>
        </form>
        <UButton
          v-else-if="categories.length && !pane"
          color="neutral"
          variant="ghost"
          icon="i-lucide-folder-plus"
          :label="t('codex.newCategory')"
          class="d-new-category -ms-2.5 max-lg:min-h-11"
          @click="startCategory"
        />
      </div>
    </template>
  </section>
</template>
