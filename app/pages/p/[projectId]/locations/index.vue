<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useCreating } from '~/components/world/CreateRow.vue'
import { useWorldIntro } from '~/components/world/Intro.vue'

/**
 * Maps and places (VRS-598): the author's maps above, each a picture with a pin for a place, and the
 * list of places below, grouped by nation and region when they span several. `?map=<id>` shows that
 * map, `?new=1` opens the inline creation of a place.
 */
const route = useRoute()
const router = useRouter()
const store = useProjectStore()
const { t } = useI18n()
const { term } = useTerms()
const mt = (key: string) => t(`locations.${store.kind}.${key}`)
const desktop = useIsDesktop()
const creating = useCreating()
const { visible: introVisible } = useWorldIntro('locations')
const { upload, uploading } = useMediaUpload()

// ---------------------------------------------------------------- the maps

const mapId = computed({
  get: () => {
    const asked = typeof route.query.map === 'string' ? route.query.map : null
    return store.placeMaps.find(map => map.id === asked)?.id ?? store.placeMaps[0]?.id
  },
  set: (id: string | undefined) => void router.replace({ query: { ...route.query, map: id } }),
})
const map = computed(() => (mapId.value ? store.get('maps', mapId.value) : undefined))
const mapItems = computed(() => store.placeMaps.map(m => ({ value: m.id, label: m.name })))
const placeMap = useTemplateRef<{ addPin: () => void }>('placeMap')

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  let image: string
  try {
    image = (await upload(file, { projectId: store.projectId! })).id
  }
  catch {
    return
  }
  const count = store.placeMaps.length
  const name = count ? t('locations.map.nthName', { n: count + 1 }) : t('locations.map.firstName')
  const created = await store.create('maps', { name, nodes: {}, settings: { image } }).catch(() => null)
  if (created) mapId.value = created.id
}

const mapMenu = computed<DropdownMenuItem[][]>(() => [[
  { label: t('locations.map.another'), icon: 'i-lucide-image-up', onSelect: () => fileInput.value?.click() },
], [
  { label: t('locations.map.trash'), icon: 'i-lucide-trash-2', onSelect: () => { if (map.value) void store.remove('maps', map.value.id).catch(() => {}) } },
]])
</script>

<template>
  <DPage :title="term('placesSection')">
    <DPageHeader :title="term('placesSection')">
      <template v-if="introVisible && store.rows.locations.length" #description>
        <WorldIntro topic="locations" :text="mt('intro')" />
      </template>
      <template v-if="store.rows.locations.length" #actions>
        <UButton
          :color="desktop ? 'primary' : 'neutral'"
          :variant="desktop ? 'solid' : 'outline'"
          icon="i-lucide-plus"
          :label="mt('add')"
          class="max-lg:min-h-11"
          data-world-create
          @click="creating = true"
        />
      </template>
    </DPageHeader>

    <section class="mb-10" :aria-label="t('locations.map.label')">
      <template v-if="map">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <USelect
            v-if="mapItems.length > 1"
            v-model="mapId"
            :items="mapItems"
            value-key="value"
            :aria-label="t('locations.map.choose')"
            class="min-w-48 max-lg:min-h-11"
          />
          <h2 v-else class="voice-author text-lg font-semibold text-highlighted">{{ map.name }}</h2>
          <div class="ms-auto flex items-center gap-2">
            <UButton
              icon="i-lucide-map-pin-plus"
              color="neutral"
              variant="outline"
              :label="t('locations.map.addPin')"
              class="max-lg:min-h-11"
              @click="placeMap?.addPin()"
            />
            <UDropdownMenu :items="mapMenu" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" class="max-lg:size-11 max-lg:justify-center" :aria-label="t('locations.map.more')" :loading="uploading" />
            </UDropdownMenu>
          </div>
        </div>
        <LocationsPlaceMap ref="placeMap" :key="map.id" :map="map" />
      </template>

      <div v-else class="flex flex-col items-start gap-3 rounded-[calc(var(--ui-radius)*2)] border border-dashed border-(--ui-border-accented) px-5 py-6">
        <p class="max-w-prose text-pretty text-sm text-muted">{{ t('locations.map.uploadHint') }}</p>
        <UButton
          icon="i-lucide-image-up"
          color="neutral"
          variant="outline"
          :label="t('locations.map.upload')"
          :loading="uploading"
          class="max-lg:min-h-11"
          @click="fileInput?.click()"
        />
      </div>

      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onFile">
    </section>

    <LocationsList v-model:creating="creating" />
  </DPage>
</template>
