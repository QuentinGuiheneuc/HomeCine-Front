<script setup lang="ts">
import { computed } from 'vue'
import FifoSelect from '../FifoSelect.vue'
import { formatFifoFormat } from '@/utils/fifo'

/**
 * Sortie vers un FIFO lu par Snapcast.
 *
 * Le lecteur n'enregistre plus que `fifo_id` : chemin, débit, profondeur et
 * nombre de canaux appartiennent au FIFO et reviennent RÉSOLUS dans
 * GET /lecteur. Les renvoyer en écriture serait sans effet — POST et PUT
 * /lecteur les ignorent — d'où l'affichage en lecture seule, avec le lien vers
 * Réglages → FIFO pour les modifier là où ils sont stockés.
 */
const props = defineProps<{
  modelValue: any
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
}>()

const audioConfigItems = [
  { label: '2.0', value: '2.0' },
  { label: '4.2', value: '4.2' },
  { label: '5.1', value: '5.1' },
  { label: '7.1', value: '7.1' }
]

const localValue = computed({
  get: () => props.modelValue || { fifo_id: null, config: '7.1' },
  set: value => emit('update:modelValue', value)
})

/** Vue résolue renvoyée par l'API — jamais réécrite. */
const resolved = computed(() => formatFifoFormat(props.modelValue))
</script>

<template>
  <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
    <div class="md:col-span-2">
      <h4 class="font-semibold text-sm">StreamOutFifo</h4>
    </div>

    <div class="md:col-span-2">
      <label class="text-sm text-dimmed">FIFO de sortie</label>
      <FifoSelect
        v-model="localValue['path-audio']"
        v-model:fifo-id="localValue.fifo_id"
      />
      <p v-if="resolved" class="text-[11px] text-dimmed mt-1">
        Format du FIFO : <span class="font-mono">{{ resolved }}</span>
        <span class="opacity-60"> · modifiable dans Réglages → FIFO</span>
      </p>
    </div>

    <div>
      <label class="text-sm text-dimmed">Config</label>
      <USelect
        v-model="localValue.config"
        :items="audioConfigItems"
        class="min-w-[160px] w-full flex items-center h-8 rounded-md border border-accented bg-elevated text-sm font-mono"
      />
    </div>
  </div>
</template>
