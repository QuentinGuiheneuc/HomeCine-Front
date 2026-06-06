<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import LocalStreamConfig from '../transports/LocalStreamConfig.vue'
import StreamOutFifoConfig from '../transports/StreamOutFifoConfig.vue'
import VbanConfig from '../transports/VbanConfig.vue'

/**
 * Configuration FilePlayer (cf. app/API.md — Contrat FilePlayer).
 * Gère : queue de fichiers, volume initial, repeat, shuffle + transport.
 */
const props = defineProps<{ cfg: any }>()
const emit = defineEmits<{ (e: 'update:cfg', value: any): void }>()

const streamTypeItems = [
  { label: 'StreamOutFifo', value: 'StreamOutFifo' },
  { label: 'LocalStream',   value: 'localStream' },
  { label: 'Vban (sendVban)', value: 'sendVban' }
]

const localCfg = computed({
  get: () => props.cfg,
  set: (value) => emit('update:cfg', value)
})

function ensureSubConfigs() {
  const next = { ...(localCfg.value || {}) }
  if (!next.StreamOutFifo) next.StreamOutFifo = { 'path-audio': '', channels: 8, rate: 48000, config: '7.1' }
  if (!next.localStream)   next.localStream   = { output_device_index: 0, 'path-audio': '' }
  if (!next.sendVban)      next.sendVban      = { stream: { host: '127.0.0.1', port: 6980, name: 'stream', channels: 2, rate: 44100 } }
  if (!next.typeStream)    next.typeStream    = 'StreamOutFifo'
  if (!Array.isArray(next.queue)) next.queue  = []
  if (next.volume === undefined)  next.volume = 85
  if (next.repeat === undefined)  next.repeat = false
  if (next.shuffle === undefined) next.shuffle = false
  localCfg.value = next
}

watch(() => localCfg.value?.typeStream, ensureSubConfigs, { immediate: true })

/* ── Gestion de la queue ─────────────────────────────────────────────────── */

const newFile = ref('')

function addFile() {
  const path = newFile.value.trim()
  if (!path) return
  const next = { ...localCfg.value }
  next.queue = [...(next.queue ?? []), path]
  localCfg.value = next
  newFile.value = ''
}
function removeFile(i: number) {
  const next = { ...localCfg.value }
  next.queue = (next.queue ?? []).filter((_: string, idx: number) => idx !== i)
  localCfg.value = next
}
function moveFile(i: number, dir: -1 | 1) {
  const arr = [...(localCfg.value.queue ?? [])]
  const j = i + dir
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  localCfg.value = { ...localCfg.value, queue: arr }
}
</script>

<template>
  <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
    <h3 class="font-semibold">Configuration FilePlayer</h3>

    <!-- Options de lecture -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label class="text-sm text-dimmed">Volume initial</label>
        <UInput v-model.number="localCfg.volume" type="number" min="0" max="100" placeholder="85" class="mt-1" />
      </div>
      <div class="flex items-center gap-3 pt-6">
        <label class="text-sm text-dimmed">Repeat</label>
        <USwitch v-model="localCfg.repeat" />
      </div>
      <div class="flex items-center gap-3 pt-6">
        <label class="text-sm text-dimmed">Shuffle</label>
        <USwitch v-model="localCfg.shuffle" />
      </div>
    </div>

    <!-- Queue de fichiers -->
    <div class="space-y-2">
      <label class="text-sm text-dimmed">File d'attente initiale</label>
      <div class="flex gap-2">
        <UInput
          v-model="newFile"
          icon="i-lucide-file-music"
          placeholder="/data/morceau.flac"
          class="flex-1"
          @keyup.enter="addFile"
        />
        <UButton icon="i-lucide-plus" color="primary" :disabled="!newFile.trim()" @click="addFile">Ajouter</UButton>
      </div>

      <div v-if="localCfg.queue?.length" class="space-y-1">
        <div
          v-for="(file, i) in localCfg.queue"
          :key="i"
          class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 group"
        >
          <span class="text-xs text-dimmed tabular-nums w-5 text-right shrink-0">{{ i + 1 }}</span>
          <span class="flex-1 min-w-0 truncate text-sm font-mono">{{ file }}</span>
          <div class="flex items-center gap-0.5 shrink-0">
            <UButton size="2xs" variant="ghost" color="neutral" icon="i-lucide-chevron-up"   :disabled="i === 0"                          @click="moveFile(i, -1)" />
            <UButton size="2xs" variant="ghost" color="neutral" icon="i-lucide-chevron-down" :disabled="i === localCfg.queue.length - 1" @click="moveFile(i, 1)" />
            <UButton size="2xs" variant="ghost" color="error"   icon="i-lucide-trash-2"        @click="removeFile(i)" />
          </div>
        </div>
      </div>
      <p v-else class="text-sm text-dimmed italic">Aucun fichier — la queue est vide.</p>
    </div>

    <!-- Transport -->
    <div>
      <label class="text-sm text-dimmed">Type Stream</label>
      <USelect v-model="localCfg.typeStream" :items="streamTypeItems" class="mt-1" />
    </div>

    <StreamOutFifoConfig v-if="localCfg.typeStream === 'StreamOutFifo'" v-model="localCfg.StreamOutFifo" />
    <LocalStreamConfig v-else-if="localCfg.typeStream === 'localStream'" v-model="localCfg.localStream" />
    <VbanConfig v-else-if="localCfg.typeStream === 'sendVban'" v-model="localCfg.sendVban" />
  </UPageCard>
</template>
