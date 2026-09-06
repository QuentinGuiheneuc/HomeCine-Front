<script setup lang="ts">
import FifoSelect from '../FifoSelect.vue'
import { computed } from 'vue'

const props = defineProps<{
  modelValue: any
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
}>()

const localValue = computed({
  get: () =>
    props.modelValue || {
      output_device_index: 0,
      'path-audio': ''
    },
  set: (value) => emit('update:modelValue', value)
})
</script>

<template>
  <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
    <div class="md:col-span-2">
      <h4 class="font-semibold text-sm">LocalStream</h4>
    </div>

    <div>
      <label class="text-sm text-dimmed">Output device index</label>
      <UInput v-model.number="localValue.output_device_index" type="number" />
    </div>

    <div class="md:col-span-2">
      <label class="text-sm text-dimmed">Path fifo</label>
      <FifoSelect v-model="localValue['path-audio']" />
    </div>
  </div>
</template>