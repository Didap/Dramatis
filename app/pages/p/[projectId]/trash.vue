<script setup lang="ts">
import type { TrashCollection, TrashItem } from '~~/server/api/projects/[projectId]/trash/index.get'
import type { RefType } from '#shared/types/domain'
import { REF_TO_COLLECTION } from '#shared/utils/constants'
import type { TrashDisplay } from '~/components/trash/Row.vue'

/**
 * The trash (spec 4.6): get something back, or let it go for good. What was trashed by one action
 * is one row (a chapter with its scenes, a character with its images) and comes back together.
 * Rows are grouped by kind; deleting for good and emptying ask once, inline, and say how many
 * choices of other scenes go with the scenes (spec 5.5).
 */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { number, localeTag } = useFormat()
const toast = useToast()

const url = computed(() => `/api/projects/${store.projectId}/trash`)
const { data: items, status, error, refresh } = useLazyFetch<TrashItem[]>(url)

interface Batch {
  head: TrashItem
  members: TrashItem[]
}

const OWNERS = new Set<TrashCollection>(['characters', 'groups', 'locations', 'objects', 'codexEntries', 'codexCategories'])
const keyOf = (item: { collection: string, id: string }) => `${item.collection}:${item.id}`

/** Batches: the items that left by one action (same deletedAt), each led by the item that was trashed. */
const batches = computed<Batch[]>(() => {
  const byStamp = new Map<string, TrashItem[]>()
  for (const item of items.value ?? []) byStamp.set(item.deletedAt, [...(byStamp.get(item.deletedAt) ?? []), item])
  const out: Batch[] = []
  for (const group of byStamp.values()) {
    const index = new Map(group.map(item => [keyOf(item), item]))
    const rootOf = (item: TrashItem) => {
      let current = item
      const seen = new Set<TrashItem>()
      while (current.parent && current.withParent) {
        const parent = index.get(keyOf(current.parent))
        if (!parent || seen.has(parent)) break
        seen.add(parent)
        current = parent
      }
      return current
    }
    const heads = new Map<string, Batch>()
    const images: TrashItem[] = []
    for (const item of group) {
      if (rootOf(item) !== item) continue
      if (item.collection === 'images') images.push(item)
      else heads.set(keyOf(item), { head: item, members: [] })
    }
    for (const item of group) {
      const root = rootOf(item)
      if (root !== item) heads.get(keyOf(root))?.members.push(item)
    }
    // Images left with their owner when the batch has one; an image trashed alone stands alone.
    const owners = [...heads.values()].filter(b => OWNERS.has(b.head.collection))
    if (images.length && heads.size === 1 && owners.length === 1) owners[0]!.members.push(...images)
    else for (const image of images) heads.set(keyOf(image), { head: image, members: [] })
    out.push(...heads.values())
  }
  return out
})

const ORDER: TrashCollection[] = ['scenes', 'chapters', 'parts', 'characters', 'groups', 'locations', 'objects', 'strands', 'notes', 'events', 'codexEntries', 'codexCategories', 'relations', 'maps', 'links', 'variables', 'images', 'revisions']

const ICONS: Partial<Record<TrashCollection, string>> = {
  scenes: REF_ICONS.scene,
  chapters: REF_ICONS.chapter,
  parts: 'i-lucide-library',
  characters: REF_ICONS.character,
  groups: REF_ICONS.group,
  locations: REF_ICONS.location,
  objects: REF_ICONS.object,
  strands: REF_ICONS.strand,
  notes: REF_ICONS.note,
  events: REF_ICONS.event,
  codexEntries: REF_ICONS.codex,
  codexCategories: 'i-lucide-folder',
  relations: 'i-lucide-network',
  maps: 'i-lucide-waypoints',
  links: 'i-lucide-split',
  variables: 'i-lucide-variable',
  images: 'i-lucide-image',
  revisions: 'i-lucide-history',
}

function heading(collection: TrashCollection) {
  switch (collection) {
    case 'scenes': return term('scene', 2)
    case 'chapters': return term('chapter', 2)
    case 'parts': return term('part', 2)
    case 'characters': return term('characters')
    case 'groups': return term('groups')
    case 'locations': return term('locations')
    case 'objects': return term('objects')
    case 'strands': return term('strands')
    case 'notes': return term('notes')
    case 'events': return term('event', 2)
    case 'codexEntries': return t('trash.types.codexEntries')
    case 'variables': return term('variables')
    case 'revisions': return term('revision', 2)
    default: return t(`trash.types.${collection}`)
  }
}

const UNTITLED: Partial<Record<TrashCollection, string>> = {
  scenes: 'common.untitled.scene',
  chapters: 'common.untitled.chapter',
  parts: 'common.untitled.part',
  notes: 'common.untitled.note',
  maps: 'common.untitled.map',
  images: 'trash.untitled.image',
  relations: 'trash.untitled.relation',
  links: 'trash.untitled.link',
  revisions: 'trash.untitled.revision',
}

// The trash names what a relationship or a choice joins as one line ("Anna, Marco"): the names known
// here (live or in the trash) tell where one ends and the other begins, even with a comma inside.
const ENTITY_COLLECTIONS = new Set<TrashCollection>(['characters', 'groups', 'locations', 'objects'])
const entityNames = computed(() => new Set([
  ...store.worldEntities.map(e => e.name),
  ...(items.value ?? []).filter(i => ENTITY_COLLECTIONS.has(i.collection)).map(i => i.title),
]))
const sceneNames = computed(() => new Set([
  ...store.rows.scenes.map(s => s.title || s.code),
  ...(items.value ?? []).filter(i => i.collection === 'scenes').map(i => i.title),
]))
function pair(detail: string | undefined, known: Set<string>): [string, string] | null {
  if (!detail) return null
  for (let i = detail.indexOf(', '); i >= 0; i = detail.indexOf(', ', i + 1)) {
    const a = detail.slice(0, i)
    const b = detail.slice(i + 2)
    if (known.has(a) && known.has(b)) return [a, b]
  }
  return null
}
const both = (names: [string, string]) => new Intl.ListFormat(localeTag.value, { type: 'conjunction' }).format(names)

/** What a row says, in the right voice: titles are the author's, placeholders the app's. */
function displayOf(item: TrashItem): TrashDisplay {
  const title = item.title.trim()
  const placeholder = t(UNTITLED[item.collection] ?? 'trash.untitled.item')
  switch (item.collection) {
    case 'variables':
      return { name: title || placeholder, voice: title ? 'mono' : 'ui', label: title || placeholder }
    case 'relations': {
      const names = pair(item.detail, entityNames.value)
      const joined = names ? both(names) : item.detail ?? ''
      if (!joined) return { name: title || placeholder, voice: title ? 'author' : 'ui', label: title || placeholder }
      const label = t('trash.labels.relation', { name: joined })
      return { name: joined, voice: 'author', epithet: title || undefined, label: title ? `${label}, ${title}` : label }
    }
    case 'images': {
      const owner = item.detail ?? ''
      if (!owner) return { name: title || placeholder, voice: title ? 'author' : 'ui', label: title || placeholder }
      const label = t('trash.labels.image', { name: owner })
      return { name: owner, voice: 'author', frame: 'trash.labels.image', epithet: title || undefined, label: title ? `${label}, ${title}` : label }
    }
    case 'links': {
      const scenes = pair(item.detail, sceneNames.value)
      const context = scenes ? t('trash.fromTo', { from: scenes[0], to: scenes[1] }) : item.detail ?? ''
      const name = title || placeholder
      return { name, voice: title ? 'author' : 'ui', context: context || undefined, label: context ? `${name}, ${context}` : name }
    }
    default:
      return { name: title || placeholder, voice: title ? 'author' : 'ui', label: title || placeholder }
  }
}
const nameOf = (item: TrashItem) => displayOf(item).label

