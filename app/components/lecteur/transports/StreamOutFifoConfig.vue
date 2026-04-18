<script setup lang="ts">
import { computed } from 'vue'

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
  get: () =>
    props.modelValue || {
      'path-audio': '',
      channels: 8,
      rate: 48000,
      config: '7.1'
    },
  set: (value) => emit('update:modelValue', value)
})
</script>

<template>
  <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
    <div class="md:col-span-2">
      <h4 class="font-semibold text-sm">StreamOutFifo</h4>
    </div>

    <div class="md:col-span-2">
      <label class="text-sm text-dimmed">Path fifo</label>
      <UInput
        v-model="localValue['path-audio']"
        placeholder="/tmp/spotify/Cuisine_Snap.fifo"
      />
    </div>

    <div>
      <label class="text-sm text-dimmed">Channels</label>
      <UInput v-model.number="localValue.channels" type="number" />
    </div>

    <div>
      <label class="text-sm text-dimmed">Rate</label>
      <UInput v-model.number="localValue.rate" type="number" />
    </div>

    <div>
      <label class="text-sm text-dimmed">Config</label>
      <USelect
        v-model="localValue.config"
        :items="audioConfigItems"
        class="min-w-[160px]"
      />
    </div>
  </div>
</template>