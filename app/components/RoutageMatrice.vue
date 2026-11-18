<script setup lang="ts">
/**
 * Matrice de routage : ligne = source, colonne = sortie ; la sortie i prend la source map[i].
 * Même forme pour le channel_map d'un client Snapcast et le channel_use_master d'un HP VBAN.
 */
const props = defineProps<{
  /** sources proposées (lignes), ex. [0, 1, …, 7] */
  sources: number[]
  /** nombre maximal de sorties (colonnes) ; illimité si absent */
  max?: number
}>()
const map = defineModel<number[]>({ required: true })

function setOutput(o: number, s: number) {
  map.value = map.value.map((v, i) => (i === o ? s : v))
}
function addOutput() {
  if (props.max != null && map.value.length >= props.max) return
  map.value = [...map.value, props.sources[0] ?? 0]
}
function removeOutput(o: number) {
  map.value = map.value.filter((_, i) => i !== o)
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-4">
      <p class="text-xs text-dimmed">
        Ligne = <b>source</b>, colonne = <b>sortie</b>. Clic = router.
        <span class="text-dimmed/70">· {{ map.length }}{{ max != null ? `/${max}` : '' }} sorties</span>
      </p>
      <UButton
        icon="i-lucide-plus"
        size="xs"
        variant="soft"
        color="neutral"
        :disabled="max != null && map.length >= max"
        @click="addOutput"
      >
        Sortie
      </UButton>
    </div>

    <p v-if="!map.length || !sources.length" class="text-sm text-dimmed italic py-2">
      Aucune sortie / flux sans canaux.
    </p>

    <div v-else class="overflow-auto max-h-[62vh]">
      <table class="border-separate" style="border-spacing: 4px">
        <thead>
          <tr>
            <th class="w-8 h-8 text-dimmed">
              <UIcon name="i-lucide-x" class="size-4" />
            </th>
            <th v-for="(src, o) in map" :key="o" class="align-bottom">
              <div class="flex flex-col items-center gap-0.5">
                <span class="text-[11px] font-mono text-dimmed">{{ o }}</span>
                <UButton
                  icon="i-lucide-x"
                  size="2xs"
                  color="error"
                  variant="ghost"
                  :padded="false"
                  class="p-0.5"
                  @click="removeOutput(o)"
                />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sources" :key="s">
            <td class="text-[11px] font-mono text-dimmed text-right pr-1 w-8">
              {{ s }}
            </td>
            <td v-for="(src, o) in map" :key="o" class="p-0">
              <button
                class="w-8 h-8 rounded-md border border-default/60 transition-colors"
                :class="src === s
                  ? 'bg-primary hover:bg-primary/90'
                  : 'bg-error/15 hover:bg-error/30'"
                :title="`Sortie ${o} ← Source ${s}`"
                @click="setOutput(o, s)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
