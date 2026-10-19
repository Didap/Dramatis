<script setup lang="ts">
import type { PlanningStatus, RichDoc, StrandKind } from '#shared/types/domain'
import type { UpdateInput } from '#shared/types/entities'
import { QUEST_KINDS, STRAND_KINDS } from '#shared/utils/constants'

/**
 * A strand (spec 4.3): its title, kind, colour, status and description; the character of an arc; the
 * giver, objectives and rewards of a quest (module quests); the scenes it runs through. The fields of
 * other kinds are kept when the kind changes and come back with it (spec 7.3).
 */
const route = useRoute()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()

const strand = computed(() => store.get('strands', String(route.params.strandId)))
const list = computed(() => `/p/${store.projectId}/strands`)
const medium = computed(() => store.kind)
const isQuest = computed(() => !!strand.value && QUEST_KINDS.includes(strand.value.kind))
const sceneCount = computed(() => (strand.value ? store.rows.scenes.filter(s => s.strandIds.includes(strand.value!.id)).length : 0))

const kindItems = computed(() =>
  STRAND_KINDS
    .filter(k => store.modules.quests || !QUEST_KINDS.includes(k) || k === strand.value?.kind)
    .map(k => ({ value: k, label: label('strandKind', k) })),
)

/** A change of a select or a picker: queued typing goes first, so the answer never undoes it. */
async function save(patch: UpdateInput<'strands'>) {
  if (!strand.value) return
  const id = strand.value.id
  await store.flush()
  await store.update('strands', id, patch).catch(() => {})
}

function rename(name: string) {
  if (strand.value && name.trim()) store.patchSoon('strands', strand.value.id, { name })
}

function describe(doc: RichDoc) {
  if (strand.value) store.patchSoon('strands', strand.value.id, { description: doc }, 1000)
}

async function trash() {
  if (!strand.value) return
  if (await store.remove('strands', strand.value.id).catch(() => null)) await navigateTo(list.value)
}

const menu = computed(() => [[{ label: t('common.actions.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: trash }]])
</script>

<template>
  <DPage v-if="strand" :title="strand.name" :back="list" :back-label="term('strands')" width="prose">
    <template #actions>
      <UDropdownMenu :items="menu" :content="{ align: 'end' }">
        <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="t('strands.sheet.actions')" class="max-lg:size-11 max-lg:justify-center" />
      </UDropdownMenu>
    </template>

    <header class="@container pb-8">
      <!-- The page's heading for assistive technology; the title itself is edited in place. -->
      <h1 class="sr-only">{{ strand.name }}</h1>
      <DInlineText
        :lang="store.project?.language"
        :model-value="strand.name"
        required
        variant="title"
        :maxlength="200"
        :aria-label="t('strands.sheet.name')"
        class="voice-author font-semibold! lg:text-4xl! lg:leading-tight!"
        @update:model-value="rename"
      />

      <dl class="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 @2xl:grid-cols-3">
        <div class="col-span-2 min-w-0 @md:col-span-1">
          <dt class="mb-1.5 text-sm font-medium text-muted">{{ t('strands.sheet.kind') }}</dt>
          <dd>
            <USelect
              :model-value="strand.kind"
              :items="kindItems"
              color="neutral"
              variant="ghost"
              class="-ms-2.5 max-w-full max-lg:min-h-11"
              :aria-label="t('strands.sheet.kind')"
              @update:model-value="(kind) => save({ kind: kind as StrandKind })"
            />
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="mb-1.5 text-sm font-medium text-muted">{{ t('strands.sheet.color') }}</dt>
          <dd class="-ms-2.5">
            <DColorPicker :model-value="strand.color" class="max-lg:min-h-11" @update:model-value="(color) => save({ color })" />
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="mb-1.5 text-sm font-medium text-muted">{{ t('strands.sheet.status') }}</dt>
          <dd class="-ms-2.5">
            <DStatusSelect :model-value="strand.status" kind="planning" size="md" class="max-lg:min-h-11" @update:model-value="(status) => save({ status: status as PlanningStatus })" />
          </dd>
        </div>
      </dl>
    </header>

    <div class="space-y-10">
      <section v-if="strand.kind === 'arc'" aria-labelledby="strand-arc">
        <h2 id="strand-arc" class="mb-2 text-lg font-semibold text-highlighted">{{ t('strands.sheet.arc') }}</h2>
        <div class="max-w-sm">
          <!-- A character in the trash stays linked (the field is not sent); its picker would show the id. -->
          <DEntityPicker
            type="character"
            creatable
            :model-value="store.get('characters', strand.characterId) ? strand.characterId : null"
            :placeholder="strand.characterId && !store.get('characters', strand.characterId) ? t('strands.sheet.arcInTrash') : t('strands.sheet.arcPlaceholder')"
            :aria-label="t('strands.sheet.arc')"
            class="max-lg:min-h-11"
            @update:model-value="(id) => save({ characterId: (id as string | null) ?? null })"
          />
        </div>
      </section>

      <section aria-labelledby="strand-description">
        <h2 id="strand-description" class="mb-2 text-lg font-semibold text-highlighted">{{ t('common.fields.description') }}</h2>
        <ArchitectureLongText
          :key="strand.id"
          :model-value="strand.description"
          framed
          :placeholder="t(`strands.sheet.descriptionPlaceholder.${strand.kind}`)"
          :aria-label="t('common.fields.description')"
          @update:model-value="describe"
        />
      </section>

      <template v-if="isQuest">
        <StrandsQuest v-if="store.modules.quests" :strand="strand" />
        <p v-else class="flex items-start gap-2 text-sm text-muted">
          <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" />
          <span>
            {{ t('strands.sheet.questsOff') }}
            <ULink :to="`/p/${store.projectId}/settings`" class="text-primary underline">{{ t('strands.sheet.questsOffAction') }}</ULink>
          </span>
        </p>
      </template>

      <section aria-labelledby="strand-scenes">
        <h2 id="strand-scenes" class="mb-2 text-lg font-semibold text-highlighted">{{ term('scene', 2) }}</h2>
        <ManuscriptAppearances v-if="sceneCount" entity-type="strand" :entity-id="strand.id" />
        <p v-else class="text-sm text-muted">{{ t(`strands.sheet.noScenes.${medium}`) }}</p>
      </section>
    </div>
  </DPage>

  <DPage v-else :title="term('strands')" :back="list" :back-label="term('strands')" width="prose">
    <DEmptyState
      icon="i-lucide-spline"
      :title="t(`strands.sheet.notFound.${medium}`)"
      :actions="[
        { label: term('strands'), to: list, color: 'neutral', variant: 'outline', class: 'max-lg:min-h-11' },
        { label: term('trash'), to: `/p/${store.projectId}/trash`, color: 'neutral', variant: 'link', class: 'max-lg:min-h-11' },
      ]"
    />
  </DPage>
</template>
