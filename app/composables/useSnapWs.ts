/**
 * useSnapWs — WebSocket Snapcast (JSON-RPC avec suivi des réponses par id)
 *
 * Endpoint : ws://.../Snap
 * Protocol : JSON-RPC 2.0 — les requêtes ont un id, les réponses le retournent
 *
 * Usage :
 *   const { status, rpc, on } = useSnapWs()
 *   onMounted(connect)
 *
 *   // Appel RPC (retourne une Promise résolue avec la réponse)
 *   const result = await rpc('Server.GetStatusLocal')
 *
 *   // Écouter les notifications serveur (sans id)
 *   const off = on(msg => { if (msg.method === 'Client.OnVolumeChanged') ... })
 *   onUnmounted(off)
 */

type PendingCallback = (result: any, error: any) => void

export function useSnapWs() {
  const { public: { wsBase } } = useRuntimeConfig() as any

  let _rpcId = 0
  const _pending = new Map<number, PendingCallback>()
  const _notifHandlers = new Set<(data: any) => void>()

  const { status, error, connect, disconnect, send, on } = useWs(
    `${wsBase}/Snap`,
    { reconnect: true, reconnectDelay: 2000 }
  )

  // Dispatch : réponses aux requêtes (avec id) vs notifications serveur (sans id)
  on((msg) => {
    if (typeof msg?.id === 'number' && _pending.has(msg.id)) {
      const cb = _pending.get(msg.id)!
      _pending.delete(msg.id)
      cb(msg.result ?? null, msg.error ?? null)
      return
    }
    // Notification serveur (Client.OnVolumeChanged, Client.OnConnect, etc.)
    _notifHandlers.forEach(h => h(msg))
  })

  /**
   * Envoie un appel JSON-RPC et retourne une Promise avec la réponse.
   * @param method — ex. 'Server.GetStatusLocal'
   * @param params — paramètres optionnels
   * @param timeout — délai max en ms (défaut 5000)
   */
  function rpc(method: string, params: object = {}, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++_rpcId
      const timer = setTimeout(() => {
        _pending.delete(id)
        reject(new Error(`Timeout RPC ${method} #${id}`))
      }, timeout)

      _pending.set(id, (result, error) => {
        clearTimeout(timer)
        if (error) reject(error)
        else resolve(result)
      })

      const ok = send({ jsonrpc: '2.0', id, method, params })
      if (!ok) {
        clearTimeout(timer)
        _pending.delete(id)
        reject(new Error('WebSocket non connecté'))
      }
    })
  }

  /**
   * Écoute les notifications serveur (messages sans id).
   * @returns fonction de désabonnement
   */
  function onNotif(handler: (data: any) => void): () => void {
    _notifHandlers.add(handler)
    return () => _notifHandlers.delete(handler)
  }

  return { status, error, connect, disconnect, send, rpc, onNotif }
}
