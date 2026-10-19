<script setup lang="ts">
import type { ProjectKind, ProjectModule, ProjectSettings } from '#shared/types/domain'
import type { Project } from '#shared/types/entities'
import { DIALOGUE_STYLES, PROJECT_KINDS, PROJECT_MODULES } from '#shared/utils/constants'

/**
 * Project settings (spec 4.6): what the project is and how it behaves. General, type and modules,
 * writing, structure, guidance, and moving the project to the deleted ones. Every change is saved
 * as it is made, except the type, which says first what changes; hiding something (a module, the
 * parts, the type) never deletes its data.
 */
const store = useProjectStore()
const { t, locale } = useI18n()
const { term } = useTerms()
const { label } = useEnums()
const toast = useToast()

const project = computed(() => store.project!)
const settings = computed<ProjectSettings>(() => project.value.settings ?? {})

/*
 * Switches and choices are applied at once and sent together a moment later: quick successive
 * changes travel as one request, so they can never reach the server out of order.
 */
function saveSettings(patch: ProjectSettings) {
  store.updateProjectSoon({ settings: { ...settings.value, ...patch } }, 300)
}
function saveSoon(patch: Partial<Project>) {
  store.updateProjectSoon(patch)
}

// ---------------------------------------------------------------- general

// The title is required: an emptied field goes back to the last title when it loses focus.
const title = ref(project.value.title)
watch(() => project.value.title, (value) => {
  if (value !== title.value && document.activeElement?.id !== 'settings-title') title.value = value
})
function onTitle(value: string) {
  title.value = value
  if (value.trim()) saveSoon({ title: value })
}
function onTitleBlur() {
  if (!title.value.trim()) title.value = project.value.title
}
const subtitle = computed({ get: () => project.value.subtitle, set: (value: string) => saveSoon({ subtitle: value }) })
const authorName = computed({ get: () => project.value.authorName, set: (value: string) => saveSoon({ authorName: value }) })

const LANGUAGES = ['it', 'en', 'fr', 'es', 'de', 'pt', 'ca', 'nl', 'pl', 'ro', 'el', 'sv']
const languages = computed(() => {
  const names = new Intl.DisplayNames([locale.value], { type: 'language' })
  const codes = LANGUAGES.includes(project.value.language) ? LANGUAGES : [project.value.language, ...LANGUAGES]
  return codes.map((code) => {
    const name = names.of(code) ?? code
    return { value: code, label: name.charAt(0).toLocaleUpperCase(locale.value) + name.slice(1) }
  })
})
const language = computed({
  get: () => project.value.language,
  set: (value: string) => { void store.updateProject({ language: value }).catch(() => {}) },
})

// ---------------------------------------------------------------- type and modules

const kinds = computed(() => PROJECT_KINDS.map(kind => ({
  value: kind,
  label: label('projectKind', kind),
  description: t(`settings.type.${kind}`),
})))

// Picking the other type opens the confirmation below the choice; nothing changes until it is confirmed.
const pendingKind = ref<ProjectKind | null>(null)
const kindBusy = ref(false)
function pickKind(kind: ProjectKind) {
  pendingKind.value = kind === project.value.kind ? null : kind
}
function cancelKind() {
  pendingKind.value = null
  nextTick(() => document.querySelector<HTMLElement>('#settings-kind [role="radio"][data-state="checked"]')?.focus())
}
async function changeKind(modules: Record<ProjectModule, boolean>) {
  const kind = pendingKind.value
  if (!kind) return
  kindBusy.value = true
  try {
    await store.flushProject()
    // Pin the structure as it is: the default for parts follows the type, the chapters must not move.
    const parts = settings.value.parts ?? project.value.kind === 'game'
    await store.updateProject({ kind, modules, settings: { ...settings.value, parts } })
    pendingKind.value = null
    // A codex switched on brings its seven default categories, made by the server.
    if (store.modules.codex) await store.reload()
    toast.add({ title: t(`settings.type.changed.${kind}`), icon: kind === 'game' ? 'i-lucide-gamepad-2' : 'i-lucide-book-open' })
  }
  catch {
    // The store has put everything back and said why.
  }
  finally {
    kindBusy.value = false
  }
}

