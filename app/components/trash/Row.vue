<script lang="ts">
/** How a row names what it holds, in the right voice (DESIGN.md "The two-voice rule"). */
export interface TrashDisplay {
  /** The author's words (a title, a name), the app's (a placeholder), or a state variable (mono). */
  name: string
  voice: 'author' | 'ui' | 'mono'
  /** A phrase of the app's holding the name, as an i18n key with a {name} slot ("Immagine di {name}"). */
  frame?: string
  /** The author's words after the name, in italic: a relationship's label, an image's caption. */
  epithet?: string
  /** What it joined or where it was, in the app's words ("da «Il molo» a «La barca»"). */
  context?: string
  /** All of it in plain words, for buttons, confirmations and toasts. */
  label: string
}
</script>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { TrashItem } from '~~/server/api/projects/[projectId]/trash/index.get'

/**
 * One thing in the trash with what left together with it ("con 4 scene"), when it left, and the two
 * ways out: back to its place, or gone for good after an inline confirmation that says what else
 * goes (the choices of other scenes that lead to a scene). On a phone the actions sit in the row menu.
 */
const props = defineProps<{
  item: TrashItem
  /** What was trashed in the same batch and comes back with it. */
  members: TrashItem[]
  display: TrashDisplay
  icon: string
  busy?: boolean
  /** Choices of other scenes that lead to a scene of the batch: deleting for good deletes them too. */
  incoming?: number
}>()
const emit = defineEmits<{ restore: [], purge: [] }>()

const { t } = useI18n()
const { number, relative, time, date, localeTag } = useFormat()

const confirming = ref(false)
const cancelRef = useTemplateRef<{ $el: HTMLElement }>('cancel')
const askRef = useTemplateRef<{ $el: HTMLElement }>('ask')
const menuRef = useTemplateRef<{ $el: HTMLElement }>('menuButton')
// The confirmation takes the focus (on the safe choice) and gives it back when it closes.
watch(confirming, async (open) => {
  await nextTick()
  if (open) return cancelRef.value?.$el?.focus()
  const ask = askRef.value?.$el
  ;(ask?.offsetParent ? ask : menuRef.value?.$el)?.focus()
})

const UNIT: Record<string, string> = {
  chapters: 'trash.units.chapters',
  scenes: 'trash.units.scenes',
  images: 'trash.units.images',
  codexEntries: 'trash.units.entries',
}
/** "con 2 capitoli e 6 scene". */
const company = computed(() => {
  const counts = new Map<string, number>()
  for (const member of props.members) counts.set(member.collection, (counts.get(member.collection) ?? 0) + 1)
  const phrases = [...counts].filter(([c]) => UNIT[c]).map(([c, n]) => t(UNIT[c]!, { n: number(n) }, n))
  if (!phrases.length) return ''
  return t('trash.with', { list: new Intl.ListFormat(localeTag.value, { type: 'conjunction' }).format(phrases) })
})

/** Where it was: the chapter of a scene, the scene of a revision, the category of an entry. */
const place = computed(() => {
  const parent = props.item.parent
  if (!parent || props.item.withParent || !parent.title) return ''
  return props.item.collection === 'revisions' ? t('trash.ofScene', { name: parent.title }) : t('trash.inside', { name: parent.title })
})

const details = computed(() => [props.display.context, place.value, company.value].filter(Boolean).join(', '))

const nameClass = computed(() => ({
  author: 'voice-author font-semibold text-highlighted',
  ui: 'font-medium text-highlighted',
  mono: 'font-mono text-sm text-highlighted',
}[props.display.voice]))

const when = computed(() => {
  const at = props.item.deletedAt
  const age = Date.now() - new Date(at).getTime()
  return age >= 86_400_000 && age < 7 * 86_400_000 ? `${relative(at)}, ${time(at)}` : relative(at)
})
const exact = computed(() => date(props.item.deletedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }))