/** The scenes of a batch: deleting them for good deletes the choices that lead to them (foreign keys). */
const scenesOf = (batch: Batch) => [batch.head, ...batch.members].filter(i => i.collection === 'scenes').map(i => i.id)
/** Live choices of other scenes leading to these scenes (choices leaving a trashed scene are not in the store). */
function incomingTo(sceneIds: string[]) {
  if (!sceneIds.length) return 0
  const ids = new Set(sceneIds)
  return store.rows.links.filter(l => ids.has(l.toSceneId)).length
}
const incomingAll = computed(() => incomingTo((items.value ?? []).filter(i => i.collection === 'scenes').map(i => i.id)))

const sections = computed(() => ORDER
  .map(collection => ({ collection, label: heading(collection), batches: batches.value.filter(b => b.head.collection === collection) }))
  .filter(section => section.batches.length))

const total = computed(() => items.value?.length ?? 0)
watch(total, (n) => {
  if (items.value) store.trashCount = n
})

const busy = ref<string | null>(null)

const REF_OF: Partial<Record<TrashCollection, RefType>> = { scenes: 'scene', chapters: 'chapter', characters: 'character', groups: 'group', locations: 'location', objects: 'object', strands: 'strand', notes: 'note', events: 'event', codexEntries: 'codex' }

/** The page that shows an item once it is back. */
function pageOf(item: TrashItem): string | null {
  const type = REF_OF[item.collection]
  if (type) return store.get(REF_TO_COLLECTION[type], item.id) ? store.refPath({ type, id: item.id }) : null
  if (item.collection === 'revisions' && item.parent) return store.refPath({ type: 'scene', id: item.parent.id })
  if (item.collection === 'maps') return `/p/${store.projectId}/relations/${item.id}`
  if (item.collection === 'parts') return `/p/${store.projectId}/manuscript`
  if (item.collection === 'variables') return `/p/${store.projectId}/variables`
  if (item.collection === 'codexCategories') return `/p/${store.projectId}/codex?category=${item.id}`
  return null
}
async function restore(batch: Batch) {
  const item = batch.head
  busy.value = keyOf(item)
  try {
    await $fetch(`${url.value}/restore`, { method: 'POST', body: { collection: item.collection, id: item.id } })
    await Promise.all([refresh(), store.reload()])
    const to = pageOf(item)
    const scene = item.collection === 'scenes' ? store.get('scenes', item.id) : undefined
    const chapter = scene ? store.get('chapters', scene.chapterId) : undefined
    toast.add({
      title: t('trash.restored', { name: nameOf(item) }),
      description: chapter ? t('trash.restoredIn', { name: chapter.title || t('common.untitled.chapter') }) : undefined,
      icon: 'i-lucide-rotate-ccw',
      actions: to ? [{ label: t('common.actions.open'), onClick: () => { void navigateTo(to) } }] : undefined,
    })
  }
  catch (e) {
    if (item.collection === 'revisions' && errorStatus(e) === 409) {
      toast.add({ title: t('trash.restoreSceneFirst', { name: item.parent?.title || t('common.untitled.scene') }), color: 'warning', icon: 'i-lucide-circle-alert' })
    }
    else notifyError(e)
  }
  finally {
    busy.value = null
  }
}

async function purge(batch: Batch) {
  const item = batch.head
  const name = nameOf(item)
  busy.value = keyOf(item)
  try {
    await $fetch(`${url.value}/purge`, { method: 'POST', body: { collection: item.collection, id: item.id } })
    // The server also removed what pointed to it: choices to a scene, a variable in conditions and
    // effects, the start scene. The store reloads so nothing shows a ghost.
    await Promise.all([refresh(), store.reload()])
    toast.add({ title: t('trash.purged', { name }), icon: 'i-lucide-trash' })
  }
  catch (e) {
    notifyError(e)
  }
  finally {
    busy.value = null
  }
}

// Emptying the trash asks once, inline, with the count.
const confirmingEmpty = ref(false)
const emptying = ref(false)
const emptyCancelRef = useTemplateRef<{ $el: HTMLElement }>('emptyCancel')
const emptyAskRef = useTemplateRef<{ $el: HTMLElement }>('emptyAsk')
watch(confirmingEmpty, async (open) => {
  await nextTick()
  ;(open ? emptyCancelRef.value : emptyAskRef.value)?.$el?.focus()
})

