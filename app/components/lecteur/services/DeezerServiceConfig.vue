<script setup lang="ts">
import { computed, watch } from 'vue'
import { typeStreamOptions } from '~/utils/lecteurOptions'
import LocalStreamConfig from '../transports/LocalStreamConfig.vue'
import StreamOutFifoConfig from '../transports/StreamOutFifoConfig.vue'
import VbanConfig from '../transports/VbanConfig.vue'

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
  if (!next.localStream) next.localStream = { output_device_index: 0, 'path-audio': '' }
  if (!next.StreamOutFifo) next.StreamOutFifo = { 'path-audio': '', channels: 8, rate: 48000, config: '7.1' }
  if (!next.vban) next.vban = { dest_ip: '', dest_port: 6980, stream_name: '' }
  if (!next.typeStream) next.typeStream = 'localStream'
  localCfg.value = next
}

watch(() => localCfg.value?.typeStream, ensureSubConfigs, { immediate: true })

const bitrateItems = computed(() => typeStreamOptions.deezer?.bitrateItems || [])
const deviceTypeItems = computed(() => typeStreamOptions.deezer?.Device_typeItems || [])
const framesPerBufferItems = computed(() => typeStreamOptions.deezer?.frames_per_bufferItems || [])
</script>

<template>
  <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
    <h3 class="font-semibold">Configuration Deezer</h3>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="text-sm text-dimmed">Backend</label>
        <UInput v-model="localCfg.backend" />
      </div>

      <div>
        <label class="text-sm text-dimmed">Bitrate</label>
        <USelect v-model="localCfg.bitrate" :items="bitrateItems" />
      </div>

      <div>
        <label class="text-sm text-dimmed">Initial volume</label>
        <UInput v-model="localCfg['initial-volume']" />
      </div>

      <div>
        <label class="text-sm text-dimmed">Device type</label>
        <USelect v-model="localCfg['device-type']" :items="deviceTypeItems" />
      </div>

      <div class="md:col-span-2">
        <label class="text-sm text-dimmed">Path audio (base)</label>
        <UInput v-model="localCfg['path-audio']" />
      </div>

      <div>
        <label class="text-sm text-dimmed">Frames / buffer</label>
        <USelect v-model="localCfg.frames_per_buffer" :items="framesPerBufferItems" />
      </div>

      <div>
        <label class="text-sm text-dimmed">Normalisation volume</label>
        <UToggle v-model="localCfg['enable-volume-normalisation']" />
      </div>

      <div class="md:col-span-2">
        <label class="text-sm text-dimmed">Type Stream</label>
        <USelect v-model="localCfg.typeStream" :items="streamTypeItems" />
      </div>
    </div>

    <LocalStreamConfig v-if="localCfg.typeStream === 'localStream'" v-model="localCfg.localStream" />
    <StreamOutFifoConfig v-else-if="localCfg.typeStream === 'StreamOutFifo'" v-model="localCfg.StreamOutFifo" />
    <VbanConfig v-else-if="localCfg.typeStream === 'vban'" v-model="localCfg.vban" />
  </UPageCard>
</template>
