import http from '../lib/https'

/**
 * Client API VBAN — streams (DB) + sélection (HP d'abord puis envoi serveur).
 */

/** Paramètres audio d'un bloc VBAN */
export interface VbanStreamAudio {
  format?:              number | string   // 2 / "paInt16" / "paInt24"…
  channels?:            number
  rate?:                number
  output?:              boolean
  output_device_index?: number
  song_local?:          boolean
  func?:                string
}

/** Un bloc de config VBAN (Master = récepteur, CHx = envoi) */
export interface VbanBlock {
  type:                'send' | 'receiver' | string
  ip:                  string
  port?:               number
  nameVban:            string
  channels?:           number
  channel_use_master?: number[]
  stream:              VbanStreamAudio
  network?:            { ip: string; port: number }   // récepteur (Master)
  retard?:             number                          // envoi (CHx)
  [k: string]:         any
}

/** Config complète : { Master: bloc, CH1: bloc, … } */
export type VbanConfig = Record<string, VbanBlock>

export interface VbanStream {
  id:           number | string
  name:         string
  type:         string
  description?: string | null
  isStarting?:  boolean
  config?:      VbanConfig
  [k: string]:  any
}

export interface VbanState {
  targetIp?:     string
  cfg?:          any
  server?:       any
  startDelayMs?: number
  [k: string]:   any
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

/* ── Streams (DB) ───────────────────────────────────────────────────────── */

export async function getVbanStreams(): Promise<VbanStream[]> {
  const d = unwrap<any>(await http.get('/vban'))
  return Array.isArray(d) ? d : (d?.items ?? d?.streams ?? [])
}

/** Crée un stream (config validée côté serveur si elle contient Master) */
export async function createVbanStream(payload: {
  name: string; type: string; description?: string; isStarting?: boolean; config?: any
}): Promise<VbanStream> {
  return unwrap(await http.post('/vban', payload))
}

export async function deleteVbanStream(id: number | string) {
  return http.delete('/vban', { data: { id } })
}

/* ── Sélection ──────────────────────────────────────────────────────────── */

/** Sélection VBAN sauvegardée (ou null) */
export async function getVbanState(): Promise<VbanState | null> {
  return unwrap(await http.get('/vban/state'))
}

/** Sélectionne une cible : HP d'abord (Vban.Start) → envoi serveur → save */
export async function selectVban(payload: {
  targetIp: string; cfg: any; server?: any; startDelayMs?: number
}) {
  return unwrap(await http.post('/vban/select', payload))
}

/** Efface la sélection + stoppe l'envoi serveur */
export async function clearVbanState() {
  return http.delete('/vban/state')
}
