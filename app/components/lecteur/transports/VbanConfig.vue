<script setup lang="ts">
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
      dest_ip: '',
      dest_port: 6980,
      stream_name: ''
    },
  set: (value) => emit('update:modelValue', value)
})
</script>

<template>
  <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
    <div class="md:col-span-2">
      <h4 class="font-semibold text-sm">VBAN</h4>
    </div>

    <div class="md:col-span-2">
      <label class="text-sm text-dimmed">Ip destination</label>
      <UInput v-model="localValue.dest_ip" placeholder="192.168.1.40" />
    </div>

    <div>
      <label class="text-sm text-dimmed">Port destination</label>
      <UInput v-model.number="localValue.dest_port" type="number" placeholder="6980" />
    </div>

    <div>
      <label class="text-sm text-dimmed">Stream name</label>
      <UInput v-model="localValue.stream_name" placeholder="stream" />
    </div>
  </div>
</template>
