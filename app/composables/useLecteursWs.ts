import { createSharedComposable } from '@vueuse/core'
import type { LecteurState, HeartbeatEntry, QueueItem, RepeatMode } from '@/types/lecteur'
import { wsProxyUrl } from '@/utils/ws'
import { refreshAccessToken } from '@/src/lib/https'

/**
 * useLecteursWs — états temps réel des lecteurs via WebSocket
 *
 * Endpoint : ws://.../lecteur-live
 *
 * Messages reçus :
 *   Lecteur.Init      → { lecteurs: LecteurState[] }
 *   Lecteur.Update    → { id, data: LecteurState }
 *   Lecteur.Heartbeat → { lecteurs: HeartbeatEntry[] }   (chaque seconde)
 *   Lecteur.Queue     → { id, queue: QueueItem[] }
 *   Lecteur.Error     → { id?, error }
 *
 * Commandes envoyées :
 *   Lecteur.GetState | Lecteur.GetQueue | Lecteur.Play | Lecteur.Pause
 *   Lecteur.Resume   | Lecteur.Next     | Lecteur.Prev | Lecteur.SetVolume
 *   Lecteur.Seek
 *
 * Partagé (createSharedComposable) : une seule connexion + un seul état pour
 * toute l'app (player, slideovers, pages…).
 */
