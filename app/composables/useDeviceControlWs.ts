import type { WsStatus } from './useWs'

/**
 * useDeviceControlWs — WebSocket singleton pour le contrôle des appareils
 *
 * Endpoint : ws://.../controlOfDevice
 *
 * Singleton : une seule connexion WS est ouverte pour toute l'application,
 * quel que soit le nombre de composants qui appellent ce composable.
 * La connexion s'ouvre quand le premier composant est monté,
 * et se ferme quand le dernier est démonté.
 *
 * Usage :
 *   const { status, send, on } = useDeviceControlWs()
 *
 *   // Écouter les messages
 *   const off = on(msg => { if (msg.method === 'State.audio') ... })
 *   onUnmounted(off)
 *
 *   // Envoyer une commande
 *   send('Set.output.volume', { deviceId: 1, channel: 0, value: 80 })
 */

// ── État module-level (singleton) ────────────────────────────────────────────
const _status = ref<WsStatus>('idle')
const _error = ref<string | null>(null)
const _handlers = new Set<(data: any) => void>()

let _ws: WebSocket | null = null
let _refCount = 0
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null
let _wsBase = ''

function _clearTimer() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
}

function _scheduleReconnect() {
  if (_reconnectTimer) return
  _reconnectTimer = setTimeout(() => { _reconnectTimer = null; _connect() }, 2000)
}

function _connect() {
  if (!import.meta.client) return
  if (!_wsBase) return
  if (_ws?.readyState === WebSocket.OPEN || _ws?.readyState === WebSocket.CONNECTING) return

  _clearTimer()
  _status.value = 'connecting'
  _error.value = null

  try {
    _ws = new WebSocket(`${_wsBase}/controlOfDevice`)
  } catch (e) {
    _status.value = 'error'
    _error.value = String(e)
    _scheduleReconnect()
    return
  }

  _ws.onopen = () => {
    _status.value = 'connected'
    _error.value = null
  }

  _ws.onmessage = (ev) => {
    let data: any
    try { data = JSON.parse(ev.data) } catch { data = ev.data }
    _handlers.forEach(h => h(data))
  }

  _ws.onerror = () => {
    _status.value = 'error'
    _error.value = 'Erreur WebSocket controlOfDevice'
  }

  _ws.onclose = () => {
    _ws = null
    if (_status.value !== 'idle') {
      _status.value = 'disconnected'
      if (_refCount > 0) _scheduleReconnect()
    }
  }
}

function _disconnect() {
  _clearTimer()
  _status.value = 'idle'
  _ws?.close()
  _ws = null
}

// ── Composable public ────────────────────────────────────────────────────────
export function useDeviceControlWs() {
  const { public: { wsBase } } = useRuntimeConfig() as any
  _wsBase = wsBase || 'ws://192.168.1.40:8099'

  /**
   * Envoie une commande vers le serveur.
   * @returns true si envoyée, false si le socket n'est pas ouvert
   */
  function send(method: string, params: object = {}): boolean {
    if (_ws?.readyState !== WebSocket.OPEN) return false
    _ws.send(JSON.stringify({ method, ...params }))
    return true
  }

  /**
   * Abonne un handler aux messages entrants.
   * @returns fonction de désabonnement (à appeler dans onUnmounted)
   */
  function on(handler: (data: any) => void): () => void {
    _handlers.add(handler)
    return () => _handlers.delete(handler)
  }

  onMounted(() => {
    _refCount++
    if (_refCount === 1) _connect()
  })

  onUnmounted(() => {
    _refCount = Math.max(0, _refCount - 1)
    if (_refCount === 0) _disconnect()
  })

  return {
    status: readonly(_status),
    error: readonly(_error),
    send,
    on
  }
}
