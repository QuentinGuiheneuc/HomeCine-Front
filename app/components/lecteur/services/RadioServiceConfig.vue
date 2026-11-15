<script setup lang="ts">
import { watch } from 'vue'
import LocalStreamConfig from '../transports/LocalStreamConfig.vue'
import StreamOutFifoConfig from '../transports/StreamOutFifoConfig.vue'
import VbanConfig from '../transports/VbanConfig.vue'

const localCfg = defineModel<any>('cfg', { required: true })

function ensureSubConfigs() {
  const next = { ...(localCfg.value || {}) }
  if (!next.localStream) next.localStream = defaultLocalStream()
  if (!next.StreamOutFifo) next.StreamOutFifo = defaultStreamOutFifo()
  if (!next.vban) next.vban = defaultVban()
  if (!next.typeStream) next.typeStream = 'localStream'
  if (!next.url) next.url = ''
  localCfg.value = next
}

watch(() => localCfg.value?.typeStream, ensureSubConfigs, { immediate: true })
</script>

<template>
  <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
    <h3 class="font-semibold">Configuration Radio</h3>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="md:col-span-2">
        <label class="text-sm text-dimmed">URL radio</label>
        <UInput v-model="localCfg.url" placeholder="https://..." />
      </div>

      <div class="md:col-span-2">
        <label class="text-sm text-dimmed">Type Stream</label>
        <USelect v-model="localCfg.typeStream" :items="STREAM_TYPE_ITEMS" />
      </div>
    </div>

    <LocalStreamConfig v-if="localCfg.typeStream === 'localStream'" v-model="localCfg.localStream" />
    <StreamOutFifoConfig v-else-if="localCfg.typeStream === 'StreamOutFifo'" v-model="localCfg.StreamOutFifo" />
    <VbanConfig v-else-if="localCfg.typeStream === 'vban'" v-model="localCfg.vban" />
  </UPageCard>
</template>
