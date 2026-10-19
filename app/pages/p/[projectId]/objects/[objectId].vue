<script setup lang="ts">
import type { RelationKind } from '#shared/types/domain'
import type { StoryObject } from '#shared/types/entities'
import { useJustCreated } from '~/components/world/SheetHeader.vue'

/**
 * Object sheet (an item, in English games; spec 4.4): name, kind, status, colour; description, owners,
 * the scenes where it appears, events, groups, images, notes. From xl the list of objects stays on
 * the left.
 */
const route = useRoute()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const mt = (key: string) => t(`objects.${store.kind}.${key}`)

const objectId = computed(() => String(route.params.objectId))
const object = computed(() => store.get('objects', objectId.value))
const listPath = computed(() => `/p/${store.projectId}/objects`)
const header = ref<{ focusName: () => void } | null>(null)
const leaving = ref(false)
const uid = useId()
const justCreated = useJustCreated()

/** Kinds already used by the other objects, offered while typing. */
const kinds = computed(() =>
  [...new Set(store.rows.objects.filter(o => o.id !== objectId.value).map(o => o.kind.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)))

/** Owners and groups have their own sections: the other relationships say where it is, what it is tied to. */
const OWN_SECTIONS: RelationKind[] = ['membership', 'ownership']
/** Those other relationships, as RelationsPanel counts them (both ends still there). */
const others = computed(() => store.rows.relations.filter((r) => {
  const mine = (r.sourceType === 'object' && r.sourceId === objectId.value) || (r.targetType === 'object' && r.targetId === objectId.value)
  return mine && !OWN_SECTIONS.includes(r.kind)
    && !!store.getRef({ type: r.sourceType, id: r.sourceId }) && !!store.getRef({ type: r.targetType, id: r.targetId })
}).length)

function patch(values: Partial<StoryObject>) {
  store.patchSoon('objects', objectId.value, values)
}
function set(values: Partial<StoryObject>) {
  store.update('objects', objectId.value, values).catch(() => {})
}

onMounted(() => {
  // An object just created elsewhere (capture drawer, palette) carries a placeholder name: ready to be renamed.
  if (justCreated(object.value, ['common.untitled.object', 'common.untitled.item', 'search.palette.untitledItem'])) {
    void nextTick(() => header.value?.focusName())
  }
})
</script>

<template>
  <DPage :title="object?.name ?? term('object')" :back="listPath" :back-label="term('objects')" width="full" bare>
    <template v-if="object || leaving" #actions>
      <WorldSheetMenu v-model:leaving="leaving" collection="objects" :id="objectId" :list-path="listPath" />
    </template>

    <WorldSheetLayout :list-label="term('objects')">
      <template #list>
        <ObjectsList compact :active-id="objectId" />
      </template>

      <WorldNotFound v-if="!object && !leaving" :list-path="listPath" />
      <article v-else-if="object" :key="object.id" class="space-y-8" :aria-label="object.name">
        <WorldSheetHeader
          ref="header"
          owner-type="object"
          :owner-id="object.id"
          :name="object.name"
          :color="object.color"
          icon="i-lucide-gem"
          @update:name="(name: string) => patch({ name })"
        >
          <div class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <WorldField :label="t('objects.kind')" class="col-span-2 sm:col-span-1">
              <DInlineText
                :model-value="object.kind"
                variant="small"
                :maxlength="60"
                :placeholder="mt('kindPlaceholder')"
                :aria-label="t('objects.kind')"
                :list="`${uid}-kind`"
                autocomplete="off"
                class="voice-author max-lg:min-h-11 max-sm:text-base"
                @update:model-value="(kind: string) => patch({ kind })"
              />
              <datalist :id="`${uid}-kind`">
                <option v-for="value in kinds" :key="value" :value="value" />
              </datalist>
            </WorldField>
            <WorldField :label="t('common.fields.status')">
              <DStatusSelect
                :model-value="object.status"
                kind="planning"
                size="md"
                class="-ms-2.5 max-lg:min-h-11"
                @update:model-value="(status: string) => set({ status: status as StoryObject['status'] })"
              />
            </WorldField>
            <WorldField :label="t('common.fields.color')">
              <DColorPicker
                :model-value="object.color"
                size="md"
                class="-ms-2.5 max-lg:min-h-11"
                @update:model-value="(color: string) => set({ color })"
              />
            </WorldField>
          </div>
        </WorldSheetHeader>

        <WorldLongText
          :title="t('objects.description')"
          :model-value="object.description"
          :placeholder="t('objects.descriptionPlaceholder')"
          @update:model-value="description => patch({ description })"
        />

        <ObjectsOwners :object-id="object.id" />

        <WorldSection :title="t('objects.scenes')">
          <ManuscriptAppearances entity-type="object" :entity-id="object.id" />
        </WorldSection>

        <WorldSection :title="t('objects.events')">
          <TimelineEntityEvents entity-type="object" :entity-id="object.id" />
        </WorldSection>

        <!-- The panel's own empty line speaks of owners, who have their section above: this one says what is left. -->
        <WorldSection :title="t('objects.relations')">
          <div class="d-other-relations" :class="{ 'd-other-relations--empty': !others }">
            <p v-if="!others" class="text-sm text-muted">{{ t('objects.noOtherRelations') }}</p>
            <RelationsPanel entity-type="object" :entity-id="object.id" :exclude-kinds="OWN_SECTIONS" />
          </div>
        </WorldSection>

        <WorldMemberships entity-type="object" :entity-id="object.id" />

        <WorldSection :title="t('objects.images')">
          <DImageGallery owner-type="object" :owner-id="object.id" :name="object.name" />
        </WorldSection>

        <WorldLongText
          :title="t('objects.notes')"
          :model-value="object.notes"
          :placeholder="t('world.sheet.notesPlaceholder')"
          @update:model-value="notes => patch({ notes })"
        />
      </article>
    </WorldSheetLayout>
  </DPage>
</template>

<style scoped>
/* With no other relationship, the line above stands in for the panel's own (RelationsPanel has no prop for it yet). */
.d-other-relations--empty :deep(.relations-panel > p:first-child) {
  display: none;
}
</style>
