<script setup lang="ts">
import { emptyDoc, mentionId } from '#shared/utils/richtext'
import type { EditorMentionMenuItem, EditorToolbarItem } from '@nuxt/ui'
import type { MentionOptions } from '@tiptap/extension-mention'
import type { RichDoc } from '#shared/types/domain'

/**
 * The rich text field used across the workspace (descriptions, premise, notes, profile answers).
 * Writes TipTap JSON. Type @ to mention a character, group, place or object of the open project.
 * The scene editor is a separate, richer component built on the same pieces.
 */
const props = withDefaults(defineProps<{
  modelValue: RichDoc | null | undefined
  placeholder?: string
  /** Offer @ mentions of the project's world entities. */
  mentions?: boolean
  /** Show the formatting toolbar when text is selected. */
  toolbar?: boolean
  readonly?: boolean
  autofocus?: boolean
  /** Typographic scale of the text. */
  size?: 'sm' | 'md' | 'lg'
  /** Manuscript typeface (serif) instead of the interface one. */
  prose?: boolean
  /** Accessible name of the editing area (the field's label). */
  ariaLabel?: string
}>(), {
  ariaLabel: undefined,
  placeholder: '',
  mentions: true,
  toolbar: true,
  readonly: false,
  autofocus: false,
  size: 'md',
  prose: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: RichDoc]
  'blur': []
}>()

const { t } = useI18n()
const store = useProjectStore()
const { label } = useEnums()

const value = computed<RichDoc>({
  get: () => props.modelValue ?? emptyDoc(),
  set: doc => emit('update:modelValue', doc),
})

const extensions = [DialogueLine, SceneBreak]

const ICONS = { character: 'i-lucide-user-round', group: 'i-lucide-users-round', location: 'i-lucide-map-pin', object: 'i-lucide-gem' } as const

const mentionItems = computed<EditorMentionMenuItem[]>(() => {
  if (!props.mentions || !store.project) return []
  return store.worldEntities.map(entity => ({
    id: mentionId(entity.type, entity.id),
    label: entity.name,
    description: label('refType', entity.type),
    ...(entity.imageId ? { avatar: { src: mediaUrl(entity.imageId), alt: entity.name } } : { icon: ICONS[entity.type] }),
  }))
})

const toolbarItems = computed<EditorToolbarItem[][]>(() => [[
  { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: t('common.format.bold') } },
  { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: t('common.format.italic') } },
  { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', tooltip: { text: t('common.format.underline') } },
  { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', tooltip: { text: t('common.format.strike') } },
], [
  { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: t('common.format.bulletList') } },
  { kind: 'blockquote', icon: 'i-lucide-text-quote', tooltip: { text: t('common.format.quote') } },
]])

// Compact fields: no side padding, tighter rhythm than the editor's long-form defaults.
const editorUi = computed(() => ({
  base: props.prose ? 'sm:px-0 *:my-3 [&_p]:leading-[1.6]' : 'sm:px-0 *:my-2 [&_p]:leading-normal',
}))

const mentionOptions: Partial<Omit<MentionOptions, 'suggestion' | 'suggestions'>> = {
  HTMLAttributes: { class: 'mention' },
  renderText: ({ node }) => String(node.attrs.label ?? ''),
  renderHTML: ({ node }) => [
    'span',
    { 'class': 'mention', 'data-ref': node.attrs.id, 'data-type': String(node.attrs.id ?? '').split(':')[0] },
    String(node.attrs.label ?? ''),
  ],
}
</script>

<template>
  <UEditor
    v-slot="{ editor }"
    v-model="value"
    content-type="json"
    :editable="!readonly"
    :autofocus="autofocus"
    :placeholder="placeholder"
    :extensions="extensions"
    :mention="mentions ? mentionOptions : false"
    :image="false"
    class="d-rich-text w-full"
    :class="[`d-rich-text--${size}`, prose ? 'd-rich-text--prose' : '']"
    :ui="editorUi"
    :editor-props="{ attributes: { 'role': 'textbox', 'aria-multiline': 'true', ...(ariaLabel || placeholder ? { 'aria-label': ariaLabel || placeholder } : {}) } }"
    @blur="emit('blur')"
  >
    <UEditorToolbar v-if="toolbar && !readonly" :editor="editor" :items="toolbarItems" layout="bubble" />
    <UEditorMentionMenu v-if="mentions && !readonly && mentionItems.length" :editor="editor" :items="mentionItems" />
  </UEditor>
</template>