async function emptyTrash() {
  emptying.value = true
  try {
    const result = await $fetch<{ removed: number }>(`${url.value}/empty`, { method: 'POST' })
    confirmingEmpty.value = false
    await Promise.all([refresh(), store.reload()])
    toast.add({ title: t('trash.emptied', { n: number(result.removed) }, result.removed), icon: 'i-lucide-trash-2' })
  }
  catch (e) {
    notifyError(e)
  }
  finally {
    emptying.value = false
  }
}
</script>

<template>
  <DPage :title="term('trash')">
    <DPageHeader :title="term('trash')" :description="t('trash.description')">
      <template v-if="total" #actions>
        <UButton
          ref="emptyAsk"
          icon="i-lucide-trash-2"
          :label="t('trash.empty')"
          color="error"
          variant="outline"
          :disabled="confirmingEmpty"
          class="max-lg:min-h-11"
          @click="confirmingEmpty = true"
        />
      </template>
    </DPageHeader>

    <div
      v-if="confirmingEmpty && total"
      class="mb-8 flex flex-col gap-3 rounded-[calc(var(--ui-radius)*2)] border border-error/40 px-4 py-3 sm:flex-row sm:items-center"
      role="group"
      :aria-label="t('trash.empty')"
      @keydown.esc="confirmingEmpty = false"
    >
      <p class="flex-1 text-pretty text-default">
        {{ t('trash.emptyAsk', { n: number(total) }, total) }}
        <template v-if="incomingAll">{{ t('trash.emptyChoices', { n: number(incomingAll) }, incomingAll) }}</template>
      </p>
      <div class="flex shrink-0 gap-2">
        <UButton ref="emptyCancel" :label="t('common.actions.cancel')" color="neutral" variant="ghost" class="max-lg:min-h-11" @click="confirmingEmpty = false" />
        <UButton :label="t('trash.emptyConfirm')" color="error" variant="solid" :loading="emptying" class="max-lg:min-h-11" @click="emptyTrash" />
      </div>
    </div>

    <div v-if="status === 'pending' && !items" class="space-y-2" aria-busy="true">
      <USkeleton v-for="i in 4" :key="i" class="h-11 w-full" />
    </div>

    <DEmptyState
      v-else-if="error && !items"
      icon="i-lucide-circle-alert"
      :title="t('trash.loadError')"
      :actions="[{ label: t('common.actions.retry'), color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <div v-else-if="!total" class="trash-empty">
      <!-- The shape of the page first, then what it is for. -->
      <ul class="space-y-1" aria-hidden="true">
        <li v-for="i in 2" :key="i" class="flex min-h-11 items-center gap-3 px-2 opacity-60">
          <span class="size-8 rounded-[calc(var(--ui-radius)*2)] bg-elevated" />
          <span class="h-3 rounded-full bg-elevated" :class="i === 1 ? 'w-40' : 'w-28'" />
          <span class="leader self-center" />
          <span class="h-3 w-16 rounded-full bg-elevated" />
        </li>
      </ul>
      <p class="mt-6 max-w-prose text-pretty text-toned">{{ t('trash.emptyState') }}</p>
    </div>

    <div v-else class="space-y-8">
      <section v-for="section in sections" :key="section.collection" :aria-labelledby="`trash-${section.collection}`">
        <h2 :id="`trash-${section.collection}`" class="mb-1 flex items-baseline gap-2 px-2 text-sm font-medium text-muted">
          {{ section.label }}
          <span class="tabular text-xs text-dimmed">{{ section.batches.length }}</span>
        </h2>
        <ul>
          <TrashRow
            v-for="batch in section.batches"
            :key="keyOf(batch.head)"
            :item="batch.head"
            :members="batch.members"
            :display="displayOf(batch.head)"
            :icon="ICONS[batch.head.collection] ?? 'i-lucide-file'"
            :busy="busy === keyOf(batch.head)"
            :incoming="incomingTo(scenesOf(batch))"
            @restore="restore(batch)"
            @purge="purge(batch)"
          />
        </ul>
      </section>
    </div>
  </DPage>
</template>
