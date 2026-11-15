import {
  SNAP_MSG, SNAP_HEADER_BYTES, readHeader, buildHello, buildTime,
  parseCodecHeader, parseWireChunk, rmsPerChannel, type SnapFormat
} from '@/utils/snapProtocol'
import { wsProxyUrl } from '@/utils/ws'

/**
 * useSnapStream — niveaux audio par canal, lus sur le flux Snapcast.
 *
 * Deux canaux, tous deux relayés par le back-end :
 *  - les ÉCHANTILLONS via `/snaplive`, qui ponte le port de flux de snapserver
 *    (1704, TCP brut, inatteignable depuis un navigateur). Passer par le pont
 *    apporte le JWT, le wss:// et une seule origine à ouvrir : le 1704 peut
 *    rester fermé de l'extérieur ;
 *  - le CONTRÔLE (lister les streams, router notre groupe) via `/Snap`
 *    (JSON-RPC, port 1780) — un fetch direct sur /jsonrpc serait de toute
 *    façon bloqué, snapserver n'envoyant aucun en-tête CORS.
 *
 * Rien n'est joué. Le PCM est mesuré directement ; le FLAC passe par
 * decodeAudioData, donc un AudioContext — mais il reste suspendu, aucun nœud
 * n'y est connecté, et aucun geste utilisateur n'est requis pour décoder.
 *
 * À la connexion, snapserver nous enregistre comme un client à part entière et
 * le range dans un groupe arbitraire — souvent un stream à l'arrêt. Sans
 * `Group.SetStream`, on ne reçoit donc aucun WireChunk.
 */

/** 1 trame sur N décodée en FLAC (chunk_ms=10 → ~20 rafraîchissements/s). */
const FLAC_DECODE_EVERY = 5

export type SnapStreamStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected'

/** Le peu qu'on lit de Server.GetStatus (le relais back-end peut enrober). */
interface SnapGroup { id: string, stream_id?: string, clients?: { id: string }[] }
interface SnapStatus {
  server?: { groups?: SnapGroup[] }
  result?: { server?: { groups?: SnapGroup[] } }
}

/** Un décodeur transforme une trame du flux en PCM 16 bits entrelacé. */
export interface SnapDecoder {
  decode(chunk: Uint8Array): Uint8Array | null
  channels: number
}

/** `pcm` : les WireChunk SONT déjà du PCM 16 bits, rien à faire. */
function pcmDecoder(format: SnapFormat): SnapDecoder {
  return { decode: chunk => chunk, channels: format.channels }
}

/** RMS par canal (dBFS) depuis un AudioBuffer décodé. Plancher à -60 dB. */
function rmsFromBuffer(buf: AudioBuffer): number[] {
  const out: number[] = []
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    let sum = 0
    for (let i = 0; i < d.length; i++) sum += d[i]! * d[i]!
    const rms = Math.sqrt(sum / d.length)
    out.push(rms > 0 ? Math.max(-60, 20 * Math.log10(rms)) : -60)
  }
  return out
}

export interface UseSnapStreamOptions {
  /** Stream à mesurer. Sans lui, on subit le groupe attribué par le serveur. */
  streamId?: MaybeRefOrGetter<string>
  /** JSON-RPC Snapcast, typiquement `useSnapWs().rpc` (relayé par le back-end). */
  rpc?: (method: string, params?: object) => Promise<unknown>
  /** dB/s de descente de la barre. Une chute instantanée rend le mètre illisible. */
  releaseDbPerSecond?: number
  /** Retarder l'affichage de `bufferMs` pour coller au son entendu (défaut : oui). */
  alignToPlayback?: boolean
}

