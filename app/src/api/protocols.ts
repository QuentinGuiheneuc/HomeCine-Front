/**
 * Protocoles de diffusion audio (Snapcast, VBAN, DLNA…).
 *
 * ⚠️ Pas encore d'API serveur : l'état activé/désactivé est mémorisé en
 * localStorage et le statut est un placeholder. Quand l'API existera, remplacer
 * `getProtocols` / `setProtocolEnabled` par les vrais appels (ex. GET/PUT
 * /protocols) et exposer le statut/découverte renvoyés par le serveur.
 */

export interface Protocol {
  id:          string
  name:        string
  icon:        string
  description: string
}

/** Protocoles supportés (ajouter ici les nouveaux) */
export const SUPPORTED_PROTOCOLS: Protocol[] = [
  { id: 'snapcast',   name: 'Snapcast',     icon: 'i-lucide-radio',        description: 'Multiroom synchronisé (snapserver / snapclient).' },
  { id: 'vban',       name: 'VBAN',         icon: 'i-lucide-network',      description: 'Flux audio réseau VB-Audio (UDP).' },
  { id: 'dlna',       name: 'DLNA / UPnP',  icon: 'i-lucide-cast',         description: 'Renderers DLNA/UPnP découverts sur le réseau.' },
  { id: 'airplay',    name: 'AirPlay',      icon: 'i-lucide-airplay',      description: 'Diffusion vers récepteurs AirPlay.' },
  { id: 'chromecast', name: 'Chromecast',   icon: 'i-lucide-cast',         description: 'Appareils Google Cast.' },
]

export interface ProtocolState extends Protocol {
  enabled: boolean
  /** Statut serveur (placeholder tant qu'il n'y a pas d'API) */
  status: 'enabled' | 'disabled' | 'unavailable'
}

/** Clé localStorage de l'état activé/désactivé (cf. composable useProtocols) */
export const PROTOCOLS_STORAGE_KEY = 'hc-protocols-enabled'
