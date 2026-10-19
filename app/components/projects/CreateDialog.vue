<script setup lang="ts">
import { UDrawer, UModal } from '#components'
import { STRUCTURES, type StructureDef } from '#shared/content/structures'
import type { ProjectKind } from '#shared/types/domain'
import type { Project } from '#shared/types/entities'

/**
 * New project (spec 4.1, 5.1): a dialog on desktop, a full-height drawer on a phone. An optional
 * title, the type with one line each, and where to start: blank, a structure of that type with its
 * shape, or the example. One step: the button waits for the server; on failure the dialog stays
 * open with the reason and nothing is created.
 */
const open = defineModel<boolean>('open', { default: false })

const { t, locale } = useI18n()
const { label } = useEnums()
const { number, chapters } = useFormat()
const nuxtApp = useNuxtApp()
const desktop = useIsDesktop()

type Start = 'blank' | 'structure' | 'demo'
const form = reactive({ title: '', kind: 'novel' as ProjectKind, start: 'blank' as Start, structure: '' })
const busy = ref(false)
const failure = ref('')

watch(open, (value) => {
  if (!value) return
  Object.assign(form, { title: '', kind: 'novel', start: 'blank', structure: '' })
  failure.value = ''
})

// The structures of the type, those made for it first (a game lists the hero's journey last).
const structures = computed(() => STRUCTURES
  .filter(s => (s.media as readonly ProjectKind[]).includes(form.kind))
  .sort((a, b) => Number(b.media[0] === form.kind) - Number(a.media[0] === form.kind)))

// The first structure of the type is chosen when the list opens; changing type swaps the list and
// keeps the choice when the other type offers it too (the hero's journey).
watch([() => form.start, () => form.kind], () => {
  if (form.start === 'structure' && !structures.value.some(s => s.key === form.structure)) form.structure = structures.value[0]?.key ?? ''
})

// The list opens below the fold of the dialog: bring it into view.
const structureList = useTemplateRef<HTMLElement>('structureList')
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
watch(() => form.start, async (start) => {
  if (start !== 'structure') return
  await nextTick()
  structureList.value?.scrollIntoView({ block: 'nearest', behavior: reducedMotion.value ? 'auto' : 'smooth' })
})

/** "3 parti · 10 capitoli · 3 linee narrative"; in a game, acts, and quests apart from storylines. */
function shape(structure: StructureDef): string {
  // Parts and strands take the medium's own word (spec 2.1): "3 atti" in a game.
  const counted = (n: number, term: string) => t('projects.shape.count', { n: number(n), term: t(term, n).toLocaleLowerCase(locale.value) })
  const quests = structure.strands.filter(s => s.kind === 'quest' || s.kind === 'side_quest').length
  const others = structure.strands.length - quests
  const items = [
    counted(structure.parts.length, `common.vocab.${form.kind}.part`),
    chapters(structure.parts.reduce((n, part) => n + part.chapters.length, 0)),
  ]
  if (form.kind === 'novel') items.push(counted(structure.strands.length, 'common.vocab.novel.strand'))
  else {
    if (quests) items.push(t('projects.shape.quests', { n: number(quests) }, quests))
    if (others) items.push(t('projects.shape.storylines', { n: number(others) }, others))
  }
  return items.join(' · ')
}

const kindItems = computed(() => (['novel', 'game'] as const).map(kind => ({
  value: kind,
  label: label('projectKind', kind),
  description: t(`projects.create.kinds.${kind}`),
  icon: kind === 'novel' ? 'i-lucide-book-open' : 'i-lucide-gamepad-2',
})))

const startItems = computed(() => [
  { value: 'blank', label: t('projects.create.starts.blank'), description: t('projects.create.starts.blankHint') },
  { value: 'structure', label: t('projects.create.starts.structure'), description: t(`projects.create.starts.structureHint.${form.kind}`) },
  { value: 'demo', label: t('projects.create.starts.demo'), description: t('projects.create.starts.demoHint') },
])

// Only the chosen structure shows its description, so the list stays short.
const structureItems = computed(() => structures.value.map(structure => ({
  value: structure.key as string,
  label: t(`structures.${structure.key}.name`),
  shape: shape(structure),
  description: structure.key === form.structure ? t(`structures.${structure.key}.description`) : undefined,
})))

async function create() {
  if (busy.value) return
  busy.value = true
  failure.value = ''
  try {
    // The example is a fresh copy, which the server titles as one ("Esempio: ...", spec appendix C).
    const project = form.start === 'demo'
      ? await $fetch<Project>('/api/projects/demo', { method: 'POST', body: { kind: form.kind, locale: locale.value } })
      : await $fetch<Project>('/api/projects', {
          method: 'POST',
          body: {
            title: form.title.trim(),
            kind: form.kind,
            language: locale.value,
            ...(form.start === 'structure' && form.structure ? { structure: form.structure } : {}),
          },
        })
    // In place of /projects?new=1, so Back from the new project does not open an empty dialog again.
    await navigateTo(`/p/${project.id}`, { replace: true })
  }
  catch (error) {
    failure.value = errorMessage(error, nuxtApp)
  }
  finally {
    busy.value = false
  }
}

// The title has the focus (spec 5.1): on a desktop as the dialog opens, on a phone once the drawer
// has risen, so the keyboard does not come up halfway through its movement.
const titleInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('titleInput')
function onDrawerMoved(isOpen: boolean) {
  if (isOpen && form.start !== 'demo') titleInput.value?.inputRef?.focus()
}
const drawerEvents = computed(() => (desktop.value ? {} : { animationEnd: onDrawerMoved }))

const modalUi = { content: 'max-w-xl', body: 'space-y-6' }
const drawerUi = {
  content: 'h-[96%]',
  container: 'gap-5 pb-0',
  footer: 'sticky bottom-0 -mx-4 mt-auto border-t border-default bg-(--ui-bg-floating) px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
}
</script>

<template>
  <component
    :is="desktop ? UModal : UDrawer"
    v-model:open="open"
    :title="t('projects.create.title')"
    :description="t('projects.create.description')"
    :ui="desktop ? modalUi : drawerUi"
    v-on="drawerEvents"
  >
    <template #body>
      <form id="new-project" class="space-y-6" @submit.prevent="create">
        <UFormField
          :label="t('projects.create.titleLabel')"
          :help="form.start === 'demo' ? t('projects.create.demoTitleHelp') : t('projects.create.titleHelp')"
          :ui="{ container: 'mt-1.5', label: 'text-sm font-medium text-default', help: 'mt-1.5 text-sm text-muted' }"
        >
          <UInput
            ref="titleInput"
            v-model="form.title"
            :placeholder="t('projects.create.titlePlaceholder')"
            :disabled="form.start === 'demo'"
            :autofocus="desktop"
            maxlength="200"
            autocomplete="off"
            enterkeyhint="done"
            size="lg"
            class="w-full"
            :ui="{ base: 'voice-author min-h-11 text-base sm:min-h-9' }"
          />
        </UFormField>

        <URadioGroup
          v-model="form.kind"
          :legend="t('projects.create.kind')"
          :items="kindItems"
          variant="card"
          :orientation="desktop ? 'horizontal' : 'vertical'"
          :ui="{ legend: 'mb-1.5 text-sm font-medium text-default', fieldset: 'gap-2', item: 'flex-1 basis-0 rounded-[calc(var(--ui-radius)*2)]', label: 'text-sm', description: 'text-sm' }"
        >
          <template #label="{ item }">
            <span class="flex items-center gap-1.5">
              <UIcon :name="item.icon" class="size-4 text-toned" />
              {{ item.label }}
            </span>
          </template>
        </URadioGroup>

        <div>
          <URadioGroup
            v-model="form.start"
            :legend="t('projects.create.start')"
            :items="startItems"
            variant="table"
            :ui="{ legend: 'mb-1.5 text-sm font-medium text-default', item: 'first-of-type:rounded-t-[calc(var(--ui-radius)*2)] last-of-type:rounded-b-[calc(var(--ui-radius)*2)]', label: 'text-sm', description: 'text-sm' }"
          />

          <div v-if="form.start === 'structure'" ref="structureList" class="mt-5 scroll-mb-4">
            <URadioGroup
              v-model="form.structure"
              :legend="t('projects.create.structure')"
              :items="structureItems"
              :ui="{ legend: 'mb-1.5 text-sm font-medium text-default', fieldset: 'gap-y-2.5', label: 'text-sm', description: 'mt-1 text-sm text-pretty' }"
            >
              <template #label="{ item }">
                <!-- The shape after a comma, as an epithet in a row: one name for assistive technology too. -->
                <span class="font-medium text-highlighted">{{ item.label }}</span><span class="font-normal text-muted">, {{ item.shape }}</span>
              </template>
            </URadioGroup>
          </div>
        </div>
      </form>
    </template>

    <template #footer>
      <div class="flex w-full flex-col gap-3">
        <p v-if="failure" role="alert" class="flex items-start gap-1.5 text-sm text-error">
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
          {{ failure }}
        </p>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('common.actions.cancel')" color="neutral" variant="ghost" class="min-h-11 sm:min-h-8" @click="open = false" />
          <UButton
            type="submit"
            form="new-project"
            :label="t('common.actions.create')"
            color="primary"
            variant="solid"
            :loading="busy"
            class="min-h-11 min-w-24 justify-center sm:min-h-8"
          />
        </div>
      </div>
    </template>
  </component>
</template>
