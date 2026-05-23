import type { LecteurState, HeartbeatEntry, QueueItem, RepeatMode } from '@/types/lecteur'
import appConfig from '@/src/config'

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
 */
export function useLecteursWs() {
  const toast = useToast()

  const lecteursById = ref<Record<number, LecteurState>>({})
  const queuesById   = ref<Record<number, QueueItem[]>>({})

  const { status: wsStatus, error: wsError, connect, send, on } = useWs(
    `${appConfig.WS_URL}/lecteur-live`,
    {
      reconnect: true,
      reconnectDelay: 2000,
      onOpen: (ws) => {
        ws.send(JSON.stringify({ method: 'Lecteur.GetState' }))
      }
    }
  )

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

  onMounted(connect)

  return {
    wsStatus,
    wsError,
    lecteursById,
    queuesById,
    lecteurs,
    connect,
    cmd,

    getState:       ()                                              => cmd('Lecteur.GetState'),
    getQueue:  (id: number | null | undefined)                 => withId('Lecteur.GetQueue',  id),
    play:      (id: number | null | undefined, uri?: string)   => withId('Lecteur.Play',       id, uri ? { uri } : {}),
    pause:     (id: number | null | undefined)                 => withId('Lecteur.Pause',      id),
    resume:    (id: number | null | undefined)                 => withId('Lecteur.Resume',     id),
    next:      (id: number | null | undefined)                 => withId('Lecteur.Next',       id),
    prev:      (id: number | null | undefined)                 => withId('Lecteur.Prev',       id),
    setVolume: (id: number | null | undefined, value = 50)     => withId('Lecteur.SetVolume',  id, { value }),
    getVolume: (id: number | null | undefined)                 => lecteursById.value[id]?.volume ?? null,
    seek:      (id: number | null | undefined, position_ms = 0) => withId('Lecteur.Seek',     id, { position_ms }),

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
      withId('Lecteur.TogglePlayPause', id)
      return cmd('Lecteur.Play', { id })
    }
  }
}
