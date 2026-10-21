<script setup lang="ts">
import type { Group } from '#shared/types/entities'
import { useJustCreated } from '~/components/world/SheetHeader.vue'

/**
 * Group sheet (a faction, in games; spec 4.4): name, kind, status, colour; description, members,
 * language, traditions, powers; relationships, images, the scenes of the members, events, notes.
 * From xl the list of groups stays on the left. A race (module races) is a group of kind race: the same
 * sheet, also at /races/:groupId, with the races list beside it and its own words. A race shows only
 * its colour, then who belongs to it, then is described freely (a description and its subraces) or
 * guided (language, traditions, powers, relationships, images, scenes, events), as its author chooses
 * (VRS-565); the notes close both.
 */
const route = useRoute()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { options } = useEnums()
const groupId = computed(() => String(route.params.groupId))
const group = computed(() => store.get('groups', groupId.value))
const race = computed(() => store.isRace(groupId.value) || (!group.value && route.path.includes('/races/')))
const mt = (key: string) => t(`groups.${race.value ? 'race' : store.kind}.${key}`)
const listTerm = computed(() => term(race.value ? 'races' : 'groups'))
const listPath = computed(() => `/p/${store.projectId}/${race.value ? 'races' : 'groups'}`)
const header = ref<{ focusName: () => void } | null>(null)
const leaving = ref(false)
const justCreated = useJustCreated()
const guided = computed(() => !race.value || group.value?.describe === 'guided')

const DESCRIBE = [
  { value: 'free', icon: 'i-lucide-pen-line' },
  { value: 'guided', icon: 'i-lucide-list-tree' },
] as const

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
  <DPage :title="group?.name ?? term(race ? 'race' : 'group')" :back="listPath" :back-label="listTerm" width="full" bare>
    <template v-if="group || leaving" #actions>
      <WorldSheetMenu v-model:leaving="leaving" collection="groups" :id="groupId" :list-path="listPath" />
    </template>

    <WorldSheetLayout :list-label="listTerm">
      <template #list>
        <GroupsList compact :races="race" :active-id="groupId" />
      </template>

      <WorldNotFound v-if="!group && !leaving" :list-path="listPath" />
      <article v-else-if="group" :key="group.id" class="space-y-8" :aria-label="group.name">
        <WorldSheetHeader
          ref="header"
          owner-type="group"
          :owner-id="group.id"
          :name="group.name"
          :color="group.color"
          :icon="race ? 'i-lucide-dna' : 'i-lucide-users-round'"
          @update:name="(name: string) => patch({ name })"
        >
          <div class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <WorldField v-if="!race" :label="t('common.fields.kind')">
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
            <WorldField v-if="!race" :label="t('common.fields.status')">
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
          v-if="!race"
          :title="t('groups.description')"
          :model-value="group.description"
          :placeholder="t('groups.descriptionPlaceholder')"
          @update:model-value="description => patch({ description })"
        />

        <GroupsMembers :group-id="group.id" :race="race" />

        <fieldset v-if="race" class="min-w-0">
          <legend class="text-lg font-semibold text-highlighted">{{ t('groups.race.describe') }}</legend>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <label v-for="mode in DESCRIBE" :key="mode.value" class="choice-chip" :class="{ 'is-checked': group.describe === mode.value }">
              <input type="radio" class="sr-only" name="race-describe" :value="mode.value" :checked="group.describe === mode.value" @change="set({ describe: mode.value })">
              <UIcon :name="mode.icon" class="size-4 shrink-0" aria-hidden="true" />
              <span>{{ t(mode.value === 'free' ? 'groups.race.describeFree' : 'groups.race.describeGuided') }}</span>
            </label>
          </div>
          <p class="mt-2 text-sm text-muted">{{ t(guided ? 'groups.race.describeGuidedHelp' : 'groups.race.describeFreeHelp') }}</p>
        </fieldset>

        <template v-if="!guided">
          <WorldLongText
            :title="t('groups.description')"
            :model-value="group.description"
            :placeholder="t('groups.race.freePlaceholder')"
            @update:model-value="description => patch({ description })"
          />
          <GroupsSubraces :group-id="group.id" />
        </template>

        <template v-if="guided">
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
        </template>

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
