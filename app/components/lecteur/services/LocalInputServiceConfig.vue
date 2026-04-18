<script setup lang="ts">
import { computed, watch } from 'vue'
import LocalStreamConfig from '../transports/LocalStreamConfig.vue'
import StreamOutFifoConfig from '../transports/StreamOutFifoConfig.vue'
import VbanConfig from '../transports/VbanConfig.vue'
import { LAYOUT_ITEMS } from '@/utils/audioLayouts'

const props = defineProps<{ cfg: any }>()
const emit = defineEmits<{ (e: 'update:cfg', value: any): void }>()

const streamTypeItems = [
  { label: 'LocalStream', value: 'localStream' },
  { label: 'StreamOutFifo', value: 'StreamOutFifo' },
  { label: 'Vban', value: 'vban' }
]

const localCfg = computed({
  get: () => props.cfg,
  set: (value) => emit('update:cfg', value)
})

function ensureSubConfigs() {
  const next = { ...(localCfg.value || {}) }

  // Entrée audio (capture ALSA)
  if (!next.input) next.input = { pcm_device: '', rate: 48000, channels: 2, periodsize: 256 }
  else next.input = { pcm_device: '', rate: 48000, channels: 2, periodsize: 256, ...next.input }

  // Sortie / routage
  if (!next.output) next.output = { layout: '7.1', rate: 48000, master_gain_db: -5, remap: [0, 1, 2, 3, 4, 5, 6, 7] }
  else next.output = { layout: '7.1', rate: 48000, master_gain_db: -5, remap: [0, 1, 2, 3, 4, 5, 6, 7], ...next.output }

  // Transports
  if (!next.localStream) next.localStream = { output_device_index: 0, 'path-audio': '' }
  if (!next.StreamOutFifo) next.StreamOutFifo = { 'path-audio': '', channels: 8, rate: 48000, config: '7.1' }
  if (!next.vban) next.vban = { dest_ip: '', dest_port: 6980, stream_name: '' }
  if (!next.typeStream) next.typeStream = 'localStream'

  localCfg.value = next
}

watch(() => localCfg.value?.typeStream, ensureSubConfigs, { immediate: true })
</script>

<template>
  <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-5' }">
    <h3 class="font-semibold">Configuration Local Input</h3>

    <!-- Entrée audio (capture) -->
    <div>
      <div class="text-sm font-medium text-dimmed mb-3 flex items-center gap-2">
        <UIcon name="i-lucide-mic" class="size-4" />
        Source audio (entrée ALSA)
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="text-sm text-dimmed">PCM device</label>
          <UInput
            v-model="localCfg.input.pcm_device"
            placeholder="hw:CARD=ICUSBAUDIO7D,DEV=0"
            class="mt-1 font-mono"
          />
        </div>
        <div>
          <label class="text-sm text-dimmed">Sample rate (Hz)</label>
          <UInput v-model.number="localCfg.input.rate" type="number" class="mt-1" />
        </div>
        <div>
          <label class="text-sm text-dimmed">Canaux</label>
          <UInput v-model.number="localCfg.input.channels" type="number" class="mt-1" />
        </div>
        <div>
          <label class="text-sm text-dimmed">Period size</label>
          <UInput v-model.number="localCfg.input.periodsize" type="number" class="mt-1" />
        </div>
      </div>
    </div>

    <USeparator />

    <!-- Sortie / routage -->
    <div>
      <div class="text-sm font-medium text-dimmed mb-3 flex items-center gap-2">
        <UIcon name="i-lucide-speaker" class="size-4" />
        Routage sortie
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="text-sm text-dimmed">Layout de sortie</label>
          <USelect v-model="localCfg.output.layout" :items="LAYOUT_ITEMS" class="mt-1" />
        </div>
        <div>
          <label class="text-sm text-dimmed">Sample rate sortie (Hz)</label>
          <UInput v-model.number="localCfg.output.rate" type="number" class="mt-1" />
        </div>
        <div>
          <label class="text-sm text-dimmed">Master gain (dB)</label>
          <UInput v-model.number="localCfg.output.master_gain_db" type="number" step="0.5" class="mt-1" />
        </div>
      </div>
    </div>

    <USeparator />

    <!-- Transport -->
    <div>
      <div class="text-sm font-medium text-dimmed mb-3 flex items-center gap-2">
        <UIcon name="i-lucide-send" class="size-4" />
        Transport de sortie
      </div>
      <USelect v-model="localCfg.typeStream" :items="streamTypeItems" />
    </div>

    <LocalStreamConfig
      v-if="localCfg.typeStream === 'localStream'"
      v-model="localCfg.localStream"
    />
    <StreamOutFifoConfig
      v-else-if="localCfg.typeStream === 'StreamOutFifo'"
      v-model="localCfg.StreamOutFifo"
    />
    <VbanConfig
      v-else-if="localCfg.typeStream === 'vban'"
      v-model="localCfg.vban"
    />
  </UPageCard>
</template>
