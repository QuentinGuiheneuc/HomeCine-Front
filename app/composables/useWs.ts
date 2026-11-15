/**
 * useWs — composable WebSocket générique
 *
 * Gère connexion, reconnexion automatique, parsing JSON,
 * multiple handlers, et cleanup onUnmounted.
 *
 * Usage :
 *   const { status, error, connect, disconnect, send, on } = useWs('ws://…/endpoint')
 *   const off = on(data => console.log(data))   // écoute les messages
 *   onMounted(connect)                           // connexion au montage
 */

export type WsStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface UseWsOptions {
  /** Reconnexion automatique après fermeture/erreur (défaut : true). Une fonction est réévaluée à chaque tentative. */
  reconnect?: boolean | (() => boolean)
  /** Délai entre deux tentatives de reconnexion en ms (défaut : 2000) */
  reconnectDelay?: number
  /** Appelé dès que la connexion est ouverte */
  onOpen?: (ws: WebSocket) => void
}

/**
 * La connexion elle-même, sans cycle de vie de composant : pour un socket
 * partagé au niveau module (cf. useDeviceControlWs). Dans un composant,
 * préférer `useWs`, qui la ferme au démontage.
 *
 * `url` peut être une fonction : elle est rappelée à chaque (re)connexion,
 * pour repartir avec le token courant (il voyage dans l'URL).
 */
export function createWs(url: MaybeRefOrGetter<string>, options: UseWsOptions = {}) {
  const { reconnect = true, reconnectDelay = 2000, onOpen } = options

  const status = ref<WsStatus>('idle')
  const error = ref<string | null>(null)

  const handlers = new Set<(data: any) => void>()
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  // ── Helpers internes ───────────────────────────────────────────────────────

  function clearTimer() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  }

  function scheduleReconnect() {
    if (reconnectTimer || !(typeof reconnect === 'function' ? reconnect() : reconnect)) return
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, reconnectDelay)
  }

  // ── API publique ───────────────────────────────────────────────────────────

  function connect() {
    if (!import.meta.client) return
    const resolvedUrl = toValue(url)
    if (!resolvedUrl) return
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return

    clearTimer()
    status.value = 'connecting'
    error.value = null

    try {
      ws = new WebSocket(resolvedUrl)
    } catch (e) {
      status.value = 'error'
      error.value = String(e)
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      status.value = 'connected'
      error.value = null
      onOpen?.(ws!)
    }

    ws.onmessage = (ev) => {
      let data: any
      try { data = JSON.parse(ev.data) } catch { data = ev.data }
      handlers.forEach(h => h(data))
    }

    ws.onerror = () => {
      status.value = 'error'
      error.value = 'Erreur WebSocket'
    }

    ws.onclose = () => {
      ws = null
      if (status.value !== 'idle') {
        status.value = 'disconnected'
        scheduleReconnect()
      }
    }
  }

  function disconnect() {
    clearTimer()
    status.value = 'idle'
    ws?.close()
    ws = null
  }

  /**
   * Envoie un message (objet sérialisé en JSON ou string brute).
   * @returns true si envoyé, false si le socket n'est pas ouvert
   */
  function send(data: object | string): boolean {
    if (ws?.readyState !== WebSocket.OPEN) return false
    ws.send(typeof data === 'string' ? data : JSON.stringify(data))
    return true
  }

  /**
   * Abonne un handler aux messages entrants.
   * @returns fonction de désabonnement
   */
  function on(handler: (data: any) => void): () => void {
    handlers.add(handler)
    return () => handlers.delete(handler)
  }

  return { status, error, connect, disconnect, send, on }
}

export function useWs(url: MaybeRefOrGetter<string>, options: UseWsOptions = {}) {
  const ws = createWs(url, options)
  onUnmounted(ws.disconnect)
  return ws
}
