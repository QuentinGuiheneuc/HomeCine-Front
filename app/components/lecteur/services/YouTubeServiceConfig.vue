<script setup lang="ts">
import { watch } from 'vue'
import LocalStreamConfig from '../transports/LocalStreamConfig.vue'
import StreamOutFifoConfig from '../transports/StreamOutFifoConfig.vue'
import VbanConfig from '../transports/VbanConfig.vue'

const localCfg = defineModel<any>('cfg', { required: true })

const streamTypeItems = [
  { label: 'StreamOutFifo', value: 'StreamOutFifo' },
  { label: 'LocalStream',   value: 'localStream' },
  { label: 'Vban',          value: 'vban' }
]

function ensureSubConfigs() {
  const next = { ...(localCfg.value || {}) }
  if (!next.StreamOutFifo) next.StreamOutFifo = { 'path-audio': '/tmp/youtube/out.fifo', channels: 6, rate: 48000 }
  if (!next.localStream)   next.localStream   = defaultLocalStream()
  if (!next.vban)          next.vban          = defaultVban()
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
