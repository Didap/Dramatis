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

/** The map on show: the one the address names, else the first. */
const map = computed(() => store.placeMaps.find(m => m.id === route.query.map) ?? store.placeMaps[0])
const showMap = (id: string) => void router.replace({ query: { ...route.query, map: id } })
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
  // The first name no map has yet: "Mappa", then "Mappa 2", "Mappa 3"...
  const taken = new Set(store.placeMaps.map(m => m.name))
  let name = t('locations.map.firstName')
  for (let n = 2; taken.has(name); n++) name = t('locations.map.nthName', { n })
  const created = await store.create('maps', { name, nodes: {}, settings: { image } }).catch(() => null)
  if (created) showMap(created.id)
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
            v-if="store.placeMaps.length > 1"
            :model-value="map.id"
            :items="store.placeMaps"
            value-key="id"
            label-key="name"
            @update:model-value="(id: string) => showMap(id)"
            :aria-label="t('locations.map.choose')"
            class="min-w-48 max-lg:min-h-11"
          />
          <DInlineText
            :model-value="map.name"
            variant="heading"
            required
            :maxlength="120"
            :aria-label="t('locations.map.rename')"
            @update:model-value="(value: string) => store.patchSoon('maps', map!.id, { name: value })"
          />
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
