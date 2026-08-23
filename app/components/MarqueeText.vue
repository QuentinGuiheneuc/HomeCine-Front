<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

/**
 * Texte qui défile horizontalement (aller-retour) uniquement s'il dépasse la
 * largeur disponible. Sinon il s'affiche normalement.
 *
 * Le texte est en `position: absolute` → il ne contribue PAS à la largeur du
 * parent (donc il ne fait jamais grandir la carte / colonne) ; un espace
 * invisible en flux réserve la hauteur d'une ligne. Les classes passées
 * (font, couleur…) tombent sur la racine et sont héritées par le texte.
 */
const props = defineProps<{ text?: string | null }>()

const root  = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const shift = ref(0)        // px à défiler (0 = pas de débordement)
const duration = ref(0)     // s

function measure() {
  const r = root.value, i = inner.value
  if (!r || !i) return
  const overflow = i.scrollWidth - r.clientWidth
  if (overflow > 2) {
    shift.value = overflow
    duration.value = Math.max(5, overflow / 25)   // ~25 px/s
  } else {
    shift.value = 0
  }
}

let ro: ResizeObserver | null = null
onMounted(() => {
  measure()
  ro = new ResizeObserver(() => measure())
  if (root.value) ro.observe(root.value)
})
onBeforeUnmount(() => ro?.disconnect())
watch(() => props.text, () => nextTick(measure))
</script>

<template>
  <div ref="root" class="relative overflow-hidden w-full min-w-0">
    <!-- Réserve la hauteur d'une ligne sans contribuer à la largeur -->
    <span class="invisible" aria-hidden="true">&nbsp;</span>
    <div
      ref="inner"
      class="marquee__inner absolute inset-y-0 left-0 flex items-center whitespace-nowrap"
      :class="{ 'marquee__inner--run': shift > 0 }"
      :style="shift > 0 ? { '--shift': shift + 'px', '--dur': duration + 's' } : undefined"
    >{{ text }}</div>
  </div>
</template>

<style scoped>
.marquee__inner { will-change: transform; }
.marquee__inner--run {
  animation: marquee-scroll var(--dur) ease-in-out infinite alternate;
}
/* Pause aux extrémités pour laisser lire le début et la fin */
@keyframes marquee-scroll {
  0%, 12%   { transform: translateX(0); }
  88%, 100% { transform: translateX(calc(-1 * var(--shift))); }
}
@media (prefers-reduced-motion: reduce) {
  .marquee__inner--run { animation: none; }
}
</style>
