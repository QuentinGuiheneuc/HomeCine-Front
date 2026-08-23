<script setup lang="ts">
/**
 * Carousel horizontal : slot par défaut = contenu défilable.
 * Si le contenu dépasse la largeur visible → flèches gauche/droite.
 *
 * Particularité : on plafonne la largeur du scroller à l'espace visible
 * (viewport − position gauche) car un ancêtre flex peut ne pas borner la
 * largeur. Sans ça, clientWidth == scrollWidth et le carousel ne s'active jamais.
 */
const scroller = ref<HTMLElement | null>(null)
const canLeft  = ref(false)
const canRight = ref(false)

let ro: ResizeObserver | null = null

/** Calcule uniquement la visibilité des flèches (ne modifie pas la taille). */
function updateArrows() {
  const el = scroller.value
  if (!el) return
  canLeft.value  = el.scrollLeft > 4
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}

/** Plafonne la largeur du scroller à l'espace réellement visible. */
function applyWidth() {
  const el = scroller.value
  if (!el) return
  el.style.maxWidth = ''                           // retire le cap pour mesurer la vraie position
  const rect = el.getBoundingClientRect()
  // Élément pas encore en page (transition, détaché…) → on réessaiera plus tard
  if (rect.width === 0 && rect.left === 0) { updateArrows(); return }
  const avail = window.innerWidth - rect.left - 16
  // Garde : ne JAMAIS appliquer une largeur nulle/négative (sinon section invisible)
  if (avail > 60) el.style.maxWidth = avail + 'px'
  updateArrows()
}

function schedule() {
  applyWidth()
  nextTick(applyWidth)
  setTimeout(applyWidth, 120)
  setTimeout(applyWidth, 450)
}

function scrollByDir(dir: -1 | 1) {
  const el = scroller.value
  if (!el) return
  el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: 'smooth' })
}

onMounted(() => {
  const el = scroller.value
  if (!el) return
  el.addEventListener('scroll', updateArrows, { passive: true })
  window.addEventListener('resize', applyWidth)
  // RO seulement pour recalculer les flèches quand le CONTENU change (images),
  // sans toucher à la largeur → pas de boucle.
  ro = new ResizeObserver(updateArrows)
  for (const child of Array.from(el.children)) ro.observe(child as Element)
  schedule()
})
onBeforeUnmount(() => {
  scroller.value?.removeEventListener('scroll', updateArrows)
  ro?.disconnect()
  window.removeEventListener('resize', applyWidth)
})
</script>

<template>
  <div class="group/hs relative w-full">
    <!-- Flèche gauche -->
    <button
      v-show="canLeft"
      class="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-elevated shadow-lg items-center justify-center hover:scale-105 transition-transform"
      @click="scrollByDir(-1)"
    >
      <UIcon name="i-lucide-chevron-left" class="size-5" />
    </button>

    <!-- Contenu défilable -->
    <div ref="scroller" class="flex gap-3 overflow-x-auto pb-1 scroll-thin scroll-smooth">
      <slot />
    </div>

    <!-- Flèche droite -->
    <button
      v-show="canRight"
      class="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-elevated shadow-lg items-center justify-center hover:scale-105 transition-transform"
      @click="scrollByDir(1)"
    >
      <UIcon name="i-lucide-chevron-right" class="size-5" />
    </button>
  </div>
</template>

<style scoped>
.scroll-thin { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
.scroll-thin::-webkit-scrollbar { height: 4px; }
.scroll-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
</style>