const MODULE_ICONS: Record<ProjectModule, string> = {
  branching: 'i-lucide-split',
  variables: 'i-lucide-variable',
  quests: 'i-lucide-flag',
  codex: 'i-lucide-library-big',
  script: 'i-lucide-messages-square',
  scene_kinds: 'i-lucide-clapperboard',
  races: 'i-lucide-dna',
}

/** On a phone a switch answers to a 44px square around it (DESIGN.md "Buttons"). */
const SWITCH_UI = { base: 'relative max-lg:after:absolute max-lg:after:-inset-x-1.5 max-lg:after:-inset-y-3.5' }

/**
 * Only the author's own choices are stored, so the rest keep following the type's defaults.
 * State variables live on the branches: switching them on switches the branches on, and switching
 * the branches off switches them off too, with a way back.
 */
function setModule(key: ProjectModule, value: boolean) {
  const explicit = { ...project.value.modules }
  const next = { ...explicit, [key]: value }
  if (key === 'variables' && value) next.branching = true
  const cascade = key === 'branching' && !value && store.modules.variables
  if (cascade) next.variables = false
  store.updateProjectSoon({ modules: next }, 300)
  if (cascade) {
    toast.add({
      title: t('settings.modules.variablesOff'),
      icon: 'i-lucide-variable',
      actions: [{ label: t('common.actions.undo'), onClick: () => store.updateProjectSoon({ modules: { ...project.value.modules, branching: true, variables: true } }, 300) }],
    })
  }
  // Switching the codex on creates its seven default categories on the server: fetch them.
  if (key === 'codex' && value) void store.flushProject().then(() => store.reload())
}

// ---------------------------------------------------------------- writing

