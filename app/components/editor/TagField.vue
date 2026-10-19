<script setup lang="ts">
import type { SceneTagInfo } from '#shared/types/domain'
import type { ManualTag, UpdateInput } from '#shared/types/entities'

type TagType = ManualTag['type']

/**
 * The characters, locations or objects of a scene (spec 5.3): each tag shows where it comes from, @ when
 * it is mentioned in the text, a speaker when it speaks a line, nothing when it was added by hand. Only
 * hand-made tags can be removed; the others go when the text stops naming them.
 */
const props = defineProps<{
  sceneId: string
  type: TagType
}>()

const emit = defineEmits<{
  /** "Trova nel testo": the mentions (and lines) of the entity. */
  find: [refId: string]
  open: [ref: { type: TagType, id: string }]
}>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { number } = useFormat()

const COLLECTION = { character: 'characters', location: 'locations', object: 'objects' } as const
const TERM = { character: 'characters', location: 'locations', object: 'objects' } as const

const scene = computed(() => store.get('scenes', props.sceneId))

const tags = computed(() => {
  const all = scene.value?.tags ?? {}
  const rows = store.rows[COLLECTION[props.type]] as { id: string, name: string, color: string }[]
  return rows
    .filter(row => all[`${props.type}:${row.id}`])
    .map(row => ({ entity: row, info: all[`${props.type}:${row.id}`]! }))
})

const manualTags = (): ManualTag[] => Object.entries(scene.value?.tags ?? {})
  .filter(([, info]) => info.manual)
  .map(([key]) => {
    const [type, id] = key.split(':') as [TagType, string]
    return { type, id }
  })

/** Sends the full list of manual tags; the tag map changes at once and comes back from the server. */
async function setManual(id: string, manual: boolean) {
  const current = scene.value
  if (!current) return
  const key = `${props.type}:${id}`
  const tagsNext: Record<string, SceneTagInfo> = { ...current.tags }
  const entry = { ...tagsNext[key], manual: manual || undefined }
  if (entry.manual || entry.mentions || entry.lines) tagsNext[key] = entry
  else delete tagsNext[key]
  const list = manualTags().filter(tag => !(tag.type === props.type && tag.id === id))
  if (manual) list.push({ type: props.type, id })
  const ids = (type: TagType) => Object.keys(tagsNext).filter(k => k.startsWith(`${type}:`)).map(k => k.slice(type.length + 1))
  await store.update('scenes', props.sceneId, {
    manualTags: list,
    tags: tagsNext,
    characterIds: ids('character'),
    locationIds: ids('location'),
    objectIds: ids('object'),
  } as UpdateInput<'scenes'>).catch(() => {})
}

const items = computed(() => {
  const taken = new Set(tags.value.map(tag => tag.entity.id))
  const rows = store.rows[COLLECTION[props.type]] as { id: string, name: string, tagline?: string, city?: string, region?: string, kind?: string }[]
  return rows.filter(row => !taken.has(row.id)).map(row => ({
    id: row.id,
    label: row.name,
    description: row.tagline || [row.city, row.region].filter(Boolean).join(', ') || row.kind || undefined,
    ...(props.type === 'character'
      ? { avatar: { src: mediaUrl(store.primaryImage('character', row.id), 'thumb'), alt: row.name, text: row.name.slice(0, 1).toLocaleUpperCase() } }
      : { icon: REF_ICONS[props.type] }),
  }))
})

async function create(name: string) {
  const clean = name.trim()
  if (!clean) return
  const row = await store.create(COLLECTION[props.type], { name: clean, ...(props.type === 'character' ? { importance: 'minor' } : {}) } as never).catch(() => null)
  if (row) await setManual(row.id, true)
}

function sources(info: SceneTagInfo) {
  const parts: string[] = []
  if (info.mentions) parts.push(t('editor.tags.mentioned', { n: number(info.mentions) }, info.mentions))
  if (info.lines) parts.push(t('editor.tags.speaks', { n: number(info.lines) }, info.lines))
  if (info.manual) parts.push(t('editor.tags.manual'))
  return parts
}

