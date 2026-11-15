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
  if (!next.source_path) next.source_path = ''
  if (next.loop === undefined) next.loop = false
  localCfg.value = next
}

watch(() => localCfg.value?.typeStream, ensureSubConfigs, { immediate: true })
</script>

<template>
  <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
    <h3 class="font-semibold">Configuration Local</h3>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="md:col-span-2">
        <label class="text-sm text-dimmed">Source path</label>
        <UInput v-model="localCfg.source_path" placeholder="/home/media/test.wav" />
      </div>

      <div>
        <label class="text-sm text-dimmed">Loop</label>
        <USwitch v-model="localCfg.loop" />
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
