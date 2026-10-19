<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { Scene } from '#shared/types/entities'
import { CHOICE_FORM } from './ChoiceForm.vue'
import { useChoiceText } from './ChoiceSentence.vue'

/**
 * The list view of the flow (spec 4.5 "Elenco"): every scene in manuscript order, under its act and
 * chapter, with its choices as sentences, or where it continues. The accessible route to everything
 * the graph does, and the phone's default: a scene's title opens its flow panel (start, ending and its
 * name, the choices that lead in), docked beside the list on desktop and a drawer on the phone; the
 * row menu opens the scene itself.
 */
const emit = defineEmits<{ show: [sceneId: string], inspect: [sceneId: string, viaKeyboard: boolean] }>()
const props = withDefaults(defineProps<{
  /** The filters of the flow page: only the scenes inside them are listed. */
  act?: string | null
  strand?: string | null
  /** The scene whose panel is open beside the list (desktop). */
  selected?: string | null
}>(), { act: null, strand: null, selected: null })

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const text = useChoiceText()
const { analysis } = useFlow()
const openChoice = inject(CHOICE_FORM, () => {})
const desktop = useMediaQuery('(min-width: 1024px)')

interface ChapterBlock { id: string, number: number, title: string, scenes: Scene[] }
interface ActBlock { id: string, number: number, title: string, chapters: ChapterBlock[] }

const acts = computed<ActBlock[]>(() => {
  const blocks: ActBlock[] = []
  const byPart = new Map<string, ActBlock>()
  for (const chapter of store.orderedChapters) {
    if (props.act && chapter.partId !== props.act) continue
    const scenes = store.chapterScenes(chapter.id).filter(s => !props.strand || s.strandIds.includes(props.strand))
    if (!scenes.length) continue
    const key = chapter.partId ?? ''
    let block = byPart.get(key)
    if (!block) {
      const part = chapter.partId ? store.get('parts', chapter.partId) : undefined
      block = { id: key, number: part ? store.orderedParts.findIndex(p => p.id === part.id) + 1 : 0, title: part?.title ?? '', chapters: [] }
      byPart.set(key, block)
      blocks.push(block)
    }
    block.chapters.push({ id: chapter.id, number: store.chapterNumber(chapter.id), title: chapter.title || t('common.untitled.chapter'), scenes })
  }
  return blocks
})

const outgoing = computed(() => {
  const map = new Map<string, number>()
  for (const link of store.rows.links) map.set(link.fromSceneId, (map.get(link.fromSceneId) ?? 0) + 1)
  return map
})

/** Where a scene without choices goes: the implicit continuation, or nowhere. */
const continuation = computed(() => {
  const map = new Map<string, string>()
  for (const edge of analysis.value?.edges ?? []) if (edge.linkId === null) map.set(edge.from, edge.to)
  return map
})

const startId = computed(() => store.project?.startSceneId ?? null)
const unreachable = computed(() => new Set(analysis.value?.unreachable ?? []))

function menu(scene: Scene) {
  const isStart = startId.value === scene.id
  return [
    [
      { label: t('flow.choices.add'), icon: 'i-lucide-plus', onSelect: () => openChoice({ fromSceneId: scene.id }) },
      { label: t('flow.list.showInGraph'), icon: 'i-lucide-crosshair', onSelect: () => emit('show', scene.id) },
      { label: t('flow.inspector.openScene'), icon: 'i-lucide-file-pen-line', to: store.refPath({ type: 'scene', id: scene.id }) },
    ],
    [
      isStart
        ? { label: t('flow.list.unsetStart'), icon: 'i-lucide-circle-off', onSelect: () => store.updateProject({ startSceneId: null }).catch(() => {}) }
        : { label: t('flow.list.setStart'), icon: 'i-lucide-play', onSelect: () => store.updateProject({ startSceneId: scene.id }).catch(() => {}) },
      scene.ending
        ? { label: t('flow.list.unsetEnding'), icon: 'i-lucide-flag-off', onSelect: () => store.update('scenes', scene.id, { ending: false }).catch(() => {}) }
        : { label: t('flow.list.setEnding'), icon: 'i-lucide-flag', onSelect: () => store.update('scenes', scene.id, { ending: true }).catch(() => {}) },
    ],
  ]
}

/** A click from the keyboard (Enter or Space) has no pointer position: the focus follows into the panel. */
const onTitle = (event: MouseEvent, id: string) => emit('inspect', id, event.detail === 0)
</script>

