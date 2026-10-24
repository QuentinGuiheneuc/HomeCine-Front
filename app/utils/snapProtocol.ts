/**
 * Protocole binaire du flux audio Snapcast (snapserver, port HTTP 1780,
 * chemin /stream) — le même que celui parlé par snapweb.
 *
 * On n'implémente que ce qu'il faut pour LIRE le flux : dire bonjour, récupérer
 * le format dans le CodecHeader, puis consommer les WireChunk. La synchro
 * d'horloge (Time) est envoyée périodiquement car snapserver éjecte les clients
 * muets, mais son résultat ne nous sert pas : on mesure des niveaux, on ne joue
 * rien.
 *
 * Tous les entiers sont en little-endian.
 */

export const SNAP_MSG = {
  Base: 0,
  CodecHeader: 1,
  WireChunk: 2,
  ServerSettings: 3,
  Time: 4,
  Hello: 5
} as const

/** En-tête présent devant chaque message, dans les deux sens. */
export interface SnapHeader {
  type: number
  id: number
  refersTo: number
  sentSec: number
  sentUsec: number
  receivedSec: number
  receivedUsec: number
  size: number
}

export const SNAP_HEADER_BYTES = 26

export function readHeader(view: DataView, offset = 0): SnapHeader {
  return {
    type: view.getUint16(offset, true),
    id: view.getUint16(offset + 2, true),
    refersTo: view.getUint16(offset + 4, true),
    sentSec: view.getInt32(offset + 6, true),
    sentUsec: view.getInt32(offset + 10, true),
    receivedSec: view.getInt32(offset + 14, true),
    receivedUsec: view.getInt32(offset + 18, true),
    size: view.getUint32(offset + 22, true)
  }
}

function writeHeader(view: DataView, type: number, id: number, payloadSize: number) {
  const now = Date.now()
  view.setUint16(0, type, true)
  view.setUint16(2, id, true)
  view.setUint16(4, 0, true)
  view.setInt32(6, Math.floor(now / 1000), true)
  view.setInt32(10, (now % 1000) * 1000, true)
  view.setInt32(14, 0, true)
  view.setInt32(18, 0, true)
  view.setUint32(22, payloadSize, true)
}

/** Message applicatif = en-tête + `uint32` longueur + charge utile. */
function framed(type: number, id: number, body: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(SNAP_HEADER_BYTES + 4 + body.byteLength)
  const view = new DataView(buf)
  writeHeader(view, type, id, 4 + body.byteLength)
  view.setUint32(SNAP_HEADER_BYTES, body.byteLength, true)
  new Uint8Array(buf).set(body, SNAP_HEADER_BYTES + 4)
  return buf
}

/**
 * Message d'ouverture. snapserver enregistre l'appelant comme un CLIENT à part
 * entière : il apparaîtra dans la liste des clients et dans les groupes. D'où
 * un nom explicite, pour qu'on sache d'où vient ce client fantôme.
 */
export function buildHello(id: string, hostName = 'HomeCine-EQ-Meter'): ArrayBuffer {
  const hello = {
    MAC: '00:00:00:00:00:00',
    HostName: hostName,
    Version: '0.17.1',
    ClientName: 'HomeCine-EQ-Meter',
    OS: 'web',
    Arch: 'web',
    Instance: 1,
    ID: id,
    SnapStreamProtocolVersion: 2
  }
  return framed(SNAP_MSG.Hello, 0, new TextEncoder().encode(JSON.stringify(hello)))
}

/** Ping de synchro : le contenu importe peu, seule la régularité compte. */
export function buildTime(id: number): ArrayBuffer {
  const buf = new ArrayBuffer(SNAP_HEADER_BYTES + 8)
  const view = new DataView(buf)
  writeHeader(view, SNAP_MSG.Time, id, 8)
  view.setInt32(SNAP_HEADER_BYTES, 0, true)
  view.setInt32(SNAP_HEADER_BYTES + 4, 0, true)
  return buf
}

