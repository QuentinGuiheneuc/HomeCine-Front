import http, { unwrap } from '../lib/https'

/**
 * Client API « OTA » — mise à jour des HP (HomeCine-Client) depuis le serveur.
 * Contrat : HomeCine-Serv/docs/ota.md.
 */

export interface OtaDepot {
  commit: string
  branche?: string
  date?: string
  sujet?: string
}

/** Dernière mise à jour demandée à un HP (en mémoire côté serveur) */
export interface OtaResultat {
  enCours?: boolean
  ok?: boolean
  de?: string
  vers?: string
  inchange?: boolean
  redemarrage?: boolean
  refus?: boolean
  erreur?: string
  le?: string
}

export interface OtaClient {
  ip: string
  connecte: boolean
  /** null : jamais mis à jour par l'OTA */
  commit?: string | null
  /** le HP n'a pas répondu en HTTP (éteint, redémarre, ou client d'avant l'OTA) */
  erreur?: string
  aJour: boolean
  resultat?: OtaResultat
}

export async function getOta(): Promise<{ depot: OtaDepot, clients: OtaClient[] }> {
  const d = unwrap<{ depot: OtaDepot, clients?: OtaClient[] }>(await http.get('/ota/client'))
  return { depot: d.depot, clients: d.clients ?? [] }
}

/** git pull --ff-only du clone client sur le serveur */
export async function fetchOta(): Promise<OtaDepot> {
  return unwrap<{ depot: OtaDepot }>(await http.post('/ota/client/fetch')).depot
}

/** 202 : demandes envoyées. `targetIp` absent = tous les HP connectés. */
export async function updateOta(targetIp?: string, force = false) {
  return unwrap<{ commit: string, envoye: string[] }>(
    await http.post('/ota/client/update', { ...(targetIp ? { targetIp } : {}), force })
  )
}

/* ── Lecture d'un résultat ──────────────────────────────────────────────── */

export interface OtaEtat {
  label: string
  color: 'success' | 'warning' | 'error' | 'neutral'
  /** que proposer à l'utilisateur, d'après le tableau §3 de la doc */
  recuperer?: boolean
  forcer?: boolean
  conseil?: string
}

/**
 * Traduit `resultat` en affichage. Les trois refus ne se distinguent que par
 * leur message (contrat de la doc §3).
 */
export function otaEtat(r?: OtaResultat): OtaEtat | null {
  if (!r) return null
  if (r.enCours) return { label: 'en cours', color: 'warning' }
  if (r.ok) {
    if (r.inchange) return { label: 'déjà à jour', color: 'success' }
    if (r.redemarrage === false) return { label: 'installé', color: 'warning', conseil: 'Redémarrer le HP à la main (il ne tourne pas sous systemd).' }
    return { label: 'installé', color: 'success' }
  }
  const e = r.erreur ?? ''
  if (r.refus) {
    if (e.includes('plus ancien que la version du HP')) {
      return { label: 'refusé', color: 'error', recuperer: true, conseil: 'Le serveur distribue une version plus ancienne que celle du HP : récupérer la dernière version, puis réessayer.' }
    }
    if (e.includes('inconnue du serveur')) {
      return { label: 'refusé', color: 'error', recuperer: true, forcer: true, conseil: 'Le serveur ne connaît pas la version du HP : récupérer la dernière version, forcer en dernier recours.' }
    }
    if (e.includes('ne descend pas')) {
      return { label: 'refusé', color: 'error', forcer: true, conseil: 'Les historiques divergent : forcer impose la version du serveur.' }
    }
    return { label: 'refusé', color: 'error' }
  }
  return { label: 'échec', color: 'error' }
}