export function useSnapStream(opts: UseSnapStreamOptions) {
  const { rpc, releaseDbPerSecond = 90, alignToPlayback = true } = opts

  const status = ref<SnapStreamStatus>('idle')
  const error = ref<string | null>(null)
  const format = ref<SnapFormat | null>(null)
  /** RMS lissé par canal, en dBFS (-60 = silence). */
  const levels = shallowRef<number[]>([])
  /** Identité de notre client côté snapserver — sert à retrouver notre groupe. */
  /* Snapcast reconnait un client par l'ID de son Hello. Un ID stable lui fait
     retrouver son volume et son groupe ; un ID aleatoire creait un client de
     plus a chaque connexion, qui s'accumulaient dans la liste. */
  const { user } = useCurrentUser()
  const clientId = `homecine-eq-meter-${user.value?.id ?? 'anon'}`

  let ws: WebSocket | null = null
  let decoder: SnapDecoder | null = null
  let timeTimer: ReturnType<typeof setInterval> | null = null
  let lastAt = 0
  let msgId = 1
  let routed = false

  /* Décodage FLAC : chaque WireChunk est un flux FLAC autonome, décodable tel
     quel par decodeAudioData — vérifié sur ce serveur, ~1,6 ms par trame.
     Contrairement à WebCodecs, AudioContext ne requiert pas de contexte
     sécurisé : ça marche aussi depuis un téléphone en HTTP simple. Rien n'est
     joué, le contexte reste suspendu et aucun nœud n'est connecté. */
  let audioCtx: AudioContext | null = null
  let decoding = false
  let seen = 0

  /* Snapcast envoie l'audio EN AVANCE : les clients le tamponnent `bufferMs`
     puis le jouent à l'heure dite, c'est ce qui les synchronise entre pièces.
     Afficher les niveaux à l'arrivée les ferait donc bouger ~1 s avant le son.
     On retarde l'affichage d'autant pour coller à ce qu'on entend. */
  const bufferMs = ref(0)
  const pending = new Set<ReturnType<typeof setTimeout>>()

  /** Publie les niveaux à l'instant où le son sera réellement joué. */
  function publish(next: number[]) {
    const delay = alignToPlayback ? bufferMs.value : 0
    if (delay <= 0) {
      applyBallistics(next)
      return
    }
    const t = setTimeout(() => {
      pending.delete(t)
      applyBallistics(next)
    }, delay)
    pending.add(t)
  }

  /**
   * Attaque immédiate, retour progressif : la barre doit coller au transitoire
   * et redescendre assez lentement pour rester lisible à l'œil.
   */
  function applyBallistics(next: number[]) {
    const now = performance.now()
    const dt = lastAt ? (now - lastAt) / 1000 : 0
    lastAt = now
    const floor = -60
    const maxFall = releaseDbPerSecond * dt

    const prev = levels.value
    levels.value = next.map((v, i) => {
      const old = prev[i] ?? floor
      return v >= old ? v : Math.max(v, old - maxFall)
    })
  }

  /**
   * Place notre client sur le stream demandé — sans ça, snapserver nous laisse
   * dans un groupe arbitraire (souvent un stream à l'arrêt) et aucun WireChunk
   * n'arrive jamais.
   *
   * Deux courses à absorber, d'où les reprises : le WebSocket JSON-RPC du
   * back-end peut ne pas être encore ouvert (`rpc` rejette aussitôt), et notre
   * client peut ne pas encore figurer dans Server.GetStatus juste après le
   * Hello. `routed` n'est posé qu'en cas de succès.
   */
  async function routeToStream(attempt = 0) {
    const wanted = toValue(opts.streamId)
    if (!rpc || !wanted || routed) return

    const retry = () => {
      if (attempt < 6) setTimeout(() => routeToStream(attempt + 1), 700)
      else error.value = 'Impossible de router le groupe Snapcast vers ce stream'
    }

    try {
      const st = await rpc('Server.GetStatus') as SnapStatus
      const groups = st?.server?.groups ?? st?.result?.server?.groups ?? []
      const g = groups.find(grp => grp.clients?.some(c => c.id === clientId))
      if (!g) {
        retry()
        return
      }
      if (g.stream_id !== wanted) await rpc('Group.SetStream', { id: g.id, stream_id: wanted })
      routed = true
    } catch {
      retry()
    }
  }

  function onBinary(data: ArrayBuffer) {
    if (data.byteLength < SNAP_HEADER_BYTES) return
    const head = readHeader(new DataView(data))
    const body = new DataView(data, SNAP_HEADER_BYTES)

    switch (head.type) {
      case SNAP_MSG.CodecHeader: {
        const f = parseCodecHeader(body)
        format.value = f
        if (f.codec === 'pcm') {
          decoder = pcmDecoder(f)
          error.value = null
        } else if (f.codec === 'flac') {
          decoder = null
          audioCtx ??= new AudioContext()
          error.value = null
        } else {
          decoder = null
          levels.value = []
          error.value = `Stream en « ${f.codec} » : seuls le PCM et le FLAC sont décodés. `
            + 'Choisis un autre stream, ou change son codec dans snapserver.conf.'
        }
        // Le client n'existe côté serveur qu'une fois le Hello accepté.
        void routeToStream()
        break
      }

      case SNAP_MSG.WireChunk: {
        const chunk = parseWireChunk(body)

        if (decoder) {
          const pcm = decoder.decode(chunk)
          if (pcm) publish(rmsPerChannel(pcm, decoder.channels))
          break
        }

        // FLAC : décoder chaque trame coûterait ~16 % de CPU à 100 trames/s.
        // Un mètre n'a pas besoin de plus de ~20 rafraîchissements par seconde,
        // et on saute tout net si un décodage est déjà en cours.
        if (!audioCtx || decoding) break
        if (++seen % FLAC_DECODE_EVERY !== 0) break
        decoding = true
        audioCtx.decodeAudioData(chunk.slice().buffer)
          .then(buf => publish(rmsFromBuffer(buf)))
          .catch(() => { /* trame tronquée : on attend la suivante */ })
          .finally(() => { decoding = false })
        break
      }

      case SNAP_MSG.ServerSettings: {
        // { bufferMs, latency, volume, muted } — seul le tampon nous intéresse.
        try {
          const len = body.getUint32(0, true)
          const json = new TextDecoder().decode(
            new Uint8Array(body.buffer, body.byteOffset + 4, len)
          )
          const cfg = JSON.parse(json) as { bufferMs?: number, latency?: number }
          bufferMs.value = Math.max(0, (cfg.bufferMs ?? 0) - (cfg.latency ?? 0))
        } catch { /* réglages illisibles : on affiche sans décalage */ }
        break
      }

      default:
        break
    }
  }

  function connect() {
    if (!import.meta.client) return
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

    status.value = 'connecting'
    error.value = null
    routed = false

    // URL reconstruite à chaque connexion : le token voyage en query et doit
    // être frais (cf. utils/ws.ts).
    const url = wsProxyUrl('snaplive')

    try {
      ws = new WebSocket(url)
    } catch {
      status.value = 'error'
      error.value = 'WebSocket impossible à créer'
      return
    }

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      status.value = 'connected'
      // snapserver n'envoie rien tant qu'il n'a pas été salué.
      ws?.send(buildHello(clientId))
      timeTimer = setInterval(() => ws?.send(buildTime(msgId++)), 1000)
    }

    ws.onmessage = (e: MessageEvent) => {
      if (e.data instanceof ArrayBuffer) {
        onBinary(e.data)
        return
      }
      // Le pont ne parle en texte que pour signaler un refus d'authentification.
      if (typeof e.data === 'string') {
        try {
          const msg = JSON.parse(e.data) as { method?: string, reason?: string }
          if (msg.method === 'SnapLive.AuthError') {
            status.value = 'error'
            error.value = `Authentification refusée par /snaplive (${msg.reason ?? 'token'})`
          }
        } catch { /* le pont n'envoie rien d'autre en texte */ }
      }
    }

    ws.onerror = () => {
      // L'événement error d'un WebSocket ne porte aucun détail exploitable.
      status.value = 'error'
      error.value = 'Connexion impossible au pont /snaplive'
    }

    ws.onclose = (e: CloseEvent) => {
      stopTimers()
      if (status.value === 'error') return
      status.value = e.code === 4000 ? 'idle' : 'disconnected'

      // 4000 = le meme utilisateur a ouvert /snaplive ailleurs. Se reconnecter
      // ferait se couper deux onglets a l'infini : on s'arrete et on le dit.
      if (e.code === 4000) {
        levels.value = []
        error.value = 'Écoute reprise sur un autre appareil'
      } else if (e.code === 1013) {
        error.value = e.reason || 'Flux interrompu : reconnecte-toi pour repartir en direct'
      } else if (e.code === 1008) {
        error.value = `Authentification refusée (${e.reason || 'token'})`
      } else if (e.code !== 1000) {
        error.value = e.reason || `Connexion fermée (code ${e.code})`
      }
    }
  }

  function stopTimers() {
    if (timeTimer) {
      clearInterval(timeTimer)
      timeTimer = null
    }
    decoder = null
  }

  function disconnect() {
    stopTimers()
    ws?.close()
    ws = null
    status.value = 'idle'
    levels.value = []
    format.value = null
    routed = false
    seen = 0
    decoding = false
    pending.forEach(clearTimeout)
    pending.clear()
    bufferMs.value = 0
    // Les navigateurs plafonnent le nombre d'AudioContext simultanés : on rend
    // celui-ci plutôt que de le laisser ouvert entre deux connexions.
    audioCtx?.close().catch(() => { /* déjà fermé */ })
    audioCtx = null
  }

  /** Changer de stream à chaud : on relance pour repartir sur un CodecHeader propre. */
  function restart() {
    disconnect()
    connect()
  }

  // Cibler un autre stream annule le routage acquis.
  watch(() => toValue(opts.streamId), () => {
    routed = false
  })

  onBeforeUnmount(disconnect)

  return { status, error, format, levels, bufferMs, clientId, connect, disconnect, restart }
}
