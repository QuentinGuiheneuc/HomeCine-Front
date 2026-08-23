import http from '../lib/https'

/**
 * Services système (protocoles : snapcast, vban, dlna…).
 * GET /services → liste ; PUT /services/:name { enabled } → start/stop + persiste.
 */

export interface Service {
  name:       string
  label?:     string
  enabled:    boolean
  running?:   boolean
  available?: boolean
  [k: string]: any
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

export async function getServices(): Promise<Service[]> {
  const d = unwrap<any>(await http.get('/services'))
  return Array.isArray(d) ? d : (d?.items ?? d?.services ?? [])
}

/** Active/désactive un service (start/stop à chaud + persistance) */
export async function setServiceEnabled(name: string, enabled: boolean) {
  return (await http.put(`/services/${encodeURIComponent(name)}`, { enabled })).data
}
