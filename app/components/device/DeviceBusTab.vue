<script setup lang="ts">
import type { UseDeviceBus } from '~/composables/useDeviceBus'

type SelectOption = { label: string, value: string | number }

const props = defineProps<{
  bus: UseDeviceBus
  usbOptionsByPath: SelectOption[]
  isManaged: boolean
}>()

// The composable returns plain refs: destructuring keeps reactivity.
const {
  busName,
  busCards,
  busRows,
  totalBusChannels,
  busIssues,
  busList,
  busChannelsCount,
  cardChannels,
  addBusCard,
  removeBusCard,
  autoFillBus,
  saveBusPcm,
  selectBusCard,
  createNewBusCard,
  deleteBusCard,
  addFullBusRow,
  removeBusRow
} = props.bus

const channelCountOptions: SelectOption[] = [
  { label: '2', value: 2 },
  { label: '6', value: 6 },
  { label: '8', value: 8 }
]

const cardKeyOptions = computed<SelectOption[]>(() =>
  busCards.value.map(c => ({ label: c.key, value: c.key }))
)

function cardChannelOptions(cardKey: string): SelectOption[] {
  const n = cardChannels(cardKey)
  return Array.from({ length: n }, (_, i) => ({ label: String(i), value: i }))
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <!-- Card "Ajouter" -->
      <UPageCard
        variant="subtle"
        :ui="{ container: 'p-4 gap-y-2' }"
        class="cursor-pointer border border-dashed border-default/60 hover:bg-default/20"
        @click="createNewBusCard"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-plus" class="w-5 h-5" />
          <div class="font-medium">Ajouter un BUS</div>
        </div>
        <div class="text-xs text-dimmed">
          Créer un nouveau PCM <span class="font-mono">type=multi</span>
        </div>
      </UPageCard>

      <!-- Existing BUS cards -->
      <UPageCard
        v-for="b in busList"
        :key="b.name"
        variant="subtle"
        :ui="{ container: 'p-4 gap-y-2' }"
        class="cursor-pointer hover:bg-default/20"
        :class="b.name === busName ? 'ring-2 ring-primary' : ''"
        @click="selectBusCard(b.name)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-mono text-sm truncate">{{ b.name }}</div>
            <div v-if="b.desc" class="text-xs text-dimmed truncate">{{ b.desc }}</div>
            <div v-else class="text-xs text-dimmed truncate">BUS multi-cartes</div>
          </div>

          <UBadge variant="subtle" color="neutral" class="text-[10px] whitespace-nowrap">
            {{ busChannelsCount(b) }}ch
          </UBadge>
        </div>

        <div class="flex items-center justify-between pt-2">
          <UBadge
            variant="subtle"
            :color="b.name === busName ? 'primary' : 'neutral'"
            class="text-[10px]"
          >
            {{ b.name === busName ? 'Sélectionné' : 'Cliquer pour ouvrir' }}
          </UBadge>

          <UButton
            size="2xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-trash-2"
            :disabled="!isManaged"
            @click.stop="deleteBusCard(b.name)"
          >
            Suppr
          </UButton>
        </div>
      </UPageCard>
    </div>

    <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-4' }">
      <div class="flex items-center justify-between">
        <div class="font-medium">BUS multi-cartes</div>
        <div class="flex gap-2">
          <UButton size="xs" variant="ghost" icon="i-lucide-plus" @click="addBusCard">
            Ajouter carte
          </UButton>
          <UButton size="xs" color="primary" icon="i-lucide-wand-2" @click="autoFillBus">
            Auto remplir
          </UButton>
          <UButton size="xs" variant="ghost" icon="i-lucide-save" :disabled="!isManaged" @click="saveBusPcm">
            Sauver BUS
          </UButton>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <div class="md:col-span-2 space-y-1">
          <div class="text-xs text-dimmed">Nom BUS (pcm)</div>
          <UInput v-model="busName" placeholder="alsa_bus" />
        </div>
        <div class="space-y-1">
          <div class="text-xs text-dimmed">Total canaux</div>
          <div class="font-mono text-sm">{{ totalBusChannels }}</div>
        </div>
      </div>

      <div class="space-y-2">
        <div
          v-for="c in busCards"
          :key="c.key"
          class="flex flex-wrap gap-2 items-end border border-default rounded-lg p-3"
        >
          <div class="text-xs font-mono w-10">({{ c.key }})</div>

          <div class="min-w-[260px] flex-1 space-y-1">
            <div class="text-xs text-dimmed">Carte</div>
            <USelect v-model="c.usbByPath" :items="usbOptionsByPath" />
          </div>

          <div class="w-32 space-y-1">
            <div class="text-xs text-dimmed">Canaux</div>
            <USelect v-model="c.channels" :items="channelCountOptions" />
          </div>

          <div class="flex gap-1">
            <UButton
              size="2xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-trash-2"
              @click="removeBusCard(c.key)"
            />
          </div>
        </div>
      </div>

      <div v-if="busIssues.length" class="p-3 border border-warning/40 rounded-lg bg-warning/5">
        <div class="text-sm font-medium mb-1">⚠️ Problèmes</div>
        <ul class="text-xs text-dimmed list-disc ms-4">
          <li v-for="(m, i) in busIssues.slice(0, 6)" :key="i">{{ m }}</li>
        </ul>
      </div>
    </UPageCard>

    <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-3' }">
      <div class="font-medium">Mapping (Out → carte/canal)</div>
      <div class="max-h-[420px] overflow-auto border border-default rounded-lg">
        <div class="flex items-center justify-between">
          <div class="flex gap-2">
            <UButton size="xs" variant="ghost" icon="i-lucide-plus" @click="addFullBusRow">
              Ajouter ligne complète
            </UButton>
          </div>
        </div>
        <table class="w-full text-xs">
          <thead class="sticky top-0 bg-background/80 backdrop-blur border-b border-default">
            <tr>
              <th class="text-left p-2 w-16">Out</th>
              <th class="text-left p-2 w-20">Carte</th>
              <th class="text-left p-2 w-20">Canal</th>
              <th class="text-left p-2 w-16">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, idx) in busRows" :key="r.out" class="border-b border-default/50">
              <td class="p-2 font-mono">{{ r.out }}</td>
              <td class="p-2">
                <USelect v-model="r.cardKey" :items="cardKeyOptions" size="xs" />
              </td>
              <td class="p-2">
                <USelect v-model="r.ch" :items="cardChannelOptions(r.cardKey)" size="xs" />
              </td>
              <td class="p-2">
                <div class="flex gap-1">
                  <UButton
                    size="2xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-trash-2"
                    title="Supprimer cette ligne"
                    @click="removeBusRow(idx)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="text-xs text-dimmed">(Auto remplir suffit presque toujours.)</div>
    </UPageCard>
  </div>
</template>