/** Format audio annoncé par le CodecHeader. */
export interface SnapFormat {
  codec: string
  channels: number
  sampleRate: number
  bitsPerSample: number
  /** En-tête propre au codec (STREAMINFO pour FLAC) — à passer au décodeur. */
  header: Uint8Array
}

/**
 * CodecHeader : `uint32` len + nom du codec, puis `uint32` len + charge utile.
 *
 * En `pcm`, cette charge utile est un en-tête WAV de 44 octets : on y lit
 * directement le nombre de canaux, ce qui donne les 8 canaux d'un 7.1 et pas
 * le stéréo par défaut. Pour les codecs compressés, le format réel n'est connu
 * qu'après décodage — d'où les valeurs à 0 laissées au décodeur.
 */
export function parseCodecHeader(payload: DataView): SnapFormat {
  let off = 0
  const codecLen = payload.getUint32(off, true)
  off += 4
  const codec = new TextDecoder().decode(
    new Uint8Array(payload.buffer, payload.byteOffset + off, codecLen)
  )
  off += codecLen

  const headerLen = payload.getUint32(off, true)
  off += 4
  const header = new Uint8Array(payload.buffer, payload.byteOffset + off, headerLen)

  if (codec === 'pcm' && headerLen >= 36) {
    const wav = new DataView(header.buffer, header.byteOffset, header.byteLength)
    return {
      codec,
      channels: wav.getUint16(22, true),
      sampleRate: wav.getUint32(24, true),
      bitsPerSample: wav.getUint16(34, true),
      header
    }
  }

  // FLAC : le bloc STREAMINFO suit « fLaC » (4 o) + l'en-tête de bloc (4 o).
  // Les champs sont alignés sur des bits, pas sur des octets : débit sur 20
  // bits, puis canaux sur 3 (codés -1) et profondeur sur 5 (idem). Le format
  // est ainsi connu sans décoder une seule trame.
  if (codec === 'flac' && headerLen >= 42) {
    const b = header
    const o = 8
    return {
      codec,
      sampleRate: (b[o + 10]! << 12) | (b[o + 11]! << 4) | (b[o + 12]! >> 4),
      channels: ((b[o + 12]! >> 1) & 0x07) + 1,
      bitsPerSample: (((b[o + 12]! & 1) << 4) | (b[o + 13]! >> 4)) + 1,
      header
    }
  }

  return { codec, channels: 0, sampleRate: 0, bitsPerSample: 0, header }
}

/** WireChunk : timestamp (sec, usec) puis `uint32` len + échantillons encodés. */
export function parseWireChunk(payload: DataView): Uint8Array {
  const size = payload.getUint32(8, true)
  return new Uint8Array(payload.buffer, payload.byteOffset + 12, size)
}

/**
 * RMS par canal, en dBFS, sur du PCM 16 bits entrelacé.
 *
 * Le RMS (et non le crête) parce qu'un VU-mètre doit suivre l'énergie perçue :
 * une crête isolée ferait sauter la barre sans que le canal soit audible.
 * Plancher à -60 dB pour éviter -Infinity sur un canal silencieux.
 */
export function rmsPerChannel(pcm: Uint8Array, channels: number): number[] {
  if (channels <= 0) return []
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  const frames = Math.floor(samples.length / channels)
  const sums = new Float64Array(channels)

  for (let f = 0; f < frames; f++) {
    const base = f * channels
    for (let c = 0; c < channels; c++) {
      const v = samples[base + c]! / 32768
      sums[c]! += v * v
    }
  }

  const out: number[] = []
  for (let c = 0; c < channels; c++) {
    const rms = frames ? Math.sqrt(sums[c]! / frames) : 0
    out.push(rms > 0 ? Math.max(-60, 20 * Math.log10(rms)) : -60)
  }
  return out
}
