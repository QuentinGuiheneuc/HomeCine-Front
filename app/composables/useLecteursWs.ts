import type { LecteurState } from '@/types/lecteur'

export function useLecteursWs() {
  const toast = useToast?.()
  const { public: { wsBase } } = useRuntimeConfig() as any

  const wsStatus = ref<'disconnected'|'connecting'|'connected'>('disconnected')
  const wsError = ref<string | null>(null)

  const stateById = ref<Record<number, LecteurState>>({})

  let ws: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const wsUrl = computed(() => `${wsBase}/lecteur`)

  function connect() {
    if (process.server) return
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
    if (timer) { clearTimeout(timer); timer = null }

    wsStatus.value = 'connecting'
    wsError.value = null

    try {
      ws = new WebSocket(wsUrl.value)
    } catch (e) {
      wsStatus.value = 'disconnected'
      wsError.value = 'Impossible de créer le WebSocket'
      schedule()
      return
    }

    ws.onopen = () => {
      wsStatus.value = 'connected'
      // Demande un état global
      ws!.send(JSON.stringify({ method: 'Gui.Lecteur.RequestAllState' }))
    }

    ws.onclose = () => { wsStatus.value = 'disconnected'; schedule() }
    ws.onerror = () => { wsError.value = 'Erreur WebSocket'; }
    ws.onmessage = (ev) => {
      let msg: any
      try { msg = JSON.parse(ev.data) } catch { return }

      // Exemple attendu:
      // { method: 'Lecteur.State', id: 2, data: {...} }
      if (msg.method === 'Lecteur.State' && typeof msg.id === 'number' && msg.data) {
        stateById.value = { ...stateById.value, [msg.id]: { id: msg.id, ...msg.data } }
        return
      }

      if (msg.method === 'Error') {
        toast?.add?.({ title: 'Erreur lecteur', description: msg.error || 'Erreur', color: 'red' })
      }
    }
  }

  function schedule() {
    if (timer) return
    timer = setTimeout(() => { timer = null; connect() }, 2000)
  }

  function send(method: string, payload: Record<string, any> = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast?.add?.({ title: 'WS non connecté', description: 'Commande non envoyée', color: 'red' })
      return
    }
    ws.send(JSON.stringify({ method, ...payload }))
  }

  function start(id: number)   { send('Lecteur.Start', { id }) }
  function stop(id: number)    { send('Lecteur.Stop', { id }) }
  function restart(id: number) { send('Lecteur.Restart', { id }) }

  onMounted(connect)
  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
    if (ws && ws.readyState === WebSocket.OPEN) ws.close()
  })

  return { wsStatus, wsError, stateById, connect, start, stop, restart }
}
