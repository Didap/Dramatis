<script setup lang="ts">
import { CHOICE_FORM, type ChoiceFormRequest } from './ChoiceForm.vue'
import { useChoiceText } from './ChoiceSentence.vue'

/**
 * CONTRACT (owned by the flow feature): the choices leading out of a scene, in order, and the ones
 * leading into it, with the implicit continuation (spec 0.8, 5.5); add, edit, reorder, trash.
 * Embedded as <FlowSceneChoices> in the scene editor's details panel when the branching module is on.
 * Pass `nested` when it sits inside a drawer on the phone, so the choice form opens as a nested drawer.
 */
const props = withDefaults(defineProps<{ sceneId: string, nested?: boolean }>(), { nested: false })

const store = useProjectStore()
const { t } = useI18n()
const text = useChoiceText()
const { analysis } = useFlow()

const scene = computed(() => store.get('scenes', props.sceneId))
const outgoing = computed(() => store.rows.links.filter(l => l.fromSceneId === props.sceneId))

/** The next scene in manuscript order: where a scene without choices continues. */
const next = computed(() => {
  const scenes = store.orderedScenes
  const index = scenes.findIndex(s => s.id === props.sceneId)
  return index >= 0 ? scenes[index + 1] ?? null : null
})

const incoming = computed(() => store.rows.links.filter(l => l.toSceneId === props.sceneId && store.get('scenes', l.fromSceneId)))
/** The scene before, when it reaches this one by continuing (no choices, not an ending). */
const continuedFrom = computed(() => {
  const edge = analysis.value?.edges.find(e => e.linkId === null && e.to === props.sceneId)
  return edge ? store.get('scenes', edge.from) ?? null : null
})
const isStart = computed(() => store.project?.startSceneId === props.sceneId)
const unreachable = computed(() => !!analysis.value?.hasStart && !analysis.value.reachable.has(props.sceneId))

// The flow page owns one form for all its views; anywhere else (the scene editor) this panel has its own.
const injected = inject(CHOICE_FORM, null)
const form = reactive<{ open: boolean } & ChoiceFormRequest>({ open: false, linkId: null, fromSceneId: null, toSceneId: null })

function openForm(request: ChoiceFormRequest) {
  if (injected) return injected(request)
  Object.assign(form, { linkId: null, fromSceneId: null, toSceneId: null }, request, { open: true })
}

const flowPath = computed(() => `/p/${store.projectId}/flow?view=graph&scene=${props.sceneId}`)
const headingId = useId()
</script>

<template>
  <div v-if="scene" class="flow-scene-choices space-y-5 text-sm">
    <section :aria-labelledby="`${headingId}-out`" class="space-y-2">
      <h3 :id="`${headingId}-out`" class="text-xs font-medium text-muted">{{ t('flow.choices.outgoing') }}</h3>

      <FlowChoiceList v-if="outgoing.length" :scene-id="sceneId" @edit="(id: string) => openForm({ linkId: id })" />

      <p v-else-if="scene.ending" class="flex items-start gap-2 text-toned">
        <UIcon name="i-lucide-flag" class="mt-0.5 size-4 shrink-0 text-dimmed" />
        {{ t('flow.choices.endingNoChoices') }}
      </p>
      <p v-else-if="next" class="flex items-start gap-2 text-toned">
        <UIcon name="i-lucide-corner-down-right" class="mt-0.5 size-4 shrink-0 text-dimmed" />
        <i18n-t keypath="flow.choices.continues" tag="span" scope="global">
          <template #scene>
            <NuxtLink :to="store.refPath({ type: 'scene', id: next.id })" class="voice-author text-default underline decoration-dotted underline-offset-3 hover:text-highlighted">{{ text.sceneTitle(next.id) }}</NuxtLink>
          </template>
        </i18n-t>
      </p>
      <p v-else class="flex items-start gap-2 text-warning">
        <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
        {{ t('flow.choices.deadEnd') }}
      </p>

      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        size="sm"
        class="max-lg:min-h-11"
        :label="t('flow.choices.add')"
        @click="openForm({ fromSceneId: sceneId })"
      />
    </section>

    <section :aria-labelledby="`${headingId}-in`" class="space-y-2">
      <h3 :id="`${headingId}-in`" class="text-xs font-medium text-muted">{{ t('flow.choices.incoming') }}</h3>
      <ul v-if="incoming.length || continuedFrom || isStart" class="space-y-1">
        <li v-if="isStart" class="flex items-center gap-2 py-1 text-toned">
          <UIcon name="i-lucide-play" class="size-4 shrink-0 text-primary" />
          {{ t('flow.choices.isStart') }}
        </li>
        <li v-for="link in incoming" :key="link.id">
          <button
            type="button"
            class="flex w-full min-w-0 items-baseline gap-2 rounded-[calc(var(--ui-radius)*2)] px-1 py-1.5 text-start outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-(--ui-primary) max-lg:min-h-11 max-lg:items-center"
            :aria-label="t('flow.choices.incomingLabel', { scene: text.sceneTitle(link.fromSceneId), choice: text.choiceLabel(link) })"
            @click="openForm({ linkId: link.id })"
          >
            <UIcon name="i-lucide-arrow-left" class="size-3.5 shrink-0 self-center text-dimmed" />
            <span class="min-w-0 flex-1">
              <span class="voice-author text-toned">{{ text.sceneTitle(link.fromSceneId) }}</span>
              <span class="text-muted">: </span>
              <span v-if="link.label.trim()" class="voice-author italic text-default">{{ link.label.trim() }}</span>
              <span v-else class="text-muted">{{ t('flow.text.continue') }}</span>
            </span>
          </button>
        </li>
        <li v-if="continuedFrom" class="flex items-baseline gap-2 px-1 py-1.5 text-toned">
          <UIcon name="i-lucide-corner-down-right" class="size-3.5 shrink-0 self-center text-dimmed" />
          <i18n-t keypath="flow.choices.continuedFrom" tag="span" scope="global">
            <template #scene><span class="voice-author">{{ text.sceneTitle(continuedFrom.id) }}</span></template>
          </i18n-t>
        </li>
      </ul>
      <p v-else class="text-muted">{{ t('flow.choices.noIncoming') }}</p>
      <p v-if="unreachable" class="flex items-start gap-2 text-warning">
        <UIcon name="i-lucide-unlink" class="mt-0.5 size-4 shrink-0" />
        {{ t('flow.choices.unreachable') }}
      </p>
    </section>

    <NuxtLink v-if="!injected" :to="flowPath" class="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-3">
      <UIcon name="i-lucide-split" class="size-4" />
      {{ t('flow.choices.showInFlow') }}
    </NuxtLink>

    <FlowChoiceForm
      v-if="!injected"
      v-model:open="form.open"
      :link-id="form.linkId"
      :from-scene-id="form.fromSceneId"
      :to-scene-id="form.toSceneId"
      :nested="nested"
    />
  </div>
</template>
