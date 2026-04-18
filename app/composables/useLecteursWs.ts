import type { LecteurState } from '@/types/lecteur'

/**
 * useLecteursWs — états temps réel des lecteurs via WebSocket
 *
 * Endpoint : ws://.../lecteur
 * Protocol : JSON { method, id?, data?, error? }
 *
 * Usage :
 *   const { wsStatus, wsError, stateById, start, stop, restart } = useLecteursWs()
 *   // stateById est mis à jour automatiquement par les messages Lecteur.State
 */
export function useLecteursWs() {
  const toast = useToast()
  const { public: { wsBase } } = useRuntimeConfig() as any

  const stateById = ref<Record<number, LecteurState>>({})

  const { status: wsStatus, error: wsError, connect, send, on } = useWs(
    `${wsBase}/lecteur`,
    {
      reconnect: true,
      reconnectDelay: 2000,
      onOpen: (ws) => {
        ws.send(JSON.stringify({ method: 'Gui.Lecteur.RequestAllState' }))
      }
    }
  )

  on((msg) => {
    if (msg?.method === 'Lecteur.State' && typeof msg.id === 'number' && msg.data) {
      stateById.value = { ...stateById.value, [msg.id]: { id: msg.id, ...msg.data } }
      return
    }
    if (msg?.method === 'Error') {
      toast.add({ title: 'Erreur lecteur', description: msg.error || 'Erreur inconnue', color: 'error' })
    }
  })

  function sendCmd(method: string, params: object = {}) {
    const ok = send({ method, ...params })
    if (!ok) toast.add({ title: 'WebSocket non connecté', description: 'Commande non envoyée', color: 'error' })
  }

  const start   = (id: number) => sendCmd('Lecteur.Start',   { id })
  const stop    = (id: number) => sendCmd('Lecteur.Stop',    { id })
  const restart = (id: number) => sendCmd('Lecteur.Restart', { id })

  onMounted(connect)

  return { wsStatus, wsError, stateById, connect, start, stop, restart }
}
