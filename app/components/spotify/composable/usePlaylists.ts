import http from '@/src/lib/https' // évite "@/src/lib/https" si ton alias est "@/lib/http"

type Image = { url: string; width: number | null; height: number | null }
type Artist = { id: string; name: string }
type Album = { id: string; name: string; images?: Image[] }
type Track = {
  id: string; name: string; duration_ms: number;
  artists: Artist[]; album: Album; uri: string
}
type PlaylistTracksPaging = {
  items: Array<{ added_at?: string; track: Track | null }>
  limit: number; offset: number; total: number; next: string | null; previous: string | null
}
export type PlaylistFull = {
  id: string; name: string; description?: string | null; images?: Image[];
  snapshot_id?: string; tracks: PlaylistTracksPaging; uri: string
}

export function usePlaylists() {
  const playlist = ref<PlaylistFull | null>(null)
  const loading  = ref(false)
  const errorMsg = ref<string | null>(null)

  async function fetchPlaylist(id: string) {
    loading.value = true
    errorMsg.value = null
    try {
      // ⚠️ choisis UNE des deux lignes selon ton backend:
      // const { data } = await http.get<PlaylistFull>(`/playlists/${id}`, {  // ← sans préfixe
      const { data } = await http.get<PlaylistFull>(`/spotify/playlists/${id}`, { // ← avec préfixe
        params: {
          market: 'FR',
          // Optionnel: réduire la payload (fields Spotify)
          fields: [
            'id,name,description,images,uri,snapshot_id',
            'tracks(items(added_at,track(id,name,duration_ms,uri,artists(name,id),album(id,name,images))),total,limit,offset,next,previous)'
          ].join(',')
        },
        withCredentials: true
      })
      playlist.value = data
    } catch (e: any) {
      errorMsg.value = e?.response?.data?.error || e?.message || 'Chargement de la playlist échoué'
      console.error('[fetchPlaylist]', e)
    } finally {
      loading.value = false
    }
  }

  // Helper: aplatir les tracks (pratique pour l’UI)
  const flatTracks = computed<Track[]>(() =>
    playlist.value?.tracks?.items
      ?.map(it => it.track)
      ?.filter((t): t is Track => !!t) ?? []
  )

  return { playlist, flatTracks, loading, errorMsg, fetchPlaylist }
}