/** The question, with everything that goes with it. */
const ask = computed(() => {
  const name = props.display.label
  const n = props.incoming ?? 0
  if (company.value && n) return t('trash.purgeAskWithChoices', { name, with: company.value, n: number(n) }, n)
  if (company.value) return t('trash.purgeAskWith', { name, with: company.value })
  if (n) return t('trash.purgeAskChoices', { name, n: number(n) }, n)
  return t('trash.purgeAsk', { name })
})

const menu = computed<DropdownMenuItem[]>(() => [
  { label: t('trash.restore'), icon: 'i-lucide-rotate-ccw', onSelect: () => emit('restore') },
  { label: t('trash.purge'), icon: 'i-lucide-trash', color: 'error', onSelect: () => { confirming.value = true } },
])

function purge() {
  confirming.value = false
  emit('purge')
}
</script>

<template>
  <li class="trash-row">
    <div class="group flex min-h-11 items-center gap-3 rounded-[calc(var(--ui-radius)*2)] px-2 py-1.5 hover:bg-elevated">
      <DEntityAvatar :name="display.label" :icon="icon" shape="square" size="sm" />
      <!-- On a phone the name may take two lines, and what it joined goes under it with the time. -->
      <div class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
        <p class="min-w-0 truncate max-sm:line-clamp-2 max-sm:whitespace-normal">
          <i18n-t v-if="display.frame" :keypath="display.frame" scope="global" tag="span" class="text-default">
            <template #name><span :class="nameClass">{{ display.name }}</span></template>
          </i18n-t>
          <span v-else :class="nameClass">{{ display.name }}</span>
          <span v-if="display.epithet" class="voice-author text-muted italic">, {{ display.epithet }}</span>
          <span v-if="details" class="hidden text-sm text-muted sm:inline">, {{ details }}</span>
        </p>
        <DLeader class="hidden sm:block" />
        <p class="min-w-0 text-sm text-pretty text-muted sm:shrink-0">
          <span v-if="details" class="sm:hidden">{{ details }} · </span>
          <UTooltip :text="exact">
            <span class="whitespace-nowrap">{{ when }}</span>
          </UTooltip>
        </p>
      </div>

      <div v-if="!confirming" class="flex shrink-0 items-center gap-1">
        <UButton
          class="hidden max-lg:min-h-11 sm:inline-flex"
          icon="i-lucide-rotate-ccw"
          :label="t('trash.restore')"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="busy"
          :aria-label="t('trash.restoreItem', { name: display.label })"
          @click="emit('restore')"
        />
        <UButton
          ref="ask"
          class="hidden justify-center max-lg:min-h-11 max-lg:min-w-11 sm:inline-flex"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('trash.purgeItem', { name: display.label })"
          @click="confirming = true"
        />
        <UDropdownMenu :items="menu" :content="{ align: 'end' }">
          <UButton
            ref="menuButton"
            class="min-h-11 min-w-11 justify-center sm:hidden"
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            :loading="busy"
            :aria-label="t('trash.actionsFor', { name: display.label })"
          />
        </UDropdownMenu>
      </div>
    </div>

    <!-- Deleting for good asks once, here in the row. -->
    <div
      v-if="confirming"
      class="mx-2 mb-2 flex flex-col gap-2 rounded-[calc(var(--ui-radius)*2)] border border-error/40 px-3 py-2.5 sm:flex-row sm:items-center"
      role="group"
      :aria-label="t('trash.purge')"
      @keydown.esc="confirming = false"
    >
      <p class="flex-1 text-sm text-pretty text-default">{{ ask }}</p>
      <div class="flex shrink-0 gap-2">
        <UButton ref="cancel" :label="t('common.actions.cancel')" color="neutral" variant="ghost" size="sm" class="max-lg:min-h-11" @click="confirming = false" />
        <UButton :label="t('trash.purgeConfirm')" color="error" variant="solid" size="sm" class="max-lg:min-h-11" @click="purge" />
      </div>
    </div>
  </li>
</template>
