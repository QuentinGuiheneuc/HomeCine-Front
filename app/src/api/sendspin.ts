import http from '../lib/https'

/**
 * Client API SendSpin — un émetteur audio unique (config + état running).
 * GET /sendspin → { config, running } ; PUT /sendspin enregistre (redémarre si actif).
 * POST /sendspin/start | /stop ; DELETE /sendspin (efface + arrête).
 */

export interface SendspinConfig {
  mode?:        string
  name?:        string
  audioDevice?: string
  url?:         string
  args?:        string
  [k: string]:  any
}

export interface SendspinState {
  config:  SendspinConfig | null
  running: boolean
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

/** État courant : config enregistrée + actif ? */
export async function getSendspin(): Promise<SendspinState> {
  const d = unwrap<any>(await http.get('/sendspin')) ?? {}
  return { config: d.config ?? null, running: !!d.running }
}

/** Enregistre la config (redémarre l'émetteur s'il est actif) */
export async function saveSendspin(config: SendspinConfig): Promise<SendspinState> {
  return unwrap(await http.put('/sendspin', config))
}

/** Démarre l'émetteur */
export async function startSendspin() {
  return unwrap(await http.post('/sendspin/start', {}))
}

/** Arrête l'émetteur */
export async function stopSendspin() {
  return unwrap(await http.post('/sendspin/stop', {}))
}

/** Efface la config et arrête */
export async function clearSendspin() {
  return http.delete('/sendspin')
}
