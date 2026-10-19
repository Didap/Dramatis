<script setup lang="ts">
import type { RichDoc } from '#shared/types/domain'
import { PROFILE_SECTIONS } from '#shared/content/profile'
import { isEmptyDoc, parseMentionId } from '#shared/utils/richtext'

/**
 * "Apri scheda" from the text, on a desktop (spec 5.3): the entity in a slideover, read only, while the
 * scene stays where it was. The full sheet is one link away.
 */
const refId = defineModel<string | null>('refId', { default: null })

const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const { label: enumLabel } = useEnums()

const open = computed({
  get: () => !!refId.value,
  set: (value) => { if (!value) refId.value = null },
})

const target = computed(() => parseMentionId(refId.value))

const view = computed(() => {
  const ref = target.value
  if (!ref) return null
  const base = { path: store.refPath(ref), aliases: [] as string[], kind: '', tagline: '', imageId: null as string | null, color: '', icon: REF_ICONS[ref.type], portrait: false, docs: [] as { label: string, doc: RichDoc | null }[], answers: [] as { question: string, answer: string }[], lists: [] as { label: string, items: string[] }[] }
  switch (ref.type) {
    case 'character': {
      const c = store.get('characters', ref.id)
      if (!c) return null
      const physical = c.profile?.physical
      const questions = PROFILE_SECTIONS.find(s => s.key === 'physical')?.questions ?? []
      return {
        ...base,
        name: c.name,
        aliases: c.aliases,
        kind: [enumLabel('importance', c.importance), c.role ? enumLabel('role', c.role) : '', store.isGame && c.playable ? t('editor.peek.playable') : ''].filter(Boolean).join(' · '),
        tagline: c.tagline,
        imageId: store.primaryImage('character', c.id),
        color: c.color,
        portrait: true,
        answers: physical?.mode === 'free' ? [] : questions.filter(q => physical?.answers?.[q]?.trim()).map(q => ({ question: t(`profile.sections.physical.questions.${q}.label`), answer: physical!.answers![q]!.trim() })),
        docs: [
          ...(physical?.free && !isEmptyDoc(physical.free) && physical.mode !== 'interview' ? [{ label: t('profile.sections.physical.title'), doc: physical.free }] : []),
          ...(c.description && !isEmptyDoc(c.description) ? [{ label: t('common.fields.description'), doc: c.description }] : []),
        ],
        lists: [
          { label: t('editor.peek.qualities'), items: c.traits?.qualities ?? [] },
          { label: t('editor.peek.flaws'), items: c.traits?.flaws ?? [] },
        ].filter(list => list.items.length),
      }
    }
    case 'location': {
      const l = store.get('locations', ref.id)
      if (!l) return null
      return { ...base, name: l.name, kind: [term('location'), [l.city, l.region, l.nation].filter(Boolean).join(', ')].filter(Boolean).join(' · '), imageId: store.primaryImage('location', l.id), color: l.color, docs: l.description ? [{ label: t('common.fields.description'), doc: l.description }] : [] }
    }
    case 'object': {
      const o = store.get('objects', ref.id)
      if (!o) return null
      return { ...base, name: o.name, kind: [term('object'), o.kind].filter(Boolean).join(' · '), imageId: store.primaryImage('object', o.id), color: o.color, docs: o.description ? [{ label: t('common.fields.description'), doc: o.description }] : [] }
    }
    case 'group': {
      const g = store.get('groups', ref.id)
      if (!g) return null
      return { ...base, name: g.name, kind: [term('group'), enumLabel('groupKind', g.kind)].join(' · '), imageId: store.primaryImage('group', g.id), color: g.color, docs: g.description ? [{ label: t('common.fields.description'), doc: g.description }] : [] }
    }
    case 'codex': {
      const e = store.get('codexEntries', ref.id)
      if (!e) return null
      return { ...base, name: e.title, kind: [term('codexEntry'), store.get('codexCategories', e.categoryId)?.name].filter(Boolean).join(' · '), docs: e.body ? [{ label: term('codexEntry'), doc: e.body }] : [] }
    }
  }
  return null
})
</script>

<template>
  <USlideover v-model:open="open" side="right" :title="view?.name ?? ''" :description="view?.kind" :ui="{ content: 'max-w-md' }">
    <template #title>
      <span class="voice-author text-xl font-semibold">{{ view?.name }}</span>
    </template>
    <template #body>
      <div v-if="view" class="space-y-6">
        <div class="flex items-start gap-4">
          <DEntityAvatar :name="view.name" :image-id="view.imageId" :color="view.color || null" :shape="view.portrait ? 'portrait' : 'square'" :icon="view.portrait ? undefined : view.icon" size="lg" />
          <div class="min-w-0 flex-1 space-y-1.5">
            <p v-if="view.tagline" class="voice-author italic text-muted">{{ view.tagline }}</p>
            <p v-if="view.aliases.length" class="text-sm text-muted">
              {{ t('editor.mention.aliases') }} <span class="voice-author text-toned">{{ view.aliases.join(', ') }}</span>
            </p>
          </div>
        </div>

        <div v-if="view.answers.length" class="space-y-3">
          <h3 class="text-sm font-semibold text-highlighted">{{ t('profile.sections.physical.title') }}</h3>
          <dl class="space-y-3">
            <div v-for="item in view.answers" :key="item.question">
              <dt class="text-xs text-muted">{{ item.question }}</dt>
              <dd class="voice-author text-[0.9375rem] text-default">{{ item.answer }}</dd>
            </div>
          </dl>
        </div>

        <div v-for="part in view.docs" :key="part.label" class="space-y-1.5">
          <h3 class="text-sm font-semibold text-highlighted">{{ part.label }}</h3>
          <EditorRichView :doc="part.doc" class="d-rich-view--small" />
        </div>

        <div v-for="list in view.lists" :key="list.label" class="space-y-1.5">
          <h3 class="text-sm font-semibold text-highlighted">{{ list.label }}</h3>
          <ul class="voice-author list-disc space-y-0.5 ps-5 text-[0.9375rem]">
            <li v-for="(item, i) in list.items" :key="i">{{ item }}</li>
          </ul>
        </div>
      </div>
      <p v-else class="text-sm text-muted">{{ t('editor.peek.gone') }}</p>
    </template>
    <template #footer>
      <UButton v-if="view" :to="view.path" variant="outline" :label="t('editor.peek.openFull')" trailing-icon="i-lucide-arrow-right" />
    </template>
  </USlideover>
</template>
