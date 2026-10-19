<script setup lang="ts">
import type { WorldRefType } from '#shared/types/domain'
import type { Relation } from '#shared/types/entities'

/**
 * A relationship in the Elenco (spec 4.4): each side with what it is to the other after its name, as
 * in the rows of a sheet ("Tobia Marin, padre ⇄ Elsa Marin, figlia"), so a lone reverse label stays
 * with the side it describes. An arrow for directed kinds, a double arrow for mutual ones; the kind
 * heads the group. The row opens the relationship.
 */
const props = defineProps<{ relation: Relation }>()
const emit = defineEmits<{ open: [], trashed: [] }>()

const store = useProjectStore()
const { t } = useI18n()
const { label } = useEnums()

const side = (type: WorldRefType, id: string, words: string) => {
  const row = store.getRef({ type, id }) as { name?: string } | undefined
  return { type, id, name: row?.name ?? '', words, imageId: store.primaryImage(type, id) }
}
const from = computed(() => side(props.relation.sourceType, props.relation.sourceId, props.relation.label))
const to = computed(() => side(props.relation.targetType, props.relation.targetId, props.relation.reverseLabel))
const kindLabel = computed(() => label('relationKind', props.relation.kind))
const arrow = computed(() => (props.relation.directed ? 'i-lucide-arrow-right' : 'i-lucide-arrow-left-right'))

/** "Famiglia, tra Tobia Marin (padre) e Elsa Marin (figlia)". */
const accessible = computed(() => {
  const named = (s: { name: string, words: string }) => (s.words ? t('relations.list.sideWords', { name: s.name, words: s.words }) : s.name)
  return t(props.relation.directed ? 'relations.list.rowDirected' : 'relations.list.rowMutual', {
    kind: kindLabel.value,
    from: named(from.value),
    to: named(to.value),
  })
})

/** Gone with its row, the menu must not hand the focus back to its button: the list moves it on. */
let trashing = false
const onMenuClosed = (event: Event) => { if (trashing) event.preventDefault() }

function trash() {
  trashing = true
  // The row leaves the list at once; the parent hears of it after, so its focus lands on what is left.
  const removing = store.remove('relations', props.relation.id)
  emit('trashed')
  removing.catch(() => { trashing = false })
}

const items = computed(() => [
  [
    { label: t('relations.actions.edit'), icon: 'i-lucide-pencil', onSelect: () => emit('open') },
    { label: t('relations.actions.openSheet', { name: from.value.name }), icon: REF_ICONS[from.value.type], to: store.refPath(from.value) },
    { label: t('relations.actions.openSheet', { name: to.value.name }), icon: REF_ICONS[to.value.type], to: store.refPath(to.value) },
  ],
  [
    { label: t('relations.actions.trash'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: trash },
  ],
])
</script>

<template>
  <li class="group flex items-center gap-1 rounded-[calc(var(--ui-radius)*2)] pe-1 transition-colors duration-150 hover:bg-elevated focus-within:bg-elevated">
    <button
      type="button"
      data-row-open
      class="grid min-h-14 min-w-0 flex-1 grid-cols-1 items-center gap-x-3 gap-y-0.5 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 text-start sm:min-h-11 sm:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)]"
      :aria-label="accessible"
      @click="emit('open')"
    >
      <template v-for="(s, i) in [from, to]" :key="i">
        <UIcon v-if="i === 1" :name="arrow" class="hidden size-4 shrink-0 text-dimmed sm:block" aria-hidden="true" />
        <span class="flex min-w-0 items-center gap-2.5">
          <UIcon v-if="i === 1" :name="arrow" class="size-3.5 shrink-0 text-dimmed sm:hidden" aria-hidden="true" />
          <span class="hidden shrink-0 sm:inline-flex">
            <DEntityAvatar
              :name="s.name"
              :image-id="s.imageId"
              :color="null"
              :shape="s.type === 'character' ? 'portrait' : 'square'"
              :icon="s.type === 'character' ? undefined : REF_ICONS[s.type]"
              size="sm"
            />
          </span>
          <span class="min-w-0 truncate">
            <span class="voice-author text-[0.9375rem] font-semibold text-highlighted">{{ s.name }}</span><span v-if="s.words" class="voice-author text-[0.9375rem] italic text-muted">, {{ s.words }}</span>
          </span>
        </span>
      </template>
    </button>
    <UDropdownMenu :items="items" :content="{ align: 'end', onCloseAutoFocus: onMenuClosed }">
      <UButton
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        class="max-lg:min-h-11 max-lg:min-w-11 max-lg:justify-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 data-[state=open]:opacity-100"
        :aria-label="t('relations.list.rowMenu', { from: from.name, to: to.name })"
      />
    </UDropdownMenu>
  </li>
</template>
