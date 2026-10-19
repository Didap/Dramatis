<script setup lang="ts">
import type { StoryLocation } from '#shared/types/entities'
import { useJustCreated } from '~/components/world/SheetHeader.vue'

/**
 * Location sheet (spec 4.4): name, city, region, nation, kind, status, colour; description, the scenes
 * set here, significant events, relationships (who is linked to the place), groups, images, notes.
 * From xl the list of locations stays on the left.
 */
const route = useRoute()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const mt = (key: string) => t(`locations.${store.kind}.${key}`)

const locationId = computed(() => String(route.params.locationId))
const location = computed(() => store.get('locations', locationId.value))
const listPath = computed(() => `/p/${store.projectId}/locations`)
const header = ref<{ focusName: () => void } | null>(null)
const leaving = ref(false)
const uid = useId()
const justCreated = useJustCreated()

/** Values already used by the other locations, offered while typing. */
function used(field: 'kind' | 'city' | 'region' | 'nation') {
  return [...new Set(store.rows.locations.filter(l => l.id !== locationId.value).map(l => l[field].trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
}
const suggestions = computed(() => ({
  kind: used('kind'),
  city: used('city'),
  region: used('region'),
  nation: used('nation'),
}))
const PLACE_FIELDS = ['city', 'region', 'nation'] as const

function patch(values: Partial<StoryLocation>) {
  store.patchSoon('locations', locationId.value, values)
}
function set(values: Partial<StoryLocation>) {
  store.update('locations', locationId.value, values).catch(() => {})
}

onMounted(() => {
  // A place just created elsewhere (capture drawer, palette) carries a placeholder name: ready to be renamed.
  if (justCreated(location.value, ['common.untitled.location'])) void nextTick(() => header.value?.focusName())
})
</script>

<template>
  <DPage :title="location?.name ?? term('location')" :back="listPath" :back-label="term('locations')" width="full" bare>
    <template v-if="location || leaving" #actions>
      <WorldSheetMenu v-model:leaving="leaving" collection="locations" :id="locationId" :list-path="listPath" />
    </template>

    <WorldSheetLayout :list-label="term('locations')">
      <template #list>
        <LocationsList compact :active-id="locationId" />
      </template>

      <WorldNotFound v-if="!location && !leaving" :list-path="listPath" />
      <article v-else-if="location" :key="location.id" class="space-y-8" :aria-label="location.name">
        <WorldSheetHeader
          ref="header"
          owner-type="location"
          :owner-id="location.id"
          :name="location.name"
          :color="location.color"
          icon="i-lucide-map-pin"
          @update:name="(name: string) => patch({ name })"
        >
          <div class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <WorldField v-for="field in PLACE_FIELDS" :key="field" :label="t(`locations.${field}`)" class="col-span-2 sm:col-span-1">
              <DInlineText
                :model-value="location[field]"
                variant="small"
                :maxlength="120"
                :placeholder="t(`locations.ask.${field}`)"
                :aria-label="t(`locations.${field}`)"
                :list="`${uid}-${field}`"
                autocomplete="off"
                class="voice-author max-lg:min-h-11 max-sm:text-base"
                @update:model-value="(value: string) => patch({ [field]: value } as Partial<StoryLocation>)"
              />
              <datalist :id="`${uid}-${field}`">
                <option v-for="value in suggestions[field]" :key="value" :value="value" />
              </datalist>
            </WorldField>
            <WorldField :label="t('locations.kind')" class="col-span-2 sm:col-span-1">
              <DInlineText
                :model-value="location.kind"
                variant="small"
                :maxlength="60"
                :placeholder="mt('kindPlaceholder')"
                :aria-label="t('locations.kind')"
                :list="`${uid}-kind`"
                autocomplete="off"
                class="voice-author max-lg:min-h-11 max-sm:text-base"
                @update:model-value="(kind: string) => patch({ kind })"
              />
              <datalist :id="`${uid}-kind`">
                <option v-for="value in suggestions.kind" :key="value" :value="value" />
              </datalist>
            </WorldField>
            <WorldField :label="t('common.fields.status')">
              <DStatusSelect
                :model-value="location.status"
                kind="planning"
                size="md"
                class="-ms-2.5 max-lg:min-h-11"
                @update:model-value="(status: string) => set({ status: status as StoryLocation['status'] })"
              />
            </WorldField>
            <WorldField :label="t('common.fields.color')">
              <DColorPicker
                :model-value="location.color"
                size="md"
                class="-ms-2.5 max-lg:min-h-11"
                @update:model-value="(color: string) => set({ color })"
              />
            </WorldField>
          </div>
        </WorldSheetHeader>

        <WorldLongText
          :title="t('locations.description')"
          :model-value="location.description"
          :placeholder="t('locations.descriptionPlaceholder')"
          @update:model-value="description => patch({ description })"
        />

        <WorldSection :title="t('locations.scenes')">
          <ManuscriptAppearances entity-type="location" :entity-id="location.id" />
        </WorldSection>

        <WorldSection :title="t('locations.events')">
          <TimelineEntityEvents entity-type="location" :entity-id="location.id" />
        </WorldSection>

        <WorldSection :title="t('locations.relations')">
          <RelationsPanel entity-type="location" :entity-id="location.id" />
        </WorldSection>

        <WorldMemberships entity-type="location" :entity-id="location.id" />

        <WorldSection :title="t('locations.images')">
          <DImageGallery owner-type="location" :owner-id="location.id" :name="location.name" />
        </WorldSection>

        <WorldLongText
          :title="t('locations.notes')"
          :model-value="location.notes"
          :placeholder="t('world.sheet.notesPlaceholder')"
          @update:model-value="notes => patch({ notes })"
        />
      </article>
    </WorldSheetLayout>
  </DPage>
</template>
