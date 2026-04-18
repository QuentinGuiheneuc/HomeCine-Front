export type ChannelKey =
  | "FL" | "FR" | "FC" | "LFE"
  | "SL" | "SR" | "BL" | "BR"
  | "FLC" | "FRC" | "BC"
  | "TFL" | "TFR" | "TBL" | "TBR"
  | "TSL" | "TSR"
  | "WL" | "WR"
  | "BFC" | "BFL" | "BFR"
  | "LFE2"

export type EqType = "peaking" | "lowshelf" | "highshelf" | "highpass" | "lowpass"

export type ApiEqBand = {
  "@channel"?: string
  "@cell": string
  "@EQon": "0" | "1"
  "@EQtype": string
  "@dblevel": string
  "@freq": string
  "@Q": string
}

export type EqBand = {
  id: string
  cell: number
  enabled: boolean
  type: EqType
  freq: number
  q: number
  gainDb: number
}

export type ApiEqPreset = Record<string, ApiEqBand[]>
export type EqPreset = Record<string, EqBand[]>

function uid(prefix = "band") {
  return `${prefix}_${crypto.randomUUID()}`
}

export function apiEqTypeToUi(eqType: number): EqType {
  if (eqType === 0) return "peaking"
  if (eqType === 3) return "lowpass"
  if (eqType === 4) return "highpass"
  if (eqType === 5) return "lowshelf"
  if (eqType === 6) return "highshelf"
  return "peaking"
}

export function uiEqTypeToApi(type: EqType): number {
  if (type === "peaking") return 0
  if (type === "lowpass") return 3
  if (type === "highpass") return 4
  if (type === "lowshelf") return 5
  if (type === "highshelf") return 6
  return 0
}

export function normalizeApiPreset(api: ApiEqPreset): EqPreset {
  const out: EqPreset = {}
  for (const [ch, arr] of Object.entries(api || {})) {
    out[ch] = (arr || []).map((b) => {
      const cell = Number(b["@cell"] ?? "1")
      const eqType = Number(b["@EQtype"] ?? "0")
      return {
        id: uid(`${ch}_c${cell}`),
        cell,
        enabled: (b["@EQon"] ?? "1") === "1",
        type: apiEqTypeToUi(eqType),
        freq: Number(b["@freq"] ?? "1000"),
        q: Number(b["@Q"] ?? "0.9"),
        gainDb: Number(b["@dblevel"] ?? "0")
      } satisfies EqBand
    }).sort((a, b) => a.cell - b.cell)
  }
  return out
}

export function exportToApiPreset(
  preset: EqPreset,
  channelOrder: string[],
  withChannelField = false
): ApiEqPreset {
  const out: ApiEqPreset = {}
  for (let i = 0; i < channelOrder.length; i++) {
    const ch = channelOrder[i]
    const chanNumber = String(i + 1)
    const bands = (preset[ch] || []).slice().sort((a, b) => a.cell - b.cell)

    out[ch] = bands.map((b) => {
      const apiBand: ApiEqBand = {
        "@cell": String(b.cell),
        "@EQon": b.enabled ? "1" : "0",
        "@EQtype": String(uiEqTypeToApi(b.type)),
        "@dblevel": String(b.gainDb),
        "@freq": String(b.freq),
        "@Q": String(b.q)
      }
      if (withChannelField) apiBand["@channel"] = chanNumber
      return apiBand
    })
  }
  return out
}

export function ensureChannel(preset: EqPreset, ch: string) {
  if (!preset[ch]) preset[ch] = []
}

export function ensure6Cells(preset: EqPreset, ch: string) {
  ensureChannel(preset, ch)
  const existing = new Map(preset[ch].map(b => [b.cell, b]))
  const arr: EqBand[] = []
  for (let cell = 1; cell <= 6; cell++) {
    const b = existing.get(cell)
    if (b) {
      arr.push(b)
    } else {
      arr.push({
        id: uid(`${ch}_c${cell}`),
        cell,
        enabled: true,
        type: "peaking",
        freq: 1000,
        q: 0.9,
        gainDb: 0
      })
    }
  }
  preset[ch] = arr
}
