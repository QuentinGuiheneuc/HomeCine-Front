export type EqType = "peaking" | "lowshelf" | "highshelf" | "highpass" | "lowpass"

export type ApiCell = {
  "@cell": string
  "@EQon": string
  "@EQtype": string
  "@dblevel": string
  "@freq": string
  "@Q": string
  "@channel"?: string
}

export type UiBand = {
  id: string
  cell: number
  enabled: boolean
  type: EqType
  freq: number
  q: number
  gainDb: number
}

export function apiTypeToUi(t: number): EqType {
  if (t === 3) return "lowpass"
  if (t === 4) return "highpass"
  if (t === 5) return "lowshelf"
  if (t === 6) return "highshelf"
  return "peaking"
}

export function uiTypeToApi(t: EqType): number {
  if (t === "lowpass") return 3
  if (t === "highpass") return 4
  if (t === "lowshelf") return 5
  if (t === "highshelf") return 6
  return 0
}

export function apiCellsToBands(cells: ApiCell[]): UiBand[] {
  return [...cells]
    .sort((a, b) => Number(a["@cell"]) - Number(b["@cell"]))
    .map((c) => ({
      id: crypto.randomUUID(),
      cell: Number(c["@cell"]),
      enabled: c["@EQon"] === "1" && Number(c["@freq"]) > 0,
      type: apiTypeToUi(Number(c["@EQtype"])),
      freq: Number(c["@freq"]) || 1000,
      q: Number(c["@Q"]) || 0.707,
      gainDb: Number(c["@dblevel"]) || 0
    }))
}

export function bandsToApiCells(bands: UiBand[], channel?: string): ApiCell[] {
  return [...bands]
    .sort((a, b) => a.cell - b.cell)
    .map((b) => ({
      "@cell": String(b.cell),
      "@EQon": b.enabled ? "1" : "0",
      "@EQtype": String(uiTypeToApi(b.type)),
      "@dblevel": String(b.gainDb ?? 0),
      "@freq": String(b.freq ?? 0),
      "@Q": String(b.q ?? 0.707),
      ...(channel ? { "@channel": channel } : {})
    }))
}

export type CurvePoint = { f: number; db: number }

function logspace(n: number, fMin: number, fMax: number) {
  const out = new Float32Array(n)
  const a = Math.log10(fMin)
  const b = Math.log10(fMax)
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    out[i] = Math.pow(10, a + (b - a) * t)
  }
  return out
}

export async function computeEqCurveWebAudio(
  bands: UiBand[],
  fs: number,
  points = 256,
  fMin = 20,
  fMax = 20000
): Promise<CurvePoint[]> {
  if (typeof window === "undefined") return []

  const sr = Math.max(8000, Math.min(192000, Math.round(fs || 48000)))
  const maxF = Math.min(fMax, sr / 2 - 1)
  const freqs = logspace(points, fMin, Math.max(fMin + 1, maxF))

  const octx = new OfflineAudioContext(1, 1, sr)
  const acc = new Float32Array(points).fill(1)
  const mag = new Float32Array(points)
  const phase = new Float32Array(points)

  const active = bands.filter(b => b.enabled && b.freq > 0)

  if (!active.length) {
    return Array.from(freqs).map(f => ({ f, db: 0 }))
  }

  for (const b of active) {
    const node = octx.createBiquadFilter()
    node.type = b.type
    node.frequency.value = Math.max(20, Math.min(20000, b.freq))
    node.Q.value = Math.max(0.1, Math.min(63, b.q))

    if (b.type === "peaking" || b.type === "lowshelf" || b.type === "highshelf") {
      node.gain.value = Math.max(-36, Math.min(18, b.gainDb))
    } else {
      node.gain.value = 0
    }

    node.getFrequencyResponse(freqs, mag, phase)
    for (let i = 0; i < points; i++) acc[i] *= mag[i]
  }

  const out: CurvePoint[] = []
  for (let i = 0; i < points; i++) {
    const m = Math.max(1e-9, acc[i])
    out.push({ f: freqs[i], db: 20 * Math.log10(m) })
  }
  return out
}
