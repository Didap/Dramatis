<script setup lang="ts">
import type { WorldRefType } from '#shared/types/domain'
import type { Relation } from '#shared/types/entities'

/**
 * One relationship seen from one of its sides (a sheet, a node of the map): the other entity and what
 * it is to this one, "Tobia Marin, padre". With no words for that side, only the kind's name, which is
 * always shown with its line. The row opens the relationship; the menu opens the other's sheet or trashes.
 */
const props = defineProps<{
  relation: Relation
  /** The side looking: "<type>:<id>". */
  viewer: string
  /** Portraits without the entity's colour (on the map, colour belongs to the relation kinds). */
  neutral?: boolean
  /** Trashing asks first, inline (on a map, spec 5.4: the relationship leaves every map and sheet). */
  confirm?: boolean
}>()

const emit = defineEmits<{ open: [], trashed: [] }>()

const store = useProjectStore()
const { t } = useI18n()
const { label } = useEnums()

const fromViewer = computed(() => `${props.relation.sourceType}:${props.relation.sourceId}` === props.viewer)
const other = computed(() => (fromViewer.value
  ? { type: props.relation.targetType, id: props.relation.targetId }
  : { type: props.relation.sourceType, id: props.relation.sourceId }) as { type: WorldRefType, id: string })
const otherName = computed(() => store.refLabel(other.value))

/**
 * What the other side is to the viewer: the label when the other is the source, the reverse label
 * when it is the target. Never the viewer's own label: "padre" on Tobia's sheet would make Elsa the father.
 */
const phrase = computed(() => (fromViewer.value ? props.relation.reverseLabel : props.relation.label))

const kindLabel = computed(() => label('relationKind', props.relation.kind))

const confirming = ref(false)
const row = ref<HTMLElement | null>(null)
/** Gone with its row, the menu must not hand the focus back to its button: the parent moves it on. */
let trashing = false

async function trash() {
  confirming.value = false
  trashing = true
  // The row leaves the list at once; the parent hears of it after, so its focus lands on what is left.
  const removing = store.remove('relations', props.relation.id)
  emit('trashed')
  await removing.catch(() => { trashing = false })
}

function askTrash() {
  if (props.confirm) confirming.value = true
  else void trash()
}

/** After "Sposta nel cestino" in the menu the focus goes to the confirmation, not back to the menu. */
function onMenuClosed(event: Event) {
  if (trashing) event.preventDefault()
  if (!confirming.value) return
  event.preventDefault()
  nextTick(() => row.value?.querySelector<HTMLElement>('[data-confirm-trash]')?.focus())
}

function keep() {
  confirming.value = false
  nextTick(() => row.value?.querySelector<HTMLElement>('[data-row-open]')?.focus())
}

const items = computed(() => [
  [
    { label: t('relations.actions.edit'), icon: 'i-lucide-pencil', onSelect: () => emit('open') },
    { label: t('relations.actions.openSheet', { name: otherName.value }), icon: REF_ICONS[other.value.type], to: store.refPath(other.value) },
  ],
  [
    { label: t('relations.actions.trash'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: askTrash },
  ],
])
</script>

<template>
  <li ref="row" class="@container">
    <div class="group flex items-center gap-1 rounded-[calc(var(--ui-radius)*2)] pe-1 transition-colors duration-150 hover:bg-elevated focus-within:bg-elevated">
      <button
        type="button"
        data-row-open
        class="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 text-start @md:min-h-11"
        :aria-label="phrase ? t('relations.panel.rowLabel', { name: otherName, phrase, kind: kindLabel }) : t('relations.panel.rowLabelKind', { name: otherName, kind: kindLabel })"
        @click="emit('open')"
      >
        <DEntityAvatar
          :name="otherName"
          :image-id="store.primaryImage(other.type, other.id)"
          :color="neutral ? null : (store.getRef(other) as { color?: string } | undefined)?.color || null"
          :shape="other.type === 'character' ? 'portrait' : 'square'"
          :icon="other.type === 'character' ? undefined : REF_ICONS[other.type]"
          size="sm"
        />
        <span class="flex min-w-0 flex-1 flex-col @md:flex-row @md:items-baseline @md:gap-3">
          <span class="min-w-0 truncate">
            <span class="voice-author text-[0.9375rem] font-semibold text-highlighted">{{ otherName }}</span><span v-if="phrase" class="voice-author text-[0.9375rem] italic text-muted">, {{ phrase }}</span>
          </span>
          <span class="flex shrink-0 items-center gap-1.5 text-xs text-muted @md:ms-auto">
            <RelationsKindLine :kind="relation.kind" :width="14" />
            {{ kindLabel }}
          </span>
        </span>
      </button>
      <UDropdownMenu :items="items" :content="{ align: 'end', onCloseAutoFocus: onMenuClosed }">
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          class="max-lg:min-h-11 max-lg:min-w-11 max-lg:justify-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 data-[state=open]:opacity-100"
          :aria-label="t('relations.panel.rowMenu', { name: otherName })"
        />
      </UDropdownMenu>
    </div>
    <div v-if="confirming" class="space-y-2 px-2 pt-1 pb-3" role="alert">
      <p class="flex items-start gap-2 text-sm text-default">
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
        {{ t('relations.form.deleteConfirm') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton data-confirm-trash color="error" variant="solid" size="sm" class="max-lg:min-h-11" :label="t('relations.form.deleteYes')" @click="trash" />
        <UButton color="neutral" variant="ghost" size="sm" class="max-lg:min-h-11" :label="t('common.actions.cancel')" @click="keep" />
      </div>
    </div>
  </li>
</template>
