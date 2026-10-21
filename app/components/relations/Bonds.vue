<script setup lang="ts">
import type { RelationIntensity, RelationSide, WorldRefType } from '#shared/types/domain'
import type { Relation } from '#shared/types/entities'
import { RELATION_KINDS } from '#shared/utils/constants'
import { baseIntensity, sideSteps } from './Evolution.vue'

/**
 * One entity in the Elenco with every relationship it has (VRS-564): its portrait and name on the
 * left, a row per relationship on the right with the other and what the other is to it (no portraits
 * there: the picture belongs to whose bonds these are). A row opens the bond under the portrait: its
 * name, how strong it is for this one and how it changes chapter by chapter. The row's menu edits the
 * relationship, opens the other's sheet or trashes.
 */
const props = defineProps<{
  viewer: { type: WorldRefType, id: string }
  relations: Relation[]
}>()
const emit = defineEmits<{ open: [id: string], trashed: [row: HTMLElement] }>()

const store = useProjectStore()
const { t, locale } = useI18n()
const { label } = useEnums()
const { number } = useFormat()
const uid = useId()

const viewerKey = computed(() => `${props.viewer.type}:${props.viewer.id}`)
const name = computed(() => store.refLabel(props.viewer))
const color = computed(() => (store.getRef(props.viewer) as { color?: string } | undefined)?.color || null)

interface Bond {
  relation: Relation
  side: RelationSide
  other: { type: WorldRefType, id: string }
  otherName: string
  /** What the other is to this one: never this one's own words. */
  phrase: string
  kindLabel: string
}

const bonds = computed<Bond[]>(() => props.relations
  .map((relation) => {
    const side: RelationSide = `${relation.sourceType}:${relation.sourceId}` === viewerKey.value ? 'source' : 'target'
    const other = side === 'source' ? { type: relation.targetType, id: relation.targetId } : { type: relation.sourceType, id: relation.sourceId }
    return {
      relation,
      side,
      other,
      otherName: store.refLabel(other),
      phrase: side === 'source' ? relation.reverseLabel : relation.label,
      kindLabel: label('relationKind', relation.kind),
    }
  })
  .sort((a, b) => RELATION_KINDS.indexOf(a.relation.kind) - RELATION_KINDS.indexOf(b.relation.kind) || a.otherName.localeCompare(b.otherName, locale.value)))

const selectedId = ref<string | null>(null)
const selected = computed(() => bonds.value.find(bond => bond.relation.id === selectedId.value) ?? null)
const steps = computed(() => (selected.value ? sideSteps(selected.value.relation, selected.value.side, store.chapterNumber) : []))
const evolutionOpen = ref(false)

const detail = ref<HTMLElement | null>(null)

function toggle(bond: Bond) {
  selectedId.value = selectedId.value === bond.relation.id ? null : bond.relation.id
  // On a phone the bond opens below the list: bring it into view.
  if (selectedId.value) {
    nextTick(() => detail.value?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }))
  }
}

function setIntensity(bond: Bond, value: RelationIntensity) {
  store.update('relations', bond.relation.id, bond.side === 'source' ? { intensity: value } : { reverseIntensity: value }).catch(() => {})
}

function chapterLabel(chapterId: string | null) {
  const chapter = chapterId ? store.get('chapters', chapterId) : undefined
  return chapter ? `${store.chapterNumber(chapter.id)}. ${chapter.title || t('common.untitled.chapter')}` : t('relations.evolution.chapterNone')
}

function rowLabel(bond: Bond) {
  return bond.phrase
    ? t('relations.bonds.rowExpand', { name: bond.otherName, phrase: bond.phrase, kind: bond.kindLabel })
    : t('relations.bonds.rowExpandKind', { name: bond.otherName, kind: bond.kindLabel })
}

/** Gone with its row, the menu must not hand the focus back to its button: the list moves it on. */
let trashing = false
const onMenuClosed = (event: Event) => { if (trashing) event.preventDefault() }

function trash(bond: Bond) {
  trashing = true
  const row = document.querySelector<HTMLElement>(`[data-bond="${uid}-${bond.relation.id}"]`)
  if (row) emit('trashed', row)
  if (selectedId.value === bond.relation.id) selectedId.value = null
  store.remove('relations', bond.relation.id).catch(() => { trashing = false })
}

