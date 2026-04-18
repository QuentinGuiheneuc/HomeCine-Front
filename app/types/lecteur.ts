export type LecteurType = 'spotify' | 'deezer' | 'radio' | 'local' | 'localInput' | string

export type ConfEq = {
  rate: number
  config: string
  path_eq: string
  order: string[]
}

export type Lecteur = {
  id: number
  name: string
  type: LecteurType
  isStarting: number | boolean
  config: any
  conf_eq: ConfEq | null
  conf_eq_id: number | null
  url?: Array<{ url: string; type: string }>
}

export const typeItems = [
  { label: 'Spotify', value: 'spotify' },
  { label: 'Deezer', value: 'deezer' },
  { label: 'Local', value: 'local' },
  { label: 'Radio', value: 'radio' },
  { label: 'Local Input', value: 'localInput' }
]

export type LecteurState = {
  id: number
  status: 'stopped' | 'starting' | 'running' | 'error'
  message?: string
  track?: {
    title?: string
    artist?: string
    album?: string
    cover?: string
  }
  volume?: { percent: number; muted: boolean }
}
