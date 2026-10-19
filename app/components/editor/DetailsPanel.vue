<script setup lang="ts">
import type { DurationUnit, EntityRef, PointOfView, RichDoc, SceneKind } from '#shared/types/domain'
import type { Strand, UpdateInput } from '#shared/types/entities'
import { DURATION_UNITS, POINTS_OF_VIEW, SCENE_KINDS } from '#shared/utils/constants'

/**
 * Scene details (spec 4.5 "Details panel"): status, point of view, synopsis, kind, the tags with their
 * source, strands, story time, notes; with `branching` the code, start scene, ending and choices.
 * Each field has its label above its value and is edited in place.
 */
const props = defineProps<{
  sceneId: string
  words: number
  chars: number
}>()

const emit = defineEmits<{
  find: [refId: string]
  open: [ref: EntityRef]
}>()

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label: enumLabel } = useEnums()
const { number, words: wordsLabel } = useFormat()
const toast = useToast()
const id = useId()

const scene = computed(() => store.get('scenes', props.sceneId))
const modules = computed(() => store.modules)
const NONE = '__none'

function update(patch: UpdateInput<'scenes'>) {
  void store.update('scenes', props.sceneId, patch).catch(() => {})
}

/**
 * Typing: applied at once, sent after a pause and merged with whatever else is waiting. `now` sends at
 * once through the same queue, so a menu choice never races an older typed value of the same field.
 */
function soon(patch: UpdateInput<'scenes'>, now = false) {
  store.patchSoon('scenes', props.sceneId, patch, now ? 0 : undefined)
}

// ---------------------------------------------------------------- point of view

const povItems = computed(() => [
  { value: NONE, label: t('editor.details.povNone') },
  ...POINTS_OF_VIEW.map(value => ({ value, label: enumLabel('pov', value) })),
])

const povCharacterItems = computed(() => {
  const inScene = new Set(scene.value?.characterIds ?? [])
  const make = (c: { id: string, name: string, tagline: string }) => ({
    id: c.id,
    label: c.name,
    description: c.tagline || undefined,
    avatar: { src: mediaUrl(store.primaryImage('character', c.id), 'thumb'), alt: c.name, text: c.name.slice(0, 1).toLocaleUpperCase() },
  })
  const here = store.rows.characters.filter(c => inScene.has(c.id)).map(make)
  const others = store.rows.characters.filter(c => !inScene.has(c.id)).map(make)
  return [
    ...(here.length ? [{ type: 'label' as const, id: 'label:here', label: t('editor.details.inThisScene') }, ...here] : []),
    ...(others.length ? [{ type: 'label' as const, id: 'label:others', label: here.length ? t('editor.details.otherCharacters') : term('characters') }, ...others] : []),
  ]
})

/** The POV character joins the scene's characters as a manual tag when it is not there yet. */
function setPovCharacter(value: unknown) {
  const current = scene.value
  if (!current) return
  const povCharacterId = typeof value === 'string' && value ? value : null
  const key = povCharacterId ? `character:${povCharacterId}` : ''
  if (!povCharacterId || current.tags[key]) return update({ povCharacterId })
  const manualTags = Object.entries(current.tags).filter(([, info]) => info.manual).map(([k]) => {
    const [type, tagId] = k.split(':') as ['character' | 'location' | 'object', string]
    return { type, id: tagId }
  })
  update({
    povCharacterId,
    manualTags: [...manualTags, { type: 'character', id: povCharacterId }],
    tags: { ...current.tags, [key]: { manual: true } },
    characterIds: [...current.characterIds, povCharacterId],
  } as UpdateInput<'scenes'>)
}

// ---------------------------------------------------------------- kind, strands

const kindItems = computed(() => SCENE_KINDS.map(value => ({ value, label: enumLabel('sceneKind', value), icon: SCENE_KIND_ICONS[value] })))

const strands = computed(() => (scene.value?.strandIds ?? []).map(sid => store.get('strands', sid)).filter((s): s is Strand => !!s))
const strandItems = computed(() => store.rows.strands
  .filter(s => !scene.value?.strandIds.includes(s.id))
  .map(s => ({ id: s.id, label: s.name, description: enumLabel('strandKind', s.kind), icon: REF_ICONS.strand })))

function addStrand(strandId: string | undefined) {
  if (!strandId || !scene.value || scene.value.strandIds.includes(strandId)) return
  update({ strandIds: [...scene.value.strandIds, strandId] })
}

async function createStrand(name: string) {
  const clean = name.trim()
  if (!clean) return
  const row = await store.create('strands', { name: clean }).catch(() => null)
  if (row) addStrand(row.id)
}

function removeStrand(strandId: string) {
  if (!scene.value) return
  update({ strandIds: scene.value.strandIds.filter(s => s !== strandId) })
}