const menu = (bond: Bond) => [
  [
    { label: t('relations.actions.edit'), icon: 'i-lucide-pencil', onSelect: () => emit('open', bond.relation.id) },
    { label: t('relations.actions.openSheet', { name: bond.otherName }), icon: REF_ICONS[bond.other.type], to: store.refPath(bond.other) },
  ],
  [
    { label: t('relations.actions.trash'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => trash(bond) },
  ],
]
</script>

<template>
  <section class="relations-bonds" :aria-labelledby="`${uid}-name`">
    <div class="relations-bonds__who flex items-start gap-3">
      <NuxtLink :to="store.refPath(viewer)" class="shrink-0 rounded-[1.5px]" :aria-label="t('relations.actions.openSheet', { name })">
        <DEntityAvatar
          :name="name"
          :image-id="store.primaryImage(viewer.type, viewer.id)"
          :color="color"
          :shape="viewer.type === 'character' ? 'portrait' : 'square'"
          :icon="viewer.type === 'character' ? undefined : REF_ICONS[viewer.type]"
          size="lg"
        />
      </NuxtLink>
      <div class="min-w-0 pt-1">
        <h2 :id="`${uid}-name`" class="voice-author text-lg font-semibold text-highlighted">{{ name }}</h2>
        <p class="tabular text-sm text-muted">{{ t('relations.bonds.count', { n: number(bonds.length) }, bonds.length) }}</p>
      </div>
    </div>

    <ul class="relations-bonds__list" role="list">
      <li
        v-for="bond in bonds"
        :key="bond.relation.id"
        :data-relation="bond.relation.id"
        :data-bond="`${uid}-${bond.relation.id}`"
        class="group flex items-center gap-1 rounded-[calc(var(--ui-radius)*2)] pe-1 transition-colors duration-150 hover:bg-elevated focus-within:bg-elevated"
        :class="{ 'is-open bg-elevated': selectedId === bond.relation.id }"
      >
        <button
          type="button"
          data-row-open
          class="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 text-start"
          :aria-expanded="selectedId === bond.relation.id"
          :aria-controls="`${uid}-detail`"
          :aria-label="rowLabel(bond)"
          @click="toggle(bond)"
        >
          <span class="flex min-w-0 flex-1 flex-col @md:flex-row @md:items-baseline @md:gap-3">
            <span class="min-w-0 truncate">
              <span class="voice-author text-[0.9375rem] font-semibold text-highlighted">{{ bond.otherName }}</span><span v-if="bond.phrase" class="voice-author text-[0.9375rem] italic text-muted">, {{ bond.phrase }}</span>
            </span>
            <span class="flex shrink-0 items-center gap-1.5 text-xs text-muted @md:ms-auto">
              <RelationsKindLine :kind="bond.relation.kind" :width="14" />
              {{ bond.kindLabel }}
            </span>
          </span>
          <UIcon name="i-lucide-chevron-down" class="relations-bonds__chevron size-4 shrink-0 text-dimmed" aria-hidden="true" />
        </button>
        <UDropdownMenu :items="menu(bond)" :content="{ align: 'end', onCloseAutoFocus: onMenuClosed }">
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="ghost"
            class="max-lg:min-h-11 max-lg:min-w-11 max-lg:justify-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 data-[state=open]:opacity-100"
            :aria-label="t('relations.panel.rowMenu', { name: bond.otherName })"
          />
        </UDropdownMenu>
      </li>
    </ul>

    <div :id="`${uid}-detail`" ref="detail" class="relations-bonds__detail">
      <div v-if="selected" class="space-y-4">
        <div>
          <p class="voice-author text-[0.9375rem]">
            <span class="font-semibold text-highlighted">{{ selected.otherName }}</span><span v-if="selected.phrase" class="italic text-muted">, {{ selected.phrase }}</span>
          </p>
          <p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <RelationsKindLine :kind="selected.relation.kind" :width="14" />
            {{ selected.kindLabel }}
          </p>
        </div>

        <RelationsIntensity
          :model-value="baseIntensity(selected.relation, selected.side)"
          :label="t('relations.bonds.intensity', { name })"
          @update:model-value="(value: RelationIntensity) => setIntensity(selected!, value)"
        />

        <div>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-trending-up"
            class="max-lg:min-h-11"
            :label="t('relations.bonds.evolution')"
            aria-haspopup="dialog"
            @click="evolutionOpen = true"
          />
          <ul v-if="steps.length" class="mt-2 space-y-0.5 text-sm" role="list">
            <li v-for="step in steps" :key="step.id" class="flex items-baseline gap-2">
              <span class="min-w-0 truncate text-default">{{ chapterLabel(step.chapterId) }}</span>
              <DLeader />
              <span class="shrink-0 text-muted">{{ t(`relations.intensity.${step.intensity}`) }}</span>
            </li>
          </ul>
          <p v-else class="mt-1.5 text-xs text-muted">{{ t('relations.bonds.steps', 0) }}</p>
        </div>

        <UButton color="neutral" variant="link" icon="i-lucide-pencil" class="px-0 max-lg:min-h-11" :label="t('relations.bonds.edit')" @click="emit('open', selected.relation.id)" />
      </div>
    </div>

    <RelationsEvolution v-if="selected" v-model:open="evolutionOpen" :relation="selected.relation" :side="selected.side" />
  </section>
</template>

<style>
/* Who on the left (the portrait, then the bond that is open), the bonds on the right; one column on a phone. */
.relations-bonds {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "who" "list" "detail";
  gap: 0.75rem 2rem;
  padding-block: 1.25rem;
  border-top: 1px solid var(--ui-border);
}
.relations-bonds__who { grid-area: who; }
.relations-bonds__list { grid-area: list; align-self: start; }
.relations-bonds__detail { grid-area: detail; align-self: start; }
.relations-bonds__detail:empty { display: none; }
@container (min-width: 40rem) {
  .relations-bonds {
    grid-template-columns: 17rem minmax(0, 1fr);
    grid-template-areas: "who list" "detail list";
    grid-template-rows: auto 1fr;
  }
  .relations-bonds__who { flex-direction: column; }
}
.relations-bonds li.is-open {
  box-shadow: inset 2px 0 0 var(--ui-primary);
}
.relations-bonds__chevron {
  transition: transform 150ms var(--ease-out-expo);
}
.relations-bonds li.is-open .relations-bonds__chevron {
  transform: rotate(180deg);
}
@container (min-width: 40rem) {
  /* The bond opens on the left, under the portrait, beside the list: the row's bar says which. */
  .relations-bonds__chevron { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .relations-bonds__chevron { transition: none; }
}
</style>
