<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { CharacterPower } from '#shared/types/domain'
import type { Character } from '#shared/types/entities'
import { useCharacterSaves } from './saving'

/**
 * "Ha dei poteri?" (spec 4.4): no by default; a yes opens the list of the character's powers, each a
 * name and what it does. Type a name and Enter adds one; each edits in place; its menu moves or
 * removes it (with an undo toast). Back to no, the list is hidden but kept, and a yes brings it back.
 */
const props = defineProps<{ character: Character }>()

const { t } = useI18n()
const toast = useToast()
const { save } = useCharacterSaves()
const uid = useId()

const MAX_ITEMS = 40
const powers = computed(() => props.character.powers ?? [])
const answers = computed(() => [
  { value: 'yes', label: t('characters.powers.yes') },
  { value: 'no', label: t('characters.powers.no') },
])

const draft = ref('')
const announcement = ref('')
const root = useTemplateRef<HTMLElement>('root')

function savePowers(next: CharacterPower[], delay = 0) {
  save('characters', props.character.id, { powers: next }, delay)
}

function setHas(value: boolean) {
  save('characters', props.character.id, { hasPowers: value }, 0)
}

const field = (selector: string) => () => root.value?.querySelector<HTMLElement>(selector)
function focusLater(target: () => HTMLElement | null | undefined) {
  void nextTick(() => setTimeout(() => target()?.focus(), 0))
}

/** A new power goes on to its description, ready for what it does. */
function add() {
  const name = draft.value.trim().slice(0, 100)
  if (!name || powers.value.length >= MAX_ITEMS) return
  const power = { id: crypto.randomUUID(), name, description: '' }
  savePowers([...powers.value, power])
  draft.value = ''
  focusLater(field(`[data-power-description="${power.id}"] textarea`))
}

function edit(index: number, patch: Partial<CharacterPower>) {
  savePowers(powers.value.map((power, i) => (i === index ? { ...power, ...patch } : power)), 1000)
}

function move(index: number, delta: number) {
  const to = index + delta
  if (to < 0 || to >= powers.value.length) return
  const next = [...powers.value]
  next.splice(to, 0, next.splice(index, 1)[0]!)
  savePowers(next)
  announcement.value = t('characters.powers.moved', { name: next[to]!.name, n: to + 1, total: next.length })
}

function remove(index: number) {
  const removed = powers.value[index]
  if (!removed) return
  savePowers(powers.value.filter((_, i) => i !== index))
  const after = powers.value[index + 1] ?? powers.value[index - 1]
  focusLater(after ? field(`[data-power-name="${after.id}"] textarea`) : field('[data-power-add] input'))
  toast.add({
    title: t('characters.powers.removed', { name: removed.name || t('characters.powers.untitled') }),
    icon: 'i-lucide-trash-2',
    actions: [{
      label: t('common.actions.undo'),
      onClick: () => {
        const now = [...(props.character.powers ?? [])]
        now.splice(Math.min(index, now.length), 0, removed)
        savePowers(now)
      },
    }],
  })
}

function menuOf(index: number, name: string): DropdownMenuItem[][] {
  return [
    [
      { label: t('common.actions.moveUp'), icon: 'i-lucide-arrow-up', disabled: index === 0, onSelect: () => move(index, -1) },
      { label: t('common.actions.moveDown'), icon: 'i-lucide-arrow-down', disabled: index === powers.value.length - 1, onSelect: () => move(index, 1) },
    ],
    [{ label: t('characters.powers.remove', { name: name || t('characters.powers.untitled') }), icon: 'i-lucide-x', onSelect: () => remove(index) }],
  ]
}
</script>

<template>
  <CharactersSection :title="t('characters.powers.title')">
    <div ref="root">
      <URadioGroup
        :model-value="character.hasPowers ? 'yes' : 'no'"
        :legend="t('characters.powers.question')"
        :items="answers"
        value-key="value"
        orientation="horizontal"
        :ui="{ legend: 'mb-1.5 text-sm font-medium text-toned', fieldset: 'gap-x-6', item: 'pointer-coarse:min-h-11 pointer-coarse:items-center' }"
        @update:model-value="(value) => setHas(value === 'yes')"
      />
      <p v-if="!character.hasPowers && powers.length" class="mt-3 flex items-start gap-2 text-sm text-muted">
        <UIcon name="i-lucide-archive" class="mt-0.5 size-4 shrink-0" />
        {{ t('characters.powers.kept', { n: powers.length }, powers.length) }}
      </p>

      <div v-if="character.hasPowers" class="mt-4">
        <ol v-if="powers.length" :aria-label="t('characters.powers.list')" class="-mx-1 divide-y divide-default/70">
          <li v-for="(power, index) in powers" :key="power.id" class="group/power flex items-start gap-1 px-1 py-2">
            <div class="min-w-0 flex-1">
              <div :data-power-name="power.id">
                <DInlineText
                  :model-value="power.name"
                  :placeholder="t('characters.powers.namePlaceholder')"
                  :aria-label="t('characters.powers.nameLabel', { n: index + 1 })"
                  :maxlength="100"
                  multiline
                  class="voice-author font-semibold"
                  @update:model-value="(name: string) => edit(index, { name })"
                />
              </div>
              <div :data-power-description="power.id">
                <DInlineText
                  :model-value="power.description"
                  :placeholder="t('characters.powers.descriptionPlaceholder')"
                  :aria-label="t('characters.powers.descriptionLabel', { name: power.name || t('characters.powers.untitled') })"
                  :maxlength="2000"
                  multiline
                  class="voice-author"
                  @update:model-value="(description: string) => edit(index, { description })"
                />
              </div>
            </div>
            <UDropdownMenu :items="menuOf(index, power.name)" :content="{ align: 'end' }">
              <UButton
                icon="i-lucide-ellipsis"
                size="xs"
                color="neutral"
                variant="ghost"
                class="mt-0.5 justify-center opacity-0 group-hover/power:opacity-100 group-focus-within/power:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:mt-0 pointer-coarse:size-11 pointer-coarse:opacity-100"
                :aria-label="t('characters.powers.actions', { name: power.name || t('characters.powers.untitled') })"
              />
            </UDropdownMenu>
          </li>
        </ol>
        <form class="mt-1" data-power-add @submit.prevent="add">
          <UInput
            v-model="draft"
            :placeholder="t('characters.powers.add')"
            :aria-label="t('characters.powers.add')"
            :aria-describedby="`${uid}-help`"
            :maxlength="100"
            :disabled="powers.length >= MAX_ITEMS"
            icon="i-lucide-plus"
            variant="ghost"
            class="-mx-1 w-[calc(100%+0.5rem)]"
            :ui="{ base: 'voice-author text-base placeholder:font-sans placeholder:text-sm md:text-[0.9375rem] pointer-coarse:min-h-11' }"
          />
          <p :id="`${uid}-help`" class="sr-only">{{ t('characters.powers.addHelp') }}</p>
        </form>
      </div>
      <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
    </div>
  </CharactersSection>
</template>
