import { createWs } from './useWs'
import { wsProxyUrl } from '@/utils/ws'
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
let _refCount = 0
// L'URL est recalculée à chaque connexion (token courant) ; la reconnexion
// automatique ne tourne que tant qu'un composant utilise le socket.
const _ws = createWs(() => wsProxyUrl('controlOfDevice'), { reconnect: () => _refCount > 0 })

// ── Composable public ────────────────────────────────────────────────────────
export function useDeviceControlWs() {
  /**
   * Envoie une commande vers le serveur.
   * @returns true si envoyée, false si le socket n'est pas ouvert
   */
  const send = (method: string, params: object = {}) => _ws.send({ method, ...params })

  onMounted(() => {
    _refCount++
    if (_refCount === 1) _ws.connect()
  })

  onUnmounted(() => {
    _refCount = Math.max(0, _refCount - 1)
    if (_refCount === 0) _ws.disconnect()
  })

  return {
    status: readonly(_ws.status),
    error: readonly(_ws.error),
    send,
    /** Abonne un handler aux messages entrants ; renvoie la fonction de désabonnement (à appeler dans onUnmounted). */
    on: _ws.on,
    /** Ouvre la connexion si elle ne l'est pas déjà (idempotent, guardé). */
    connect: _ws.connect
  }
}
