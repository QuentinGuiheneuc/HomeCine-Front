// utils/spotifyPlay.ts
import http from '@/src/lib/https'

type PlayTracks = {
  kind: 'tracks'
  uris: string[]                   // array de track URIs: ["spotify:track:…", ...]
  deviceId?: string
}

type PlayContext = {
  kind: 'context'
  contextUri: string               // "spotify:playlist:…", "spotify:album:…"
  // position index (0-based) OU offset par URI précise de track
  offset?: { position: number } | { uri: string }
  deviceId?: string
}

type PlayRequest = PlayTracks | PlayContext

export async function play(opts: PlayRequest) {
  const params = opts.deviceId ? { params: { device_id: opts.deviceId } } : undefined

  if (opts.kind === 'tracks') {
    if (!opts.uris?.length) throw new Error('play(tracks): uris[] vide')
    return http.put('/spotify/devices/play', { uris: opts.uris }, params)
  }

  // kind === 'context'
  if (!opts.contextUri) throw new Error('play(context): contextUri requis')
  const body: Record<string, any> = { context_uri: opts.contextUri }
  if (opts.offset) body.offset = opts.offset
  return http.put('/spotify/devices/play', body, params)
}
