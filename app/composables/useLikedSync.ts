// composables/spotify/useLikedSync.ts
import http from '@/src/lib/https'

type Paging<T> = {
  href: string
  items: T[]
  limit: number
  next: string | null
  offset: number
  previous: string | null
  total: number
}

type SavedTrack = {
  added_at?: string
  track: { uri?: string | null } | null
}

type Playlist = { id: string; name: string }

function chunk<T>(arr: T[], size = 100): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Récupère TOUTES les URIs des titres likés (pagination) */
async function fetchAllLikedUris(): Promise<string[]> {
  const limit = 50
  let offset = 0
  let total = Infinity
  const uris: string[] = []

  while (offset < total) {
    const res = await http.get<Paging<SavedTrack>>('/spotify/me/tracks', { params: { limit, offset } })
    const data = (res as any).data ?? res
    total = data.total
    offset = data.offset + data.limit

    for (const it of data.items ?? []) {
      const uri = it?.track?.uri
      if (uri) uris.push(uri)
    }
  }
  return uris
}

/** Trouve une playlist par nom dans /playlists/me (pagination) */
async function findPlaylistByName(name: string): Promise<Playlist | null> {
  const limit = 50
  let offset = 0
  let total = Infinity

  while (offset < total) {
    const res = await http.get<Paging<Playlist>>('/spotify/playlists/me', { params: { limit, offset } })
    const data = (res as any).data ?? res
    total = data.total
    offset = data.offset + data.limit

    const found = (data.items || []).find(p => p.name === name)
    if (found) return found
  }
  return null
}

/** Crée une playlist pour l’utilisateur courant */
async function createPlaylistForMe(name: string, description = '', _public = false, collaborative = false): Promise<Playlist> {
  const res = await http.post<Playlist>('/spotify/playlists/me', {
    name, description, _public, collaborative
  })
  return (res as any).data ?? res
}

/** Remplace complètement le contenu d’une playlist par des URIs (chunk 100) */
async function replaceAllItems(playlistId: string, uris: string[]): Promise<void> {
  const parts = chunk(uris, 100)
  if (parts.length === 0) {
    // vide : on remplace par vide pour purger
    await http.put(`/spotify/playlists/${playlistId}/tracks`, { uris: [] })
    return
  }
  // 1) remplacer par le premier chunk
  await http.put(`/spotify/playlists/${playlistId}/tracks`, { uris: parts[0] })
  // 2) ajouter le reste
  for (let i = 1; i < parts.length; i++) {
    await http.post(`/spotify/playlists/${playlistId}/tracks`, { uris: parts[i] })
  }
}

/**
 * Synchronise *entièrement* les titres likés vers une playlist donnée (par nom).
 * - Si la playlist n’existe pas, on la crée.
 * - Son contenu est REPLACÉ par les likés (ordre actuel de /me/tracks).
 * Retourne des infos utiles pour l’UI.
 */
export async function syncLikedToPlaylist(playlistName = 'Titres likés') {
  // 1) URIs likés
  const uris = await fetchAllLikedUris()

  // 2) Assurer la playlist
  let target = await findPlaylistByName(playlistName)
  if (!target) {
    target = await createPlaylistForMe(playlistName, 'Miroir des titres likés', false, false)
  }

  // 3) Remplacer tout le contenu
  await replaceAllItems(target.id, uris)

  return {
    playlistId: target.id,
    playlistName: playlistName,
    total: uris.length
  }
}