const dialogueStyles = computed(() => DIALOGUE_STYLES.map(style => ({
  value: style,
  label: label('dialogueStyle', style),
  description: t(`settings.writing.dialogueSample.${style}`),
})))
const dialogueStyle = computed({
  get: () => settings.value.dialogueStyle ?? (project.value.language.startsWith('it') ? 'guillemets' : 'double_quotes'),
  set: (value: ProjectSettings['dialogueStyle']) => saveSettings({ dialogueStyle: value }),
})
const smartTypography = computed({
  get: () => settings.value.smartTypography ?? true,
  set: (value: boolean) => saveSettings({ smartTypography: value }),
})
const numberings = computed(() => (['arabic', 'roman', 'words', 'none'] as const).map(value => ({
  value,
  label: t(`settings.writing.numbering.${value}`, { chapter: term('chapter') }),
})))
const chapterNumbering = computed({
  get: () => settings.value.chapterNumbering ?? 'arabic',
  set: (value: NonNullable<ProjectSettings['chapterNumbering']>) => saveSettings({ chapterNumbering: value }),
})
const separator = ref(settings.value.sceneSeparator ?? '')
watch(() => settings.value.sceneSeparator, (value) => {
  if ((value ?? '') !== separator.value) separator.value = value ?? ''
})
/** The project's spelling dictionary: the words added from the editor, to take out or add here. */
const dictionary = useSpellcheck({ load: false })
function onDictionary(words: string[]) {
  const before = dictionary.dictionary.value
  for (const word of words) if (!before.includes(word) && /^[\p{L}\p{M}'’-]+$/u.test(word.trim())) void dictionary.addWord(word)
  for (const word of before) if (!words.includes(word)) void dictionary.removeWord(word)
}

let separatorTimer: ReturnType<typeof setTimeout> | null = null
function onSeparator(value: string) {
  separator.value = value
  if (separatorTimer) clearTimeout(separatorTimer)
  separatorTimer = setTimeout(() => saveSettings({ sceneSeparator: value.trim() }), 400)
}

// ---------------------------------------------------------------- structure

const usesParts = computed(() => settings.value.parts ?? project.value.kind === 'game')
const partsBusy = ref(false)
async function setParts(enabled: boolean) {
  partsBusy.value = true
  try {
    await Promise.all([store.flush(), store.flushProject()])
    await $fetch(`/api/projects/${store.projectId}/manuscript/parts`, { method: 'POST', body: { enabled } })
    await store.reload()
    toast.add({ title: t(`settings.structure.${store.kind}.${enabled ? 'on' : 'off'}`), icon: 'i-lucide-check' })
  }
  catch (error) {
    notifyError(error)
  }
  finally {
    partsBusy.value = false
  }
}

// ---------------------------------------------------------------- guidance

const guidance = computed({
  get: () => settings.value.guidance ?? true,
  set: (value: boolean) => saveSettings({ guidance: value }),
})

/** Section links scroll the workspace column (anchors alone would scroll the window). */
const route = useRoute()
function go(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(history.state, '', `#${id}`)
}
onMounted(() => {
  const id = route.hash.slice(1)
  if (id) nextTick(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
})

const sections = computed(() => [
  { id: 'general', label: t('settings.general.title') },
  { id: 'modules', label: t('settings.type.title') },
  { id: 'writing', label: t('settings.writing.title') },
  { id: 'structure', label: t('settings.structure.title') },
  { id: 'guidance', label: t('settings.guidance.title') },
  { id: 'delete', label: t('settings.delete.title') },
])
</script>

<template>
  <DPage :title="term('settings')" width="prose">
    <DPageHeader :title="term('settings')" :description="t('settings.description')" />

    <nav class="-mx-1 mb-10 flex gap-1 overflow-x-auto pb-1" :aria-label="t('settings.sections')">
      <UButton
        v-for="section in sections"
        :key="section.id"
        :href="`#${section.id}`"
        :label="section.label"
        color="neutral"
        variant="ghost"
        size="sm"
        class="shrink-0 max-lg:min-h-11"
        @click.prevent="go(section.id)"
      />
    </nav>

    <div class="space-y-14">
      <SettingsSection id="general" :title="t('settings.general.title')">
        <SettingsField :label="t('settings.general.projectTitle')" for="settings-title" stacked>
          <UInput
            id="settings-title"
            :model-value="title"
            class="w-full"
            :maxlength="200"
            required
            :ui="{ base: 'voice-author text-base' }"
            @update:model-value="(value) => onTitle(String(value ?? ''))"
            @blur="onTitleBlur"
          />
        </SettingsField>
        <SettingsField :label="t('settings.general.subtitle')" :description="t('settings.general.subtitleHelp')" for="settings-subtitle" stacked>
          <UInput id="settings-subtitle" v-model="subtitle" class="w-full" :maxlength="300" :ui="{ base: 'voice-author text-base' }" />
        </SettingsField>
        <SettingsField :label="t('settings.general.author')" :description="t('settings.general.authorHelp')" for="settings-author" stacked>
          <UInput id="settings-author" v-model="authorName" class="w-full" :maxlength="200" autocomplete="name" />
        </SettingsField>
        <SettingsField :label="t('settings.general.language')" :description="t('settings.general.languageHelp')" for="settings-language">
          <USelect id="settings-language" v-model="language" :items="languages" class="w-full" />
        </SettingsField>
      </SettingsSection>

      <SettingsSection id="modules" :title="t('settings.type.title')" :description="t('settings.type.description')">
        <SettingsField :label="t('settings.type.label')" stacked>
          <div class="space-y-4">
            <URadioGroup
              id="settings-kind"
              :model-value="pendingKind ?? project.kind"
              :items="kinds"
              :legend="t('settings.type.label')"
              :disabled="kindBusy"
              :ui="{ legend: 'sr-only', item: 'py-1.5' }"
              @update:model-value="(value) => pickKind(value as ProjectKind)"
            />
            <SettingsKindChange v-if="pendingKind" :target="pendingKind" :busy="kindBusy" @cancel="cancelKind" @confirm="changeKind" />
          </div>
        </SettingsField>
        <div class="pt-4 pb-1">
          <h3 class="text-sm font-medium text-default">{{ t('settings.modules.label') }}</h3>
          <p class="mt-0.5 text-sm text-pretty text-muted">{{ store.isGame ? t('settings.modules.gameHint') : t('settings.modules.novelHint') }}</p>
        </div>
        <SettingsField
          v-for="key in PROJECT_MODULES"
          :key="key"
          :label="label('module', key)"
          :icon="MODULE_ICONS[key]"
          :for="`module-${key}`"
        >
          <template #description>
            {{ t(`settings.modules.${key}`) }}<template v-if="key === 'branching' && store.modules.variables">{{ ' ' }}{{ t('settings.modules.branchingCascade') }}</template>
          </template>
          <USwitch
            :id="`module-${key}`"
            :model-value="store.modules[key]"
            :aria-describedby="`module-${key}-help`"
            :ui="SWITCH_UI"
            @update:model-value="(value: boolean) => setModule(key, value)"
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection id="writing" :title="t('settings.writing.title')" :description="t('settings.writing.description')">
        <SettingsField :label="t('settings.writing.dialogue')" :description="t('settings.writing.dialogueHelp')" stacked>
          <URadioGroup
            v-model="dialogueStyle"
            :items="dialogueStyles"
            :legend="t('settings.writing.dialogue')"
            :ui="{ legend: 'sr-only', item: 'py-1.5', description: 'voice-author text-base text-toned' }"
          />
        </SettingsField>
        <SettingsField :label="t('settings.writing.smart')" :description="t('settings.writing.smartHelp')" for="settings-smart">
          <USwitch id="settings-smart" v-model="smartTypography" aria-describedby="settings-smart-help" :ui="SWITCH_UI" />
        </SettingsField>
        <SettingsField :label="t('settings.writing.numberingLabel', { chapters: term('chapter', 2).toLocaleLowerCase() })" :description="t('settings.writing.numberingHelp')" for="settings-numbering">
          <USelect id="settings-numbering" v-model="chapterNumbering" :items="numberings" class="w-full" />
        </SettingsField>
        <SettingsField :label="t('settings.writing.separator')" :description="t('settings.writing.separatorHelp')" for="settings-separator">
          <UInput
            id="settings-separator"
            :model-value="separator"
            :maxlength="20"
            placeholder="* * *"
            class="w-full"
            :ui="{ base: 'voice-author text-center' }"
            @update:model-value="(value) => onSeparator(String(value ?? ''))"
          />
        </SettingsField>
        <SettingsField :label="t('settings.writing.dictionary')" :description="t('settings.writing.dictionaryHelp')" for="settings-dictionary">
          <UInputTags
            id="settings-dictionary"
            :model-value="dictionary.dictionary.value"
            :placeholder="t('settings.writing.dictionaryPlaceholder')"
            :max-length="60"
            add-on-blur
            add-on-paste
            class="w-full"
            :ui="{ item: 'voice-author font-normal', input: 'min-w-32' }"
            @update:model-value="onDictionary"
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection id="structure" :title="t('settings.structure.title')">
        <SettingsField
          :label="t(`settings.structure.${store.kind}.label`)"
          :description="t(`settings.structure.${store.kind}.${usesParts ? 'helpOn' : 'helpOff'}`)"
          for="settings-parts"
        >
          <USwitch
            id="settings-parts"
            :model-value="usesParts"
            :loading="partsBusy"
            :disabled="partsBusy"
            aria-describedby="settings-parts-help"
            :ui="SWITCH_UI"
            @update:model-value="(value: boolean) => setParts(value)"
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection id="guidance" :title="t('settings.guidance.title')">
        <SettingsField :label="t('settings.guidance.label')" :description="t('settings.guidance.help')" for="settings-guidance">
          <USwitch id="settings-guidance" v-model="guidance" aria-describedby="settings-guidance-help" :ui="SWITCH_UI" />
        </SettingsField>
      </SettingsSection>

      <SettingsSection id="delete" :title="t('settings.delete.title')" :description="t('settings.delete.description')">
        <SettingsDeleteProject :title="project.title" />
      </SettingsSection>
    </div>
  </DPage>
</template>
