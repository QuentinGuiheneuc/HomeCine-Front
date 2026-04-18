export type UsbItem = {
  byPath: string
  control: string
  card: number
  alsaId: string
  hw: string
  plughw: string
}

export type PcmItem = {
  name: string
  kind: string
  desc?: string
  card?: string
  dev?: number
}

export type AlsaPcmSlave = {
  id?: string
  pcm: string
  channels: number
}

export type AlsaPcmBinding = {
  out: number
  slave: string
  ch: number
}

export type AlsaPcmTtable = {
  in: number
  out: number
  gain: number
}

export type AlsaPcmDef = {
  name: string
  type: string
  slave?: { pcm: string, channels: number }
  slaves?: AlsaPcmSlave[]
  bindings?: AlsaPcmBinding[]
  ttable?: AlsaPcmTtable[]
  hint?: { show?: boolean, description?: string }
  [k: string]: unknown
}

export type Cfg = {
  managed?: boolean
  raw?: string
  setDefaultPcm?: string
  pcms?: AlsaPcmDef[]
  [k: string]: unknown
}

export type Device = {
  id: number
  name: string
  ip: string
  port: number | string
  description: string
  type: string
  isalive: 0 | 1 | boolean
  allconfig: unknown
}

export type SnapclientCfg = {
  host: string
  port: number
  soundcard: string
  player: string
  latency: number
  autoRestart: boolean
  autoStart: boolean
  restartDelayMs: number
  clientName: string
  instance: number
  StartNow: boolean
  // Staging field used by the "add" form (list of instances to create).
  // Not sent to the backend — stripped before POST /snap/add.
  instances?: number[]
}

export type Snapclient = {
  id: string
  running: boolean
  cfg: SnapclientCfg
}

export type BusCard = { key: string, usbByPath: string, channels: number }
export type BindRow = { out: number, cardKey: string, ch: number }

export type DeviceTab = 'presets' | 'bus' | 'zones' | 'pcms' | 'files' | 'snapcats'
