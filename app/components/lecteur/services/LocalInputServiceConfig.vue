<script setup lang="ts">
import { computed, watch } from 'vue'
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
  if (!next.localInput.localStream) next.localInput.localStream = { 'output_device_index': 0, 'path-audio': '' }
  if (!next.localInput.StreamOutFifo) next.localInput.StreamOutFifo = { 'path-audio': '', 'channels': 8, 'rate': 48000, 'config': '7.1' }
  if (!next.localInput.vban) next.localInput.vban = { dest_ip: '', dest_port: 6980, stream_name: '' }
  if (!next.typeStream) next.typeStream = 'localStream'
  if (!next.localInput.input.pcm_device) next.localInput.input.pcm_device = ''
  if (!next.localInput.input.rate) next.localInput.input.rate = 48000
  if (!next.localInput.input.channels) next.localInput.input.channels = 2

  localCfg.value = next
}

watch(() => localCfg.value?.typeStream, ensureSubConfigs, { immediate: true })
</script>

<template>
  <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
    <h3 class="font-semibold">Configuration Local Input</h3>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="md:col-span-2">
        <label class="text-sm text-dimmed">Input device</label>
        <UInput v-model="localCfg.localInput.input.pcm_device" placeholder="hw:1,0" />
      </div>
      <div>
        <label class="text-sm text-dimmed">Sample rate</label>
        <UInput v-model.number="localCfg.localInput.input.rate" type="number" />
      </div>
      <div>
        <label class="text-sm text-dimmed">Channels</label>
        <UInput v-model.number="localCfg.localInput.input.channels" type="number" placeholder="2" />
      </div>
      <div class="md:col-span-2">
        <label class="text-sm text-dimmed">Type Stream</label>
        <USelect v-model="localCfg.typeStream" :items="streamTypeItems" />
      </div>
    </div>
    <div v-if="localCfg.typeStream === 'localStream'" class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="md:col-span-2">
        <h4 class="font-semibold text-sm">LocalStream</h4>
      </div>

      <div>
        <label class="text-sm text-dimmed">Output device index</label>
        <UInput v-model.number="localCfg.localInput.localStream.output_device_index" type="number" />
      </div>

      <div class="md:col-span-2">
        <label class="text-sm text-dimmed">Path fifo</label>
        <UInput
          v-model="localCfg.localInput.localStream.localValue['path-audio']"
          placeholder="/tmp/spotify/multiroom_Snap.fifo"
        />
      </div>
    </div>
    <StreamOutFifoConfig v-else-if="localCfg.typeStream === 'StreamOutFifo'" v-model="localCfg.StreamOutFifo" />
    <VbanConfig v-else-if="localCfg.typeStream === 'vban'" v-model="localCfg.vban" />
  </UPageCard>
</template>
