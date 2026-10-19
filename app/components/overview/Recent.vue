<script setup lang="ts">
import type { EntityRef, RefType } from '#shared/types/domain'

/** The last five items edited (spec 4.2), newest first, as rows with the time they were touched. */
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { relative, time } = useFormat()

interface RecentItem {
  ref: EntityRef
  name: string
  kind: string
  at: string
  color: string
  imageId: string | null
}

const items = computed<RecentItem[]>(() => {
  const list: RecentItem[] = []
  const kindOf = (key: Parameters<typeof term>[0]) => term(key).toLocaleLowerCase()
  const push = (type: RefType, id: string, name: string, at: string | null | undefined, kind: string, color = '') => {
    if (at) list.push({ ref: { type, id }, name, kind, at, color, imageId: store.primaryImage(type, id) })
  }
  for (const s of store.rows.scenes) {
    const chapter = store.chapterNumber(s.chapterId)
    const at = s.editedAt && s.editedAt > s.updatedAt ? s.editedAt : s.updatedAt
    push('scene', s.id, s.title || t('common.untitled.scene'), at, chapter ? t('overview.recent.sceneIn', { n: chapter }) : kindOf('scene'))
  }
  for (const c of store.rows.chapters) push('chapter', c.id, c.title || t('common.untitled.chapter'), c.updatedAt, kindOf('chapter'))
  for (const c of store.rows.characters) push('character', c.id, c.name, c.updatedAt, kindOf('character'), c.color)
  for (const g of store.rows.groups) push('group', g.id, g.name, g.updatedAt, kindOf('group'), g.color)
  for (const l of store.rows.locations) push('location', l.id, l.name, l.updatedAt, kindOf('location'), l.color)
  for (const o of store.rows.objects) push('object', o.id, o.name, o.updatedAt, kindOf('object'), o.color)
  for (const s of store.rows.strands) push('strand', s.id, s.name, s.updatedAt, kindOf('strand'), s.color)
  for (const n of store.rows.notes) push('note', n.id, n.title || t('common.untitled.note'), n.updatedAt, t('common.enums.refType.note').toLocaleLowerCase())
  for (const e of store.rows.events) push('event', e.id, e.title, e.updatedAt, kindOf('event'))
  if (store.modules.codex) for (const e of store.rows.codexEntries) push('codex', e.id, e.title, e.updatedAt, kindOf('codexEntry'))
  return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)
})

/** "3 ore fa", "ieri, 22:14", "12 ott". */
function when(at: string) {
  const age = Date.now() - new Date(at).getTime()
  return age >= 86_400_000 && age < 7 * 86_400_000 ? `${relative(at)}, ${time(at)}` : relative(at)
}
</script>

<template>
  <section v-if="items.length" class="overview-recent" aria-labelledby="overview-recent-title">
    <h2 id="overview-recent-title" class="mb-2 text-lg font-semibold text-highlighted">{{ t('overview.recent.title') }}</h2>
    <ul>
      <li v-for="item in items" :key="`${item.ref.type}:${item.ref.id}`">
        <DRow :to="store.refPath(item.ref)" :name="item.name">
          <template #name>
            {{ item.name }}<span class="font-sans text-sm font-normal text-muted">, {{ item.kind }}</span>
          </template>
          <template #leading>
            <DEntityAvatar
              :name="item.name"
              :image-id="item.imageId"
              :color="item.color || null"
              :shape="item.ref.type === 'character' ? 'portrait' : 'square'"
              :icon="item.ref.type === 'character' ? undefined : REF_ICONS[item.ref.type]"
              size="sm"
            />
          </template>
          <template #numbers>
            <span>{{ when(item.at) }}</span>
          </template>
        </DRow>
      </li>
    </ul>
  </section>
</template>
