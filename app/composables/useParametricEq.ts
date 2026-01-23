// composables/useParametricEq.ts
import { onBeforeUnmount, ref } from "vue"

export type EqBandType = "peaking" | "lowshelf" | "highshelf" | "highpass" | "lowpass"

export type EqBand = {
  id: string
  enabled: boolean
  type: EqBandType
  freq: number
  q: number
  gain: number
}

export type EqPreset = {
  version: 1
  name?: string
  bands: EqBand[]
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function useParametricEq() {
  const canPlay = ref(false)
  const isPlaying = ref(false)
  const error = ref("")

  const bands = ref<EqBand[]>([])

  let ctx: AudioContext | null = null
  let audioEl: HTMLAudioElement | null = null
  let srcNode: MediaElementAudioSourceNode | null = null
  let filterNodes: BiquadFilterNode[] = []
  let currentObjectUrl: string | null = null

  function ensureAudioGraph() {
    if (ctx) return

    ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    audioEl = new Audio()
    audioEl.crossOrigin = "anonymous"

    srcNode = ctx.createMediaElementSource(audioEl)
    rebuildChain()
  }

  function applyToNode(node: BiquadFilterNode, band: EqBand) {
    if (!band.enabled) {
      node.type = "peaking"
      node.frequency.value = 1000
      node.Q.value = 1
      node.gain.value = 0
      return
    }

    node.type = band.type
    node.frequency.value = clamp(band.freq, 20, 20000)
    node.Q.value = clamp(band.q, 0.1, 12)

    if (band.type === "peaking" || band.type === "lowshelf" || band.type === "highshelf") {
      node.gain.value = clamp(band.gain, -18, 18)
    } else {
      node.gain.value = 0
    }
  }

  function rebuildChain() {
    if (!ctx || !srcNode) return

    try { srcNode.disconnect() } catch {}
    filterNodes.forEach((n) => { try { n.disconnect() } catch {} })
    filterNodes = []

    filterNodes = bands.value.map((b) => {
      const f = ctx!.createBiquadFilter()
      applyToNode(f, b)
      return f
    })

    if (filterNodes.length === 0) {
      srcNode.connect(ctx.destination)
      return
    }

    srcNode.connect(filterNodes[0])
    for (let i = 0; i < filterNodes.length - 1; i++) {
      filterNodes[i].connect(filterNodes[i + 1])
    }
    filterNodes[filterNodes.length - 1].connect(ctx.destination)
  }

  function applyBand(i: number) {
    if (!ctx) return
    const band = bands.value[i]
    const node = filterNodes[i]
    if (!node) {
      rebuildChain()
      return
    }
    applyToNode(node, band)
  }

  function addBand(type: EqBandType) {
    error.value = ""
    ensureAudioGraph()

    const b: EqBand = {
      id: crypto.randomUUID(),
      enabled: true,
      type,
      freq: type === "highpass" ? 80 : type === "lowpass" ? 12000 : 1000,
      q: 0.9,
      gain: 0
    }

    bands.value.push(b)
    rebuildChain()
  }

  function removeBand(i: number) {
    bands.value.splice(i, 1)
    if (ctx) rebuildChain()
  }

  function resetEQ() {
    bands.value = []
    if (ctx) rebuildChain()
  }

  async function loadFile(file: File) {
    error.value = ""
    ensureAudioGraph()

    try { await ctx!.resume() } catch {}

    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = URL.createObjectURL(file)

    audioEl!.src = currentObjectUrl
    canPlay.value = true
    isPlaying.value = false
  }

  async function togglePlay() {
    error.value = ""
    if (!audioEl || !ctx) return

    try { await ctx.resume() } catch {}

    if (isPlaying.value) {
      audioEl.pause()
      isPlaying.value = false
      return
    }

    try {
      await audioEl.play()
      isPlaying.value = true
    } catch {
      error.value = "Impossible de lancer la lecture (autoplay/permissions). Clique Play à nouveau."
    }
  }

  // --- API preset (import/export) ---
  function exportPreset(name?: string): EqPreset {
    return {
      version: 1,
      name,
      bands: structuredClone(bands.value)
    }
  }

  function importPreset(preset: EqPreset) {
    if (!preset || preset.version !== 1 || !Array.isArray(preset.bands)) {
      throw new Error("Preset invalide")
    }
    bands.value = structuredClone(preset.bands)
    if (ctx) rebuildChain()
  }

  onBeforeUnmount(() => {
    try { audioEl?.pause() } catch {}
    try { srcNode?.disconnect() } catch {}
    filterNodes.forEach((n) => { try { n.disconnect() } catch {} })
    try { ctx?.close() } catch {}
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
  })

  return {
    // state
    canPlay, isPlaying, error, bands,

    // actions
    addBand, removeBand, resetEQ, applyBand,
    loadFile, togglePlay,

    // preset api
    exportPreset, importPreset,

    // low-level (si tu veux)
    rebuildChain,
  }
}
