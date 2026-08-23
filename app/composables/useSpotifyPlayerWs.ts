/**
 * useSpotifyPlayerWs — composable singleton
 *
 * Reçoit l'état du player Spotify via WebSocket (ws://.../spotify-player).
 * Une seule connexion partagée entre tous les composants.
 * Reconnexion automatique en cas de déconnexion.
 */

import { wsProxyUrl } from '@/utils/ws'

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Image   = { url: string; width: number; height: number }
type Artist  = { id: string; name: string }
type Album   = { id: string; name: string; images: Image[] }

export type SpotifyDevice = {
  id: string
  is_active: boolean
  is_private_session: boolean
  is_restricted: boolean
  name: string
  type: string
  volume_percent: number
  supports_volume: boolean
}

export type SpotifyTrack = {
  id: string
  name: string
  duration_ms: number
  uri: string
  artists: Artist[]
  album: Album
}

export type SpotifyPlayerState = {
  device: SpotifyDevice
  shuffle_state: boolean
  smart_shuffle?: boolean
  repeat_state: 'off' | 'context' | 'track'
  is_playing: boolean
  progress_ms: number
  timestamp: number
  item: SpotifyTrack | null
  currently_playing_type: 'track' | string
}

/* ── Singleton (état partagé entre tous les composants) ─────────────────────── */

const playerState  = ref<SpotifyPlayerState | null>(null)
const wsStatus     = ref<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle')

let _ws: WebSocket | null = null
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null
const RECONNECT_DELAY = 3000

function _getUrl() {
  return wsProxyUrl('spotify-player')
}

function _clearTimer() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
}

function _scheduleReconnect() {
  if (_reconnectTimer) return
  _reconnectTimer = setTimeout(() => { _reconnectTimer = null; connectPlayerWs() }, RECONNECT_DELAY)
}

export function connectPlayerWs() {
  if (!import.meta.client) return
  if (_ws?.readyState === WebSocket.OPEN || _ws?.readyState === WebSocket.CONNECTING) return

  _clearTimer()
  wsStatus.value = 'connecting'

  try {
    _ws = new WebSocket(_getUrl())
  } catch (e) {
    wsStatus.value = 'error'
    _scheduleReconnect()
    return
  }

  _ws.onopen = () => {
    wsStatus.value = 'connected'
    console.log('[useSpotifyPlayerWs] connecté')
  }

  _ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data)
      if (msg?.method === 'Spotify.Player' && msg.data) {
        playerState.value = msg.data
      }
    } catch (_) {}
  }

  _ws.onerror = () => {
    wsStatus.value = 'error'
  }

  _ws.onclose = () => {
    _ws = null
    if (wsStatus.value !== 'idle') {
      wsStatus.value = 'disconnected'
      _scheduleReconnect()
    }
  }
}

export function disconnectPlayerWs() {
  _clearTimer()
  wsStatus.value = 'idle'
  _ws?.close()
  _ws = null
}

/* ── Composable public ──────────────────────────────────────────────────────── */

export function useSpotifyPlayerWs() {
  return {
    playerState:  readonly(playerState),
    wsStatus:     readonly(wsStatus),
    connect:      connectPlayerWs,
    disconnect:   disconnectPlayerWs,
  }
}
