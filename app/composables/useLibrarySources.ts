import { useStorage, createSharedComposable } from '@vueuse/core'
import type { LibrarySource } from '@/src/api/library'

/**
 * Sources actives de la bibliothèque (filtres fileplayer/spotify/youtube/…).
 * - Partagé entre la sidebar et la home (createSharedComposable).
 * - Persisté en localStorage → l'état survit aux rechargements.
 *
 * `[]` = aucune source explicitement sélectionnée → l'appelant traite ça
 * comme « toutes » (paramètre `sources` non envoyé à l'API).
 */
const _useLibrarySources = () => {
  const sources = useStorage<LibrarySource[]>('hc-library-sources', [])

  function toggle(id: LibrarySource) {
    sources.value = sources.value.includes(id)
      ? sources.value.filter(s => s !== id)
      : [...sources.value, id]
  }

  /** Initialise avec toutes les sources dispo si rien n'est encore enregistré */
  function initIfEmpty(all: LibrarySource[]) {
    if (!sources.value.length) sources.value = [...all]
  }

  return { sources, toggle, initIfEmpty }
}

export const useLibrarySources = createSharedComposable(_useLibrarySources)