// ---------------------------------------------------------------- story time

const previousStoryAt = computed(() => {
  const order = store.orderedScenes
  const index = order.findIndex(s => s.id === props.sceneId)
  for (let i = index - 1; i >= 0; i--) if (order[i]!.storyAt) return order[i]!.storyAt
  return null
})

const unitItems = computed(() => [
  { value: NONE, label: t('editor.details.durationNone') },
  ...DURATION_UNITS.map(value => ({ value, label: enumLabel('durationUnit', value) })),
])

function setDurationValue(raw: string | number) {
  const value = String(raw).trim() === '' ? null : Math.max(0, Math.round(Number(raw)))
  if (value !== null && Number.isNaN(value)) return
  soon({ durationValue: value, ...(value !== null && !scene.value?.durationUnit ? { durationUnit: 'minutes' as const } : {}) })
}

// ---------------------------------------------------------------- branching

const isStart = computed(() => store.project?.startSceneId === props.sceneId)
const startScene = computed(() => (store.project?.startSceneId && !isStart.value ? store.get('scenes', store.project.startSceneId) : null))

function setStart(value: boolean) {
  void store.updateProject({ startSceneId: value ? props.sceneId : null }).catch(() => {})
}

async function copyCode() {
  if (!scene.value?.code) return
  try {
    await navigator.clipboard.writeText(scene.value.code)
    toast.add({ title: t('editor.details.codeCopied', { code: scene.value.code }), icon: 'i-lucide-copy-check' })
  }
  catch {}
}

/**
 * On touch the switch row is 44px tall and the track takes taps from a 44px square around it; the label
 * toggles it too.
 */
const SWITCH_UI = {
  root: 'pointer-coarse:min-h-11',
  base: 'relative pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1.5 pointer-coarse:before:-inset-y-3.5',
}

const synopsisLength = computed(() => scene.value?.synopsis.length ?? 0)
</script>

