<script setup lang="ts">
import { NuxtLink } from '#components'
import type { ProjectSummary } from '#shared/types/entities'
import type { ProjectAction } from './Menu.vue'

/**
 * One project in the list (DESIGN.md "Rows, not cards"): the type's square, the title in the
 * author's voice with the subtitle as epithet, the leader, words and the last edit, then the type and
 * the path stage. The whole row opens the project; the menu sits beside it (a drawer on a phone).
 * Below 40rem the numbers move under the title, and the title wraps instead of being cut, so a copy
 * and its original stay told apart. Deleted projects offer restore and delete forever instead.
 */
const props = defineProps<{
  project: ProjectSummary
  /** "12.480 parole". */
  words: string
  /** The line under the title after the type: the path stage. */
  meta?: string
  renaming?: boolean
  /** Something is being made from the project (a copy, its backup): the menu waits and says so. */
  busy?: 'duplicating' | 'downloading' | null
}>()

const emit = defineEmits<{
  'rename': []
  'commit-rename': [title: string]
  'cancel-rename': []
  'remove': []
  'restore': []
  'purge': []
  'duplicate': []
  'backup': []
}>()

const { t } = useI18n()
const { label } = useEnums()
const { date, time } = useFormat()

const deleted = computed(() => !!props.project.deletedAt)
const typeIcon = computed(() => (props.project.kind === 'game' ? 'i-lucide-gamepad-2' : 'i-lucide-book-open'))
const menuLabel = computed(() => t('projects.row.menu', { title: props.project.title }))

