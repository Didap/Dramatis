<script setup lang="ts">
/**
 * A short guide to a craft concept (premise, fabula, point of view...), from guide.json.
 * Open by default for newcomers; once closed it stays closed on this device.
 */
const props = withDefaults(defineProps<{ topic: string, defaultOpen?: boolean }>(), { defaultOpen: true })

const { t, tm, rt, te } = useI18n()
const key = `dramatis:guide:${props.topic}`
const open = ref(props.defaultOpen)

onMounted(() => {
  try {
    const saved = localStorage.getItem(key)
    if (saved !== null) open.value = saved === '1'
  }
  catch {}
})
watch(open, (value) => {
  try { localStorage.setItem(key, value ? '1' : '0') }
  catch {}
})

const questions = computed(() => {
  const raw = tm(`guide.${props.topic}.questions`) as Record<string, unknown> | undefined
  return raw ? Object.values(raw).map(v => rt(v as never)) : []
})
const exists = computed(() => te(`guide.${props.topic}.title`))
</script>

<template>
  <UCollapsible v-if="exists" v-model:open="open" class="d-guide">
    <UButton
      color="neutral"
      variant="link"
      size="sm"
      :icon="open ? 'i-lucide-chevron-down' : 'i-lucide-lightbulb'"
      :label="open ? t('common.guide.hide') : t('common.guide.show', { topic: t(`guide.${topic}.title`) })"
      class="px-0"
    />
    <template #content>
      <div class="mt-2 max-w-prose space-y-3 rounded-lg bg-muted px-4 py-3.5 text-sm text-toned">
        <p class="text-default">{{ t(`guide.${topic}.what`) }}</p>
        <ul v-if="questions.length" class="list-disc space-y-1 ps-5">
          <li v-for="(q, i) in questions" :key="i">{{ q }}</li>
        </ul>
        <p v-if="te(`guide.${topic}.example`)" class="italic text-muted">{{ t(`guide.${topic}.example`) }}</p>
      </div>
    </template>
  </UCollapsible>
</template>
