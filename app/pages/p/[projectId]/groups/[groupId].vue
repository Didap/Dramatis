<script setup lang="ts">
import type { Group } from '#shared/types/entities'
import { useJustCreated } from '~/components/world/SheetHeader.vue'

/**
 * Group sheet (a faction, in games; spec 4.4): name, kind, status, colour; description, members,
 * language, traditions, powers; relationships, images, the scenes of the members, events, notes.
 * From xl the list of groups stays on the left.
 */
const route = useRoute()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { options } = useEnums()
const mt = (key: string) => t(`groups.${store.kind}.${key}`)

const groupId = computed(() => String(route.params.groupId))
const group = computed(() => store.get('groups', groupId.value))
const listPath = computed(() => `/p/${store.projectId}/groups`)
const header = ref<{ focusName: () => void } | null>(null)
const leaving = ref(false)
const justCreated = useJustCreated()

/** Typing (name, long texts): sent after a pause. */
function patch(values: Partial<Group>) {
  store.patchSoon('groups', groupId.value, values)
}
/** A choice (kind, status, colour): sent at once. */
function set(values: Partial<Group>) {
  store.update('groups', groupId.value, values).catch(() => {})
}

onMounted(() => {
  // A group or faction just created elsewhere (capture drawer, palette) carries a placeholder name: ready to be renamed.
  if (justCreated(group.value, ['common.untitled.group', 'common.untitled.faction'])) void nextTick(() => header.value?.focusName())
})
</script>

<template>
  <DPage :title="group?.name ?? term('group')" :back="listPath" :back-label="term('groups')" width="full" bare>
    <template v-if="group || leaving" #actions>
      <WorldSheetMenu v-model:leaving="leaving" collection="groups" :id="groupId" :list-path="listPath" />
    </template>

    <WorldSheetLayout :list-label="term('groups')">
      <template #list>
        <GroupsList compact :active-id="groupId" />
      </template>

      <WorldNotFound v-if="!group && !leaving" :list-path="listPath" />
      <article v-else-if="group" :key="group.id" class="space-y-8" :aria-label="group.name">
        <WorldSheetHeader
          ref="header"
          owner-type="group"
          :owner-id="group.id"
          :name="group.name"
          :color="group.color"
          icon="i-lucide-users-round"
          @update:name="(name: string) => patch({ name })"
        >
          <div class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <WorldField :label="t('common.fields.kind')">
              <USelect
                :model-value="group.kind"
                :items="options('groupKind')"
                value-key="value"
                color="neutral"
                variant="ghost"
                class="-ms-2.5 max-lg:min-h-11"
                :aria-label="t('common.fields.kind')"
                @update:model-value="(kind: string) => set({ kind: kind as Group['kind'] })"
              />
            </WorldField>
            <WorldField :label="t('common.fields.status')">
              <DStatusSelect
                :model-value="group.status"
                kind="planning"
                size="md"
                class="-ms-2.5 max-lg:min-h-11"
                @update:model-value="(status: string) => set({ status: status as Group['status'] })"
              />
            </WorldField>
            <WorldField :label="t('common.fields.color')">
              <DColorPicker
                :model-value="group.color"
                size="md"
                class="-ms-2.5 max-lg:min-h-11"
                @update:model-value="(color: string) => set({ color })"
              />
            </WorldField>
          </div>
        </WorldSheetHeader>

        <WorldLongText
          :title="t('groups.description')"
          :model-value="group.description"
          :placeholder="t('groups.descriptionPlaceholder')"
          @update:model-value="description => patch({ description })"
        />

        <GroupsMembers :group-id="group.id" />

        <WorldLongText
          :title="t('groups.language')"
          :model-value="group.language"
          :placeholder="t('groups.languagePlaceholder')"
          @update:model-value="language => patch({ language })"
        />
        <WorldLongText
          :title="t('groups.traditions')"
          :model-value="group.traditions"
          :placeholder="t('groups.traditionsPlaceholder')"
          @update:model-value="traditions => patch({ traditions })"
        />
        <WorldLongText
          :title="t('groups.powers')"
          :model-value="group.powers"
          :placeholder="mt('powersPlaceholder')"
          @update:model-value="powers => patch({ powers })"
        />

        <WorldSection :title="t('groups.relations')">
          <RelationsPanel entity-type="group" :entity-id="group.id" />
        </WorldSection>

        <WorldSection :title="t('groups.images')">
          <DImageGallery owner-type="group" :owner-id="group.id" :name="group.name" />
        </WorldSection>

        <WorldSection :title="t('groups.scenes')">
          <ManuscriptAppearances entity-type="group" :entity-id="group.id" />
        </WorldSection>

        <WorldSection :title="t('groups.events')">
          <TimelineEntityEvents entity-type="group" :entity-id="group.id" />
        </WorldSection>

        <WorldLongText
          :title="t('groups.notes')"
          :model-value="group.notes"
          :placeholder="t('world.sheet.notesPlaceholder')"
          @update:model-value="notes => patch({ notes })"
        />
      </article>
    </WorldSheetLayout>
  </DPage>
</template>
