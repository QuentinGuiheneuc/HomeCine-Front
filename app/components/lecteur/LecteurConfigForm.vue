<script setup lang="ts">
import { computed } from 'vue'

import SpotifyServiceConfig from './services/SpotifyServiceConfig.vue'
import DeezerServiceConfig from './services/DeezerServiceConfig.vue'
import LocalServiceConfig from './services/LocalServiceConfig.vue'
import RadioServiceConfig from './services/RadioServiceConfig.vue'
import LocalInputServiceConfig from './services/LocalInputServiceConfig.vue'

const props = defineProps<{
  cfg: any
  lecteurType: string
}>()

const emit = defineEmits<{
  (e: 'update:cfg', value: any): void
}>()

const serviceMap: Record<string, any> = {
  spotify: SpotifyServiceConfig,
  deezer: DeezerServiceConfig,
  local: LocalServiceConfig,
  radio: RadioServiceConfig,
  localInput: LocalInputServiceConfig
}

const currentComponent = computed(() => {
  return serviceMap[props.lecteurType] || SpotifyServiceConfig
})
</script>

<template>
  <component
    :is="currentComponent"
    :cfg="cfg"
    @update:cfg="$emit('update:cfg', $event)"
  />
</template>