<template>
  <div v-if="scene" class="d-details space-y-8 pb-6">
    <!-- Status, point of view and the counts: the smallest snap of the phone drawer shows these. -->
    <section class="space-y-4">
      <div>
        <div class="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
          <p class="text-sm font-medium text-default">{{ t('editor.details.status') }}</p>
          <p class="text-xs text-muted">{{ t('editor.details.counts', { words: wordsLabel(words), chars: number(chars) }) }}</p>
        </div>
        <EditorStatusControl :model-value="scene.status" @update:model-value="(status) => update({ status })" />
      </div>
      <div class="grid gap-4">
        <div>
          <label :for="`${id}-pov`" class="mb-1.5 block text-sm font-medium text-default">{{ t('editor.details.pov') }}</label>
          <USelect
            :id="`${id}-pov`"
            :model-value="scene.pov ?? NONE"
            :items="povItems"
            value-key="value"
            size="sm"
            class="w-full"
            :ui="{ base: 'pointer-coarse:min-h-11' }"
            @update:model-value="(v) => update({ pov: v === NONE ? null : v as PointOfView })"
          />
        </div>
        <div>
          <label :for="`${id}-pov-character`" class="mb-1.5 block text-sm font-medium text-default">{{ t('editor.details.povCharacter') }}</label>
          <USelectMenu
            :id="`${id}-pov-character`"
            :model-value="scene.povCharacterId ?? undefined"
            :items="povCharacterItems"
            value-key="id"
            label-key="label"
            :filter-fields="['label', 'description']"
            :placeholder="t('editor.details.povCharacterNone')"
            :search-input="{ placeholder: t('common.actions.search') }"
            clear
            size="sm"
            class="w-full"
            :ui="{ base: 'voice-author pointer-coarse:min-h-11' }"
            @update:model-value="setPovCharacter"
          />
        </div>
      </div>
    </section>

    <section class="space-y-6">
      <div>
        <label :for="`${id}-title`" class="mb-1.5 block text-sm font-medium text-default">{{ t('editor.details.sceneTitle') }}</label>
        <UInput
          :id="`${id}-title`"
          :model-value="scene.title"
          :maxlength="300"
          variant="none"
          :placeholder="t('common.untitled.scene')"
          class="w-full"
          :ui="{ base: 'd-author-field voice-author px-0 text-base font-semibold pointer-coarse:min-h-11' }"
          @update:model-value="(title) => soon({ title: String(title) })"
        />
      </div>
      <div>
        <div class="mb-1.5 flex items-baseline justify-between gap-2">
          <label :for="`${id}-synopsis`" class="text-sm font-medium text-default">{{ term('synopsis') }}</label>
          <span class="tabular text-xs" :class="synopsisLength > 450 ? 'text-warning' : 'text-dimmed'" aria-hidden="true">{{ number(synopsisLength) }} / 500</span>
        </div>
        <UTextarea
          :id="`${id}-synopsis`"
          :model-value="scene.synopsis"
          :maxlength="500"
          :rows="2"
          autoresize
          variant="none"
          :placeholder="t('editor.details.synopsisPlaceholder')"
          class="w-full"
          :ui="{ base: 'd-author-field voice-author px-0 text-[0.9375rem] leading-relaxed' }"
          @update:model-value="(synopsis) => soon({ synopsis: String(synopsis) })"
        />
      </div>
    </section>

    <section v-if="modules.scene_kinds">
      <label :for="`${id}-kind`" class="mb-1.5 block text-sm font-medium text-default">{{ t('editor.details.kind') }}</label>
      <USelect
        :id="`${id}-kind`"
        :model-value="scene.kind"
        :items="kindItems"
        value-key="value"
        :icon="SCENE_KIND_ICONS[scene.kind]"
        size="sm"
        class="w-full"
        :ui="{ base: 'pointer-coarse:min-h-11' }"
        @update:model-value="(v) => update({ kind: v as SceneKind })"
      />
    </section>

    <section v-if="modules.branching" id="d-scene-flow" class="scroll-mt-4 space-y-4">
      <h3 class="text-base font-semibold text-highlighted">{{ term('flow') }}</h3>
      <div class="flex items-center gap-2 text-sm">
        <span class="text-muted">{{ t('editor.details.code') }}</span>
        <code class="font-mono text-sm text-highlighted">{{ scene.code }}</code>
        <UButton icon="i-lucide-copy" size="xs" class="pointer-coarse:size-11 pointer-coarse:justify-center" :aria-label="t('editor.details.copyCode', { code: scene.code })" @click="copyCode" />
      </div>
      <div>
        <USwitch
          :model-value="isStart"
          :ui="SWITCH_UI"
          :label="t('editor.details.start')"
          :description="startScene ? t('editor.details.startElsewhere', { title: startScene.title || t('common.untitled.scene') }) : t('editor.details.startHint')"
          @update:model-value="setStart"
        />
      </div>
      <div class="space-y-2">
        <USwitch
          :model-value="scene.ending"
          :ui="SWITCH_UI"
          :label="term('ending')"
          :description="t('editor.details.endingHint')"
          @update:model-value="(ending) => update({ ending })"
        />
        <div v-if="scene.ending" class="ps-11">
          <label :for="`${id}-ending`" class="mb-1 block text-xs text-muted">{{ t('editor.details.endingLabel') }}</label>
          <UInput
            :id="`${id}-ending`"
            :model-value="scene.endingLabel"
            :maxlength="120"
            size="sm"
            class="w-full"
            :ui="{ base: 'voice-author pointer-coarse:min-h-11' }"
            :placeholder="t('editor.details.endingPlaceholder')"
            @update:model-value="(endingLabel) => soon({ endingLabel: String(endingLabel) })"
          />
        </div>
      </div>
      <FlowSceneChoices :scene-id="sceneId" />
    </section>

    <section class="space-y-5">
      <div>
        <p class="mb-1.5 text-sm font-medium text-default">{{ term('characters') }}</p>
        <EditorTagField :scene-id="sceneId" type="character" @find="(r) => emit('find', r)" @open="(r) => emit('open', r)" />
      </div>
      <div>
        <p class="mb-1.5 text-sm font-medium text-default">{{ term('locations') }}</p>
        <EditorTagField :scene-id="sceneId" type="location" @find="(r) => emit('find', r)" @open="(r) => emit('open', r)" />
      </div>
      <div>
        <p class="mb-1.5 text-sm font-medium text-default">{{ term('objects') }}</p>
        <EditorTagField :scene-id="sceneId" type="object" @find="(r) => emit('find', r)" @open="(r) => emit('open', r)" />
      </div>
    </section>

    <section>
      <p class="mb-1.5 text-sm font-medium text-default">{{ term('strands') }}</p>
      <ul v-if="strands.length" class="flex flex-wrap gap-1.5 pointer-coarse:gap-2">
        <li v-for="strand in strands" :key="strand.id" class="flex">
          <NuxtLink
            :to="store.refPath({ type: 'strand', id: strand.id })"
            class="inline-flex h-7 items-center gap-1.5 rounded-s-[4.5px] bg-elevated ps-2 pe-1.5 text-sm pointer-coarse:h-11 pointer-coarse:ps-3 text-default outline-none hover:bg-accented/70 focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
          >
            <DColorDot :color="strand.color" />
            <span class="voice-author truncate">{{ strand.name }}</span>
          </NuxtLink>
          <UButton
            icon="i-lucide-x"
            size="xs"
            class="h-7 rounded-s-none bg-elevated hover:bg-accented/70 pointer-coarse:size-11 pointer-coarse:justify-center"
            :aria-label="t('editor.details.removeStrand', { name: strand.name })"
            @click="removeStrand(strand.id)"
          />
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('editor.details.strandsEmpty', { what: term('strands').toLocaleLowerCase() }) }}</p>
      <USelectMenu
        :model-value="undefined"
        :items="strandItems"
        value-key="id"
        label-key="label"
        create-item
        :placeholder="t('editor.tags.add')"
        :search-input="{ placeholder: t('common.actions.search') }"
        icon="i-lucide-plus"
        variant="ghost"
        size="sm"
        class="mt-1.5 -ms-2"
        :ui="{ base: 'pointer-coarse:min-h-11', trailingIcon: 'hidden', placeholder: 'text-muted' }"
        :aria-label="t('editor.tags.addTo', { what: term('strands') })"
        @update:model-value="addStrand"
        @create="createStrand"
      />
    </section>

    <section class="space-y-4">
      <h3 class="text-base font-semibold text-highlighted">{{ t('editor.details.storyTime') }}</h3>
      <div>
        <p class="mb-1.5 text-sm font-medium text-default">{{ t('editor.details.storyDate') }}</p>
        <EditorStoryTimeField
          :model-value="scene.storyAt"
          :suggest="previousStoryAt"
          @update:model-value="(storyAt: string | null, typed: boolean) => soon({ storyAt }, !typed)"
        />
      </div>
      <div>
        <label :for="`${id}-time-label`" class="mb-1.5 block text-sm font-medium text-default">{{ t('editor.details.storyLabel') }}</label>
        <UInput
          :id="`${id}-time-label`"
          :model-value="scene.storyTimeLabel"
          :maxlength="120"
          size="sm"
          class="w-full"
          :ui="{ base: 'voice-author pointer-coarse:min-h-11' }"
          :placeholder="t('editor.details.storyLabelPlaceholder')"
          @update:model-value="(storyTimeLabel) => soon({ storyTimeLabel: String(storyTimeLabel) })"
        />
      </div>
      <div>
        <p class="mb-1.5 text-sm font-medium text-default">{{ t('editor.details.duration') }}</p>
        <div class="flex gap-2">
          <UInput
            :model-value="scene.durationValue ?? undefined"
            type="number"
            inputmode="numeric"
            min="0"
            size="sm"
            class="w-24"
            :ui="{ base: 'pointer-coarse:min-h-11' }"
            :aria-label="t('editor.details.durationValue')"
            @update:model-value="setDurationValue"
          />
          <USelect
            :model-value="scene.durationUnit ?? NONE"
            :items="unitItems"
            value-key="value"
            size="sm"
            class="flex-1"
            :ui="{ base: 'pointer-coarse:min-h-11' }"
            :aria-label="t('editor.details.durationUnit')"
            @update:model-value="(v) => soon(v === NONE ? { durationUnit: null, durationValue: null } : { durationUnit: v as DurationUnit }, true)"
          />
        </div>
      </div>
    </section>

    <section>
      <p class="mb-1.5 text-sm font-medium text-default">{{ t('editor.details.notes') }}</p>
      <DRichText
        :model-value="scene.notes"
        prose
        size="sm"
        :placeholder="t('editor.details.notesPlaceholder')"
        class="d-author-box"
        @update:model-value="(notes: RichDoc) => soon({ notes })"
      />
    </section>

    <section v-if="modules.script && !modules.branching" class="flex items-center gap-2 text-sm">
      <span class="text-muted">{{ t('editor.details.code') }}</span>
      <code class="font-mono text-sm text-highlighted">{{ scene.code }}</code>
      <UButton icon="i-lucide-copy" size="xs" class="pointer-coarse:size-11 pointer-coarse:justify-center" :aria-label="t('editor.details.copyCode', { code: scene.code })" @click="copyCode" />
    </section>
  </div>
</template>

<style>
/* Long fields look like the page (DESIGN.md "Inputs"): the author's face, a dotted baseline at rest, the
   full frame on focus. */
.d-author-field {
  border-bottom: 1px dotted var(--ui-border-accented);
  border-radius: 0;
  padding-block: 0.25rem;
}
.d-author-field:focus-visible,
.d-author-field:focus {
  border-bottom-color: transparent;
  border-radius: calc(var(--ui-radius) * 1.5);
  box-shadow: 0 0 0 2px var(--ui-primary);
  padding-inline: 0.375rem;
}
.d-author-box .tiptap {
  min-height: 3.5rem;
  padding-block: 0.25rem;
  border-bottom: 1px dotted var(--ui-border-accented);
}
.d-author-box .tiptap.ProseMirror-focused {
  border-bottom-color: transparent;
  border-radius: calc(var(--ui-radius) * 1.5);
  box-shadow: 0 0 0 2px var(--ui-primary);
  padding-inline: 0.375rem;
}
</style>
