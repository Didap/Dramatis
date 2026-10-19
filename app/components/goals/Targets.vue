<script setup lang="ts">
/**
 * The three targets of the work (spec 4.2), each optional: words in all, words a day, a deadline.
 * Saved as they change; an empty field means no target.
 */
const store = useProjectStore()
const { t } = useI18n()
const { localeTag } = useFormat()

const total = computed<number | null>({
  get: () => store.project?.wordGoal || null,
  set: value => store.updateProjectSoon({ wordGoal: value && value > 0 ? Math.round(value) : null }),
})
const daily = computed<number | null>({
  get: () => store.project?.dailyWordGoal || null,
  set: value => store.updateProjectSoon({ dailyWordGoal: value && value > 0 ? Math.round(value) : null }),
})
const deadline = computed<string>({
  get: () => store.project?.deadline ?? '',
  set: (value) => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
    void store.updateProject({ deadline: day }).catch(() => {})
  },
})
const today = localDay()
</script>

<template>
  <div class="goals-targets grid gap-x-6 gap-y-4 sm:grid-cols-3">
    <UFormField :label="t('goals.targets.total')" :help="t('goals.targets.totalHelp')" name="wordGoal">
      <UInputNumber
        v-model="total"
        :min="0"
        :max="10000000"
        :step="1000"
        :step-snapping="false"
        :locale="localeTag"
        :placeholder="t('goals.targets.none')"
        class="w-full"
      />
    </UFormField>
    <UFormField :label="t('goals.targets.daily')" :help="t('goals.targets.dailyHelp')" name="dailyWordGoal">
      <UInputNumber
        v-model="daily"
        :min="0"
        :max="1000000"
        :step="100"
        :step-snapping="false"
        :locale="localeTag"
        :placeholder="t('goals.targets.none')"
        class="w-full"
      />
    </UFormField>
    <UFormField :label="t('goals.targets.deadline')" :help="t('goals.targets.deadlineHelp')" name="deadline">
      <UInput v-model="deadline" type="date" :min="today" class="w-full" :ui="{ trailing: 'pe-1' }">
        <template v-if="deadline" #trailing>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="link"
            size="sm"
            :aria-label="t('goals.targets.clearDeadline')"
            @click="deadline = ''"
          />
        </template>
      </UInput>
    </UFormField>
  </div>
</template>