function menu(tag: { entity: { id: string, name: string }, info: SceneTagInfo }) {
  const fromText = !!(tag.info.mentions || tag.info.lines)
  return [
    sources(tag.info).map(label => ({ type: 'label' as const, label })),
    [
      ...(fromText ? [{ label: t('editor.tags.findInText'), icon: 'i-lucide-text-search', onSelect: () => emit('find', `${props.type}:${tag.entity.id}`) }] : []),
      { label: t('editor.tags.openSheet'), icon: REF_ICONS[props.type], onSelect: () => emit('open', { type: props.type, id: tag.entity.id }) },
    ],
    ...(tag.info.manual && !fromText ? [[{ label: t('editor.tags.remove'), icon: 'i-lucide-x', onSelect: () => setManual(tag.entity.id, false) }]] : []),
  ]
}
</script>

<template>
  <div>
    <ul v-if="tags.length" class="flex flex-wrap gap-1.5 pointer-coarse:gap-2">
      <li v-for="tag in tags" :key="tag.entity.id" class="flex">
        <UDropdownMenu :items="menu(tag)" :content="{ align: 'start' }">
          <button
            type="button"
            class="inline-flex h-7 max-w-full items-center gap-1.5 rounded-[4.5px] bg-elevated ps-1 text-sm text-default outline-none hover:bg-accented/70 focus-visible:ring-2 focus-visible:ring-(--ui-primary) pointer-coarse:h-11 pointer-coarse:ps-2"
            :class="tag.info.manual && !tag.info.mentions && !tag.info.lines ? 'pe-1' : 'pe-2 pointer-coarse:pe-3'"
            :aria-label="[tag.entity.name, ...sources(tag.info)].join(', ')"
          >
            <DEntityAvatar
              :name="tag.entity.name"
              :image-id="store.primaryImage(type, tag.entity.id)"
              :color="tag.entity.color || null"
              :shape="type === 'character' ? 'portrait' : 'square'"
              :icon="type === 'character' ? undefined : REF_ICONS[type]"
              size="xs"
            />
            <span class="voice-author truncate">{{ tag.entity.name }}</span>
            <UIcon v-if="tag.info.mentions" name="i-lucide-at-sign" class="size-3.5 shrink-0 text-dimmed" aria-hidden="true" />
            <UIcon v-if="tag.info.lines" name="i-lucide-speech" class="size-3.5 shrink-0 text-dimmed" aria-hidden="true" />
          </button>
        </UDropdownMenu>
        <UButton
          v-if="tag.info.manual && !tag.info.mentions && !tag.info.lines"
          icon="i-lucide-x"
          size="xs"
          class="-ms-0.5 h-7 rounded-s-none bg-elevated hover:bg-accented/70 pointer-coarse:size-11 pointer-coarse:justify-center"
          :aria-label="t('editor.tags.removeNamed', { name: tag.entity.name })"
          @click="setManual(tag.entity.id, false)"
        />
      </li>
    </ul>
    <p v-else class="text-sm text-muted">{{ t('editor.tags.empty', { at: '@' }) }}</p>

    <USelectMenu
      :model-value="undefined"
      :items="items"
      value-key="id"
      label-key="label"
      :filter-fields="['label', 'description']"
      create-item
      :placeholder="t('editor.tags.add')"
      :search-input="{ placeholder: t('common.actions.search'), autofocus: true }"
      icon="i-lucide-plus"
      variant="ghost"
      size="sm"
      class="mt-1.5 -ms-2"
      :ui="{ base: 'pointer-coarse:min-h-11', trailingIcon: 'hidden', placeholder: 'text-muted' }"
      :aria-label="t('editor.tags.addTo', { what: term(TERM[type]) })"
      @update:model-value="(id: string) => id && setManual(id, true)"
      @create="create"
    />
  </div>
</template>
