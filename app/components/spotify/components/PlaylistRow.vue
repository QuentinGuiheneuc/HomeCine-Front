<script setup lang="ts">
import type { Track } from '../type/spotify'

const props = defineProps<{
  track: Track
  index: number
  active?: boolean
}>()

const emit = defineEmits<{
  (e: 'playAt', index: number): void
  (e: 'remove', track: Track): void
  (e: 'move', payload: { from: number; to: number }): void
}>()

const ms = (v: number) => {
  const s = Math.floor(v / 1000), m = Math.floor(s / 60), ss = String(s % 60).padStart(2,'0')
  return `${m}:${ss}`
}

function onDblClick() {
  emit('playAt', props.index)
}
</script>

<template>
  <div
    class="group flex items-center gap-3 p-2 rounded hover:bg-elevated/40"
    :class="active ? 'bg-elevated/50' : ''"
    @dblclick="onDblClick"
  >
    <span class="w-8 text-center text-xs tabular-nums text-dimmed">{{ index + 1 }}</span>

    <img
      :src="track.album?.images?.[2]?.url || track.album?.images?.[1]?.url || track.album?.images?.[0]?.url"
      class="h-12 w-12 rounded object-cover"
      :alt="track.name"
    />

    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium">{{ track.name }}</p>
      <p class="truncate text-xs text-dimmed">{{ track.artists.map(a => a.name).join(', ') }}</p>
    </div>

    <span class="text-xs text-dimmed w-12 text-right">{{ ms(track.duration_ms) }}</span>

    <!-- Actions visibles au survol, comme sur le lecteur -->
    <div class="ms-2 hidden items-center gap-1 group-hover:flex">
      <UButton
        icon="i-lucide-play"
        variant="ghost"
        size="xs"
        @click="emit('playAt', index)"
        aria-label="Lire"
      />
      <UButton
        icon="i-lucide-chevron-up"
        variant="ghost"
        size="xs"
        @click="emit('move', { from: index, to: index - 1 })"
        :disabled="index === 0"
        aria-label="Monter"
      />
      <UButton
        icon="i-lucide-chevron-down"
        variant="ghost"
        size="xs"
        @click="emit('move', { from: index, to: index + 1 })"
        aria-label="Descendre"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="red"
        variant="ghost"
        size="xs"
        @click="emit('remove', track)"
        aria-label="Supprimer"
      />
    </div>
  </div>
</template>
