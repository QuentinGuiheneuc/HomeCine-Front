import http from '@/src/lib/https'

export type EqPreset = {
  id: number
  name: string
  description: string
  config: any // JSON (objet)
}

export async function getEqPresets(): Promise<EqPreset[]> {
  const res = await http.get('/eq')
  return res.data
}

export async function getEqPreset(id: number): Promise<EqPreset> {
  const res = await http.get(`/eq/${id}`)
  return res.data
}

export async function createEqPreset(payload: Omit<EqPreset, 'id'>) {
  const res = await http.post('/eq', payload)
  return res.data // {id}
}

export async function updateEqPreset(id: number, payload: Omit<EqPreset, 'id'>) {
  const res = await http.put(`/eq/${id}`, payload)
  return res.data
}

export async function deleteEqPreset(id: number) {
  const res = await http.delete(`/eq/${id}`)
  return res.data
}
