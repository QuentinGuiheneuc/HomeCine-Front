<script setup lang="ts">
/**
 * VU-mètres par canal, alignés sur l'ordre du layout de l'EQ.
 *
 * Purement présentationnel : la page possède la connexion et pousse `levels`.
 * Cliquer une barre sélectionne le canal, pour régler celui qu'on voit bouger.
 */
const props = withDefaults(defineProps<{
  channels: string[]
  levels?: number[]
  selected?: string
  status?: string
  error?: string | null
  /** Streams disponibles. Le codec figure dans le libellé, pour savoir ce
      qu'on mesure avant de cliquer. */
  streams?: { label: string, value: string }[]
  /** Tampon Snapcast compensé, en ms — affiché pour expliquer le décalage. */
  delayMs?: number
}>(), { levels: () => [], status: 'idle', streams: () => [] })

const stream = defineModel<string>('stream', { default: '' })

const emit = defineEmits<{
  (e: 'select', channel: string): void
  (e: 'connect' | 'disconnect'): void
}>()

const FLOOR = -60

/** dBFS → hauteur de barre. Échelle linéaire en dB : le silence occupe 0 %. */
function heightPct(db: number | undefined) {
  if (db === undefined) return 0
  return Math.max(0, Math.min(100, ((db - FLOOR) / -FLOOR) * 100))
}

/** Vert jusqu'à -12, ambre jusqu'à -3, rouge au-delà : repères habituels. */
function barClass(db: number | undefined) {
  if (db === undefined || db <= FLOOR) return 'bg-elevated'
  if (db >= -3) return 'bg-red-500'
  if (db >= -12) return 'bg-amber-400'
  return 'bg-primary'
}

const live = computed(() => props.status === 'connected')
const label = (db: number | undefined) =>
  db === undefined || db <= FLOOR ? '−∞' : db.toFixed(0)
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-4' }">
    <div class="flex items-center gap-3 mb-3">
      <div class="flex items-center gap-1.5">
        <span
          class="size-2 rounded-full"
          :class="{
            'bg-emerald-400': status === 'connected',
            'bg-amber-400 animate-pulse': status === 'connecting',
            'bg-red-400': status === 'error',
            'bg-elevated': status === 'idle' || status === 'disconnected'
          }"
        />
        <span class="text-sm font-medium">Niveaux par canal</span>
      </div>

      <UTooltip
        v-if="live && delayMs"
        text="Snapcast diffuse en avance pour synchroniser les pièces : l'affichage est retardé d'autant."
      >
        <span class="text-xs text-dimmed tabular-nums">aligné +{{ delayMs }} ms</span>
      </UTooltip>

      <USelect
        v-model="stream"
        :items="streams"
        size="xs"
        placeholder="Stream"
        class="min-w-[170px]"
      />

      <div class="ms-auto">
        <UButton
          v-if="!live"
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-activity"
          :loading="status === 'connecting'"
          @click="emit('connect')"
        >
          Connecter
        </UButton>
        <UButton
          v-else
          size="xs"
          color="neutral"
          variant="soft"
          icon="i-lucide-square"
          @click="emit('disconnect')"
        >
          Arrêter
        </UButton>
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :description="error"
      class="mb-3"
    />

    <div v-if="!channels.length" class="text-sm text-dimmed">
      Aucun canal : choisis un preset et un layout.
    </div>

    <div v-else class="flex items-end gap-1.5 overflow-x-auto pb-1">
      <button
        v-for="(ch, i) in channels"
        :key="ch"
        type="button"
        class="flex flex-col items-center gap-1 shrink-0 rounded px-1 pt-1 transition-colors"
        :class="ch === selected ? 'bg-primary/10' : 'hover:bg-elevated/60'"
        @click="emit('select', ch)"
      >
        <span class="text-[10px] tabular-nums text-dimmed">{{ label(levels[i]) }}</span>
        <span class="relative block h-24 w-4 rounded-sm bg-elevated/70 overflow-hidden">
          <span
            class="absolute bottom-0 left-0 w-full transition-[height] duration-75 ease-out"
            :class="barClass(levels[i])"
            :style="{ height: heightPct(levels[i]) + '%' }"
          />
        </span>
        <span
          class="text-[10px] font-medium"
          :class="ch === selected ? 'text-primary' : 'text-dimmed'"
        >{{ ch }}</span>
      </button>
    </div>
  </UCard>
</template>