/** "oggi, 22:14", "ieri, 22:14", "12 ott", "12 ott 2025"; for an opening or a deletion, with its verb. */
function when(iso: string, moment: 'edited' | 'opened' | 'deleted'): string {
  const then = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (localDay(then) === localDay(today)) return t(`projects.row.${moment}.today`, { time: time(then) })
  if (localDay(then) === localDay(yesterday)) return t(`projects.row.${moment}.yesterday`, { time: time(then) })
  const day = date(then, { day: 'numeric', month: 'short', year: then.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
  return t(`projects.row.${moment}.date`, { date: day })
}

/**
 * The last edit (spec 4.1). Opening a project moves its updatedAt as well, so when the two match the
 * last thing that happened is an opening, and the row says that instead of passing it off as an edit.
 */
const activity = computed(() => {
  const { openedAt, updatedAt } = props.project
  if (openedAt && Math.abs(Date.parse(updatedAt) - Date.parse(openedAt)) < 1000) return { label: '', text: when(openedAt, 'opened') }
  return { label: t('projects.row.edited.label'), text: when(updatedAt, 'edited') }
})
const detail = computed(() => (props.project.deletedAt ? when(props.project.deletedAt, 'deleted') : props.meta))

/** Set when "Rinomina" is chosen: the title field keeps the focus the closing menu would give back to its button. */
let focusTitle = false

const groups = computed<ProjectAction[][]>(() => deleted.value
  ? [
      [{ key: 'restore', label: t('common.actions.restore'), icon: 'i-lucide-undo-2', onSelect: () => emit('restore') }],
      [{ key: 'purge', label: t('projects.row.purge'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('purge') }],
    ]
  : [
      [
        { key: 'open', label: t('common.actions.open'), icon: 'i-lucide-arrow-right', to: `/p/${props.project.id}` },
        { key: 'rename', label: t('common.actions.rename'), icon: 'i-lucide-pencil', onSelect: () => { focusTitle = true; emit('rename') } },
        { key: 'duplicate', label: t('common.actions.duplicate'), icon: 'i-lucide-copy', onSelect: () => emit('duplicate') },
        { key: 'backup', label: t('projects.row.backup'), icon: 'i-lucide-download', onSelect: () => emit('backup') },
      ],
      [{ key: 'delete', label: t('common.actions.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('remove') }],
    ])

// Renaming happens in place: Enter or leaving the field keeps the new title, Esc or an empty field
// keeps the old one. A plain field rather than DInlineText, whose value follows every keystroke, so
// its Esc would keep what was typed.
const row = useTemplateRef<HTMLElement>('row')
const field = useTemplateRef<HTMLInputElement>('field')
const draft = ref('')
let finished = false

function focusField() {
  field.value?.focus()
  field.value?.select()
}

function onMenuClose(event: Event) {
  if (!focusTitle) return
  event.preventDefault()
  focusTitle = false
  focusField()
}

watch(() => props.renaming, async (renaming) => {
  if (!renaming) return
  finished = false
  draft.value = props.project.title
  await nextTick()
  focusField()
}, { immediate: true })

/** Ends the renaming. From the keyboard the focus goes back to the row, so the author keeps their place. */
async function finish(keep: boolean, fromKeyboard: boolean) {
  if (!props.renaming || finished) return
  finished = true
  const title = draft.value.trim()
  if (keep && title && title !== props.project.title) emit('commit-rename', title)
  else emit('cancel-rename')
  if (!fromKeyboard) return
  await nextTick()
  row.value?.querySelector<HTMLElement>(':scope > a')?.focus()
}

function onFieldKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault()
    void finish(event.key === 'Enter', true)
  }
}
</script>

<template>
  <li ref="row" class="group relative flex items-center gap-1 rounded-[calc(var(--ui-radius)*2)] transition-colors duration-150 hover:bg-elevated has-focus-visible:bg-elevated">
    <component
      :is="deleted || renaming ? 'div' : NuxtLink"
      :to="deleted || renaming ? undefined : `/p/${project.id}`"
      class="flex min-w-0 flex-1 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] py-2 ps-2 outline-offset-0 max-sm:items-start"
    >
      <DEntityAvatar :name="label('projectKind', project.kind)" :icon="typeIcon" shape="square" size="sm" aria-hidden="true" />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="flex min-w-0 items-baseline gap-3">
          <input
            v-if="renaming"
            ref="field"
            v-model="draft"
            type="text"
            maxlength="200"
            enterkeyhint="done"
            autocomplete="off"
            :aria-label="t('projects.row.titleLabel')"
            class="voice-author -mx-1 w-full min-w-0 rounded-[calc(var(--ui-radius)*1.5)] bg-transparent px-1 font-semibold text-highlighted outline-none hover:bg-elevated/60 focus-visible:bg-elevated focus-visible:ring-2 focus-visible:ring-(--ui-primary)/40 max-sm:text-base"
            @keydown="onFieldKeydown"
            @blur="finish(true, false)"
          >
          <!-- Wide: one line, cut at the end. Phone: the title wraps, the subtitle has a line of its own. -->
          <span v-else class="min-w-0 max-sm:flex max-sm:flex-col sm:truncate">
            <span class="voice-author font-semibold max-sm:line-clamp-3 max-sm:wrap-break-word" :class="deleted ? 'text-muted' : 'text-highlighted'">{{ project.title }}</span>
            <span v-if="project.subtitle" class="voice-author italic text-muted max-sm:line-clamp-2"><span class="max-sm:hidden">, </span>{{ project.subtitle }}</span>
          </span>
          <template v-if="!renaming">
            <DLeader class="hidden sm:block" />
            <span class="hidden shrink-0 items-baseline gap-3 text-sm text-muted sm:flex">
              <span>{{ words }}</span>
              <span v-if="!deleted"><span v-if="activity.label" class="sr-only">{{ activity.label }}: </span>{{ activity.text }}</span>
            </span>
          </template>
        </span>
        <!-- Wide: the type and the stage. Phone: the type with the numbers, then the stage on its own line. -->
        <span class="facts mt-0.5 text-sm text-muted">
          <span>{{ label('projectKind', project.kind) }}</span>
          <span class="sm:hidden">{{ words }}</span>
          <span v-if="!deleted" class="sm:hidden"><span v-if="activity.label" class="sr-only">{{ activity.label }}: </span>{{ activity.text }}</span>
          <span v-if="detail" class="hidden min-w-0 sm:inline">{{ detail }}</span>
        </span>
        <span v-if="detail" class="mt-0.5 text-sm text-muted sm:hidden">{{ detail }}</span>
      </span>
    </component>

    <UButton
      v-if="deleted"
      :label="t('common.actions.restore')"
      icon="i-lucide-undo-2"
      color="neutral"
      variant="outline"
      size="sm"
      class="ms-2 hidden min-h-8 sm:inline-flex"
      @click="emit('restore')"
    />
    <ProjectsMenu :groups="groups" :title="menuLabel" tooltip :disabled="!!busy" @close-auto-focus="onMenuClose">
      <UButton
        icon="i-lucide-ellipsis-vertical"
        color="neutral"
        variant="ghost"
        :loading="!!busy"
        class="me-1 size-11 shrink-0 justify-center lg:size-9"
        :aria-label="busy ? t(`projects.row.${busy}`) : menuLabel"
      />
    </ProjectsMenu>
  </li>
</template>

<style scoped>
/*
 * Facts on one line with a middle dot between them. When the line wraps on a phone, the dot that
 * would hang at the start of the new line sits outside the box and is cut off.
 */
.facts {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  min-width: 0;
  overflow: hidden;
}
.facts > * {
  margin-inline-start: -1rem;
  padding-inline-end: 1rem;
}
.facts > *::before {
  content: '·';
  content: '·' / '';
  display: inline-block;
  width: 1rem;
  text-align: center;
}
</style>
