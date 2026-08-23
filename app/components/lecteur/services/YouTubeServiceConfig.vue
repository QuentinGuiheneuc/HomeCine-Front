<script setup lang="ts">
import { computed, watch } from 'vue'
import LocalStreamConfig from '../transports/LocalStreamConfig.vue'
import StreamOutFifoConfig from '../transports/StreamOutFifoConfig.vue'
import VbanConfig from '../transports/VbanConfig.vue'

const props = defineProps<{ cfg: any }>()
const emit = defineEmits<{ (e: 'update:cfg', value: any): void }>()

const streamTypeItems = [
  { label: 'StreamOutFifo', value: 'StreamOutFifo' },
  { label: 'LocalStream',   value: 'localStream' },
  { label: 'Vban',          value: 'vban' }
]

const localCfg = computed({
  get: () => props.cfg,
  set: (value) => emit('update:cfg', value)
})

function ensureSubConfigs() {
  const next = { ...(localCfg.value || {}) }
  if (!next.StreamOutFifo) next.StreamOutFifo = { 'path-audio': '/tmp/youtube/out.fifo', channels: 6, rate: 48000 }
  if (!next.localStream)   next.localStream   = { output_device_index: 0, 'path-audio': '' }
  if (!next.vban)          next.vban          = { dest_ip: '', dest_port: 6980, stream_name: '' }
  if (!next.typeStream)    next.typeStream    = 'StreamOutFifo'
  localCfg.value = next
}

watch(() => localCfg.value?.typeStream, ensureSubConfigs, { immediate: true })
</script>

<template>
  <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
    <h3 class="font-semibold">Configuration YouTube</h3>

    <div>
      <label class="text-sm text-dimmed">Type Stream</label>
      <USelect v-model="localCfg.typeStream" :items="streamTypeItems" class="mt-1" />
    </div>

    <StreamOutFifoConfig v-if="localCfg.typeStream === 'StreamOutFifo'" v-model="localCfg.StreamOutFifo" />
    <LocalStreamConfig v-else-if="localCfg.typeStream === 'localStream'" v-model="localCfg.localStream" />
    <VbanConfig v-else-if="localCfg.typeStream === 'vban'" v-model="localCfg.vban" />
  </UPageCard>
</template>