<template>
  <div class="flow-list space-y-10">
    <p v-if="!acts.length" class="text-sm text-muted">{{ t('flow.filters.nothing') }}</p>
    <section v-for="act in acts" :key="act.id || 'none'" :aria-label="act.title || undefined">
      <header v-if="act.id" class="mb-5">
        <p class="position-line">{{ term('part') }} {{ act.number }}</p>
        <h2 class="voice-author mt-1 text-lg font-semibold text-highlighted">{{ act.title || t('common.untitled.part') }}</h2>
      </header>

      <div class="space-y-8">
        <section v-for="chapter in act.chapters" :key="chapter.id" :aria-label="chapter.title">
          <h3 class="mb-2 flex items-baseline gap-2 border-b border-default pb-2 text-sm text-muted">
            <span class="tabular">{{ term('chapter') }} {{ chapter.number }}</span>
            <span aria-hidden="true">·</span>
            <span class="voice-author font-semibold text-toned">{{ chapter.title }}</span>
          </h3>

          <ul class="divide-y divide-default/60">
            <li v-for="scene in chapter.scenes" :key="scene.id" class="py-2" :data-scene="scene.id">
              <div class="flex min-h-11 items-start gap-2 rounded-[calc(var(--ui-radius)*2)] transition-colors duration-150 sm:items-center" :class="selected === scene.id ? 'bg-elevated' : ''">
                <span class="hidden w-11 shrink-0 ps-1 font-mono text-xs text-dimmed sm:block">{{ scene.code }}</span>
                <UIcon v-if="store.modules.scene_kinds" :name="SCENE_KIND_ICONS[scene.kind] ?? 'i-lucide-file-text'" class="mt-2 size-4 shrink-0 text-dimmed sm:mt-0" />
                <button
                  type="button"
                  :data-scene-button="scene.id"
                  class="group/title flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded py-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
                  :aria-expanded="desktop ? selected === scene.id : undefined"
                  :aria-controls="desktop && selected === scene.id ? 'flow-scene-panel' : undefined"
                  :aria-haspopup="desktop ? undefined : 'dialog'"
                  @click="onTitle($event, scene.id)"
                >
                  <span class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span class="voice-author font-semibold text-highlighted group-hover/title:underline">
                      <span v-if="store.modules.scene_kinds" class="sr-only">{{ label('sceneKind', scene.kind) }}: </span>{{ scene.title || t('common.untitled.scene') }}
                    </span>
                    <span v-if="startId === scene.id" class="inline-flex items-center gap-1 text-xs font-medium text-primary">
                      <UIcon name="i-lucide-play" class="size-3.5" />{{ t('flow.node.start') }}
                    </span>
                    <span v-if="scene.ending" class="inline-flex items-center gap-1 text-xs font-medium text-toned">
                      <UIcon name="i-lucide-flag" class="size-3.5" />{{ scene.endingLabel ? t('flow.node.endingNamed', { label: scene.endingLabel }) : term('ending') }}
                    </span>
                    <span v-if="unreachable.has(scene.id)" class="inline-flex items-center gap-1 text-xs font-medium text-warning">
                      <UIcon name="i-lucide-unlink" class="size-3.5" />{{ t('flow.node.unreachable') }}
                    </span>
                  </span>
                  <!-- Below 40rem the code and the status move under the title. -->
                  <span class="mt-0.5 flex items-center gap-3 sm:hidden">
                    <span class="font-mono text-xs text-dimmed">{{ scene.code }}</span>
                    <DStatusBadge :value="scene.status" />
                  </span>
                </button>
                <span class="hidden shrink-0 sm:inline-flex"><DStatusBadge :value="scene.status" /></span>
                <UButton
                  icon="i-lucide-plus"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  class="max-lg:size-11 max-lg:justify-center"
                  :aria-label="t('flow.list.addFrom', { scene: scene.title || t('common.untitled.scene') })"
                  @click="openChoice({ fromSceneId: scene.id })"
                />
                <UDropdownMenu :items="menu(scene)" :content="{ align: 'end' }">
                  <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" class="max-lg:size-11 max-lg:justify-center" :aria-label="t('flow.list.sceneMenu', { scene: scene.title || t('common.untitled.scene') })" />
                </UDropdownMenu>
              </div>

              <div class="ps-0 sm:ps-13">
                <FlowChoiceList v-if="outgoing.get(scene.id)" :scene-id="scene.id" @edit="(id: string) => openChoice({ linkId: id })" />
                <p v-else-if="scene.ending" class="flex items-center gap-2 py-1 text-sm text-muted">
                  <UIcon name="i-lucide-flag" class="size-3.5 shrink-0" />{{ t('flow.list.endsHere') }}
                </p>
                <p v-else-if="continuation.get(scene.id)" class="flex items-baseline gap-2 py-1 text-sm text-muted">
                  <UIcon name="i-lucide-corner-down-right" class="size-3.5 shrink-0 self-center" />
                  <i18n-t keypath="flow.choices.continues" tag="span" scope="global">
                    <template #scene><span class="voice-author text-toned">{{ text.sceneTitle(continuation.get(scene.id)!) }}</span></template>
                  </i18n-t>
                </p>
                <p v-else class="flex items-center gap-2 py-1 text-sm text-warning">
                  <UIcon name="i-lucide-triangle-alert" class="size-3.5 shrink-0" />{{ t('flow.choices.deadEnd') }}
                </p>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </section>
  </div>
</template>
