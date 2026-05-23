/* ── Config / DB ─────────────────────────────────────────────────────────── */

export type LecteurType = 'spotify' | 'fileplayer' | 'controlinput' | 'deezer' | 'radio' | 'local' | 'localInput' | string

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
  { label: 'Spotify',    value: 'spotify' },
  { label: 'FilePlayer', value: 'fileplayer' },
  { label: 'Deezer',     value: 'deezer' },
  { label: 'Local',      value: 'local' },
  { label: 'Radio',      value: 'radio' },
  { label: 'Local Input', value: 'localInput' }
]

/* ── WS temps réel ───────────────────────────────────────────────────────── */

export interface TrackInfo {
  title:       string | null
  artists:     string[]
  album:       string | null
  cover_url:   string | null
  duration_ms: number | null
  uri?:        string | null
}

export interface TempInfo {
  position_ms: number | null
  duration_ms: number | null
  updated_at:  number
}

export interface QueueItem {
  title:       string
  artists:     string[]
  album:       string | null
  cover_url:   string | null
  duration_ms: number
  uri:         string
}

export type RepeatMode = 'off' | 'context' | 'track'

export interface LecteurState {
  id:              number
  name:            string
  type:            LecteurType
  alive:           boolean
  playing:         boolean
  paused:          boolean
  shuffle:         boolean
  repeat:          RepeatMode
  track:           TrackInfo | null
  temp:            TempInfo  | null
  queue:           QueueItem[] | null
  volume:          number | null
  device_type:     string | null
  supports_volume: boolean
}

export interface HeartbeatEntry {
  id:              number
  alive:           boolean
  playing:         boolean
  temp:            TempInfo | null
  volume:          number | null
  device_type:     string | null
  supports_volume: boolean
}