function _useLecteursWs() {
  const toast = useToast()

  const lecteursById = ref<Record<number, LecteurState>>({})
  const queuesById   = ref<Record<number, QueueItem[]>>({})
  const likeById     = ref<Record<number, { sourceId?: string; like: boolean }>>({})

  // URL en ref : après un refresh on la reconstruit pour que la reconnexion
  // reparte avec le token frais (le token voyage en ?token=)
  const wsUrl = ref(wsProxyUrl('lecteur-live'))

  const { status: wsStatus, error: wsError, connect, send, on } = useWs(
    wsUrl,
    {
      reconnect: true,
      reconnectDelay: 2000,
      onOpen: (ws) => {
        ws.send(JSON.stringify({ method: 'Lecteur.GetState' }))
      }
    }
  )

  /* ── Auth socket : Lecteur.AuthError → /refresh → Lecteur.Auth ─────────── */
  let authRetries = 0
  let refreshing  = false

  /**
   * Traite {"method":"Lecteur.AuthError","reason":"expired"} :
   * rafraîchit le token (refresh partagé avec axios), reconstruit l'URL du socket
   * (le token voyage en ?token=) puis renvoie Lecteur.Auth sur la même socket.
   * Si la socket a été fermée par le serveur, on reconnecte avec le token frais.
   */
  async function onAuthError(reason?: string) {
    if (!import.meta.client || refreshing) return
    if (authRetries >= 3) {                       // garde anti-boucle
      toast.add({ title: "Session expirée", description: "Reconnectez-vous.", color: "error" })
      return
    }
    authRetries++
    refreshing = true
    try {
      const token = await refreshAccessToken()    // pose le cookie TOKEN
      if (!token) {                               // refresh KO → session morte
        toast.add({ title: "Session expirée", description: reason ?? "Reconnectez-vous.", color: "error" })
        return
      }
      wsUrl.value = wsProxyUrl("lecteur-live")    // prochaine (re)connexion = token frais
      const sent = send({ method: "Lecteur.Auth", token })
      if (!sent) connect()                        // socket fermée → reconnexion
    } finally { refreshing = false }
  }

  on((msg) => {
    switch (msg?.method) {
      case 'Lecteur.Init': {
        if (!Array.isArray(msg.lecteurs)) break
        const map: Record<number, LecteurState> = {}
        const queues: Record<number, QueueItem[]> = { ...queuesById.value }
        for (const l of msg.lecteurs) {
          map[l.id] = l
          if (Array.isArray(l.queue)) queues[l.id] = l.queue
        }
        lecteursById.value = map
        queuesById.value   = queues
        break
      }

      case 'Lecteur.Update': {
        if (typeof msg.id !== 'number' || !msg.data) break
        const data = msg.data as LecteurState
        lecteursById.value = { ...lecteursById.value, [msg.id]: data }
        if (Array.isArray(data.queue)) queuesById.value = { ...queuesById.value, [msg.id]: data.queue }
        break
      }

      case 'Lecteur.Heartbeat': {
        if (!Array.isArray(msg.lecteurs)) break
        const updated = { ...lecteursById.value }
        for (const entry of msg.lecteurs as HeartbeatEntry[]) {
          if (updated[entry.id]) {
            updated[entry.id] = {
              ...updated[entry.id],
              alive:           entry.alive,
              playing:         entry.playing,
              paused:          entry.paused,
              temp:            entry.temp,
              volume:          entry.volume          ?? updated[entry.id].volume,
              device_type:     entry.device_type     ?? updated[entry.id].device_type,
              supports_volume: entry.supports_volume ?? updated[entry.id].supports_volume,
            }
          }
        }
        lecteursById.value = updated
        break
      }

      case 'Lecteur.Queue': {
        if (typeof msg.id !== 'number' || !Array.isArray(msg.queue)) break
        queuesById.value = { ...queuesById.value, [msg.id]: msg.queue as QueueItem[] }
        break
      }

      case 'Lecteur.Like': {
        if (typeof msg.id !== 'number') break
        likeById.value = { ...likeById.value, [msg.id]: { sourceId: msg.sourceId, like: !!msg.like } }
        break
      }

      case 'Lecteur.AuthError': {
        onAuthError(msg.reason)   // reason: 'expired' → refresh puis Lecteur.Auth
        break
      }

      case 'Lecteur.Auth': {
        // Auth acceptée → on peut réinitialiser le compteur
        if (msg.ok !== false) authRetries = 0
        break
      }

      case 'Lecteur.Error': {
        toast.add({
          title: `Erreur lecteur${msg.id != null ? ` #${msg.id}` : ''}`,
          description: msg.error || 'Erreur inconnue',
          color: 'error'
        })
        break
      }
    }
  })

  /* ── Helpers commandes ──────────────────────────────────────────────────── */

  function cmd(method: string, params: object = {}) {
    const ok = send({ method, ...params })
    if (!ok) toast.add({ title: 'WebSocket non connecté', description: 'Commande non envoyée', color: 'error' })
    return ok
  }

  function withId(method: string, id: number | null | undefined, extra: object = {}) {
    if (id == null) {
      toast.add({ title: 'Aucun lecteur sélectionné', description: 'Choisissez un lecteur principal', color: 'warning' })
      return false
    }
    return cmd(method, { id, ...extra })
  }

  const lecteurs = computed(() => Object.values(lecteursById.value))

  // Composable partagé → pas de contexte de composant : on connecte directement (client)
  if (import.meta.client) connect()

  return {
    wsStatus,
    wsError,
    lecteursById,
    queuesById,
    likeById,
    lecteurs,
    connect,
    cmd,

    getState:       ()                                              => cmd('Lecteur.GetState'),
    getQueue:  (id: number | null | undefined)                 => withId('Lecteur.GetQueue',  id),
    /** Bascule le like de la piste courante (auth via ?token= du handshake) */
    toggleLike: (id: number | null | undefined)                => withId('Lecteur.ToggleLike', id),
    /** Demande l'état du like (réponse Lecteur.Like) */
    getLike:    (id: number | null | undefined)                => withId('Lecteur.GetLike',    id),
    play:      (id: number | null | undefined, uri?: string)   => withId('Lecteur.Play',       id, uri ? { uri } : {}),
    pause:     (id: number | null | undefined)                 => withId('Lecteur.Pause',      id),
    resume:    (id: number | null | undefined)                 => withId('Lecteur.Resume',     id),
    next:      (id: number | null | undefined)                 => withId('Lecteur.Next',       id),
    prev:      (id: number | null | undefined)                 => withId('Lecteur.Prev',       id),
    setVolume: (id: number | null | undefined, value = 50)     => withId('Lecteur.SetVolume',  id, { value }),
    getVolume: (id: number | null | undefined)                 => lecteursById.value[id]?.volume ?? null,
    seek:      (id: number | null | undefined, position_ms = 0) => withId('Lecteur.Seek',     id, { position_ms }),

    // ── Gestion de queue FilePlayer (cf. API.md FilePlayer) ──────────────────
    /** Remplace toute la queue et démarre la lecture */
    setQueue:        (id: number | null | undefined, files: string[]) => withId('Lecteur.SetQueue',        id, { files }),
    /** Ajoute des fichiers en fin de queue (démarre si arrêté) */
    addToQueue:      (id: number | null | undefined, files: string[]) => withId('Lecteur.AddToQueue',      id, { files }),
    /** Retire l'élément à l'index donné */
    removeFromQueue: (id: number | null | undefined, index: number)   => withId('Lecteur.RemoveFromQueue', id, { index }),
    /** Déplace un élément de la queue (from → to) sans couper la lecture */
    moveInQueue:     (id: number | null | undefined, from: number, to: number) => withId('Lecteur.MoveInQueue', id, { from, to }),
    /** Vide entièrement la file (FilePlayer / YouTube / Deezer) */
    clearQueue:      (id: number | null | undefined)                  => withId('Lecteur.ClearQueue',      id),
    /** Télécharge une piste (YouTube) via le lecteur — { videoId, format } */
    download:        (id: number | null | undefined, videoId: string, format = 'best') => withId('Lecteur.Download', id, { videoId, format }),

    /** Active/désactive le shuffle */
    toggleShuffle(id: number | null | undefined) {
      if (id == null) {
        toast.add({ title: 'Aucun lecteur sélectionné', color: 'warning' })
        return false
      }
      const current = lecteursById.value[id]?.shuffle ?? false
      return cmd('Lecteur.SetShuffle', { id, value: !current })
    },

    /** Cycle repeat : off → context → track → off */
    cycleRepeat(id: number | null | undefined) {
      if (id == null) {
        toast.add({ title: 'Aucun lecteur sélectionné', color: 'warning' })
        return false
      }
      const current: RepeatMode = lecteursById.value[id]?.repeat ?? 'off'
      const next: RepeatMode    = current === 'off' ? 'context' : current === 'context' ? 'track' : 'off'
      return cmd('Lecteur.SetRepeat', { id, value: next })
    },

    /** Bascule play ↔ pause/resume selon l'état actuel du lecteur */
    togglePlayPause(id: number | null | undefined) {
      if (id == null) {
        toast.add({ title: 'Aucun lecteur sélectionné', color: 'warning' })
        return false
      }
      // withId('Lecteur.TogglePlayPause', id)
      return cmd('Lecteur.TogglePlayPause', { id })
    }
  }
}

export const useLecteursWs = createSharedComposable(_useLecteursWs)
