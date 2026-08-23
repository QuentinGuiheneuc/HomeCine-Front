import { resolveCoverUrl, type LibraryTrack, type LibraryAlbum, type LibraryArtist, type LibrarySource } from '@/src/api/library'

/**
 * Convertit les objets `/library` (multi-source) vers les formes "Spotify-like"
 * attendues par les composants ItemPlaylist / ItemAlbum / ItemArtist.
 *
 * Défensif : tolère plusieurs noms de champs possibles (title/name, cover_url/image…).
 */

const pick = <T>(...vals: T[]): T | undefined => vals.find(v => v !== undefined && v !== null)

function normArtists(a: any): { id: string; name: string }[] {
  if (!a) return []
  if (Array.isArray(a)) {
    return a.map((x: any) => typeof x === 'string'
      ? { id: '', name: x }
      : { id: String(x.id ?? ''), name: String(x.name ?? x) })
  }
  return [{ id: '', name: String(a) }]
}

function albumName(t: any): string {
  return typeof t.album === 'string' ? t.album : (t.album?.name ?? '')
}

function cover(o: any): string | undefined {
  const raw = pick<string>(
    o.coverUrl, o.cover_url, o.image, o.images?.[0]?.url,
    o.album?.coverUrl, o.album?.cover_url, o.album?.images?.[0]?.url
  )
  return resolveCoverUrl(raw) ?? undefined
}

/** LibraryTrack → Track (forme Spotify) avec __src conservé pour l'enqueue */
export function mapTrack(t: LibraryTrack, index = 0) {
  const cov = cover(t)
  return {
    id:           String(pick(t.id, (t as any).sourceId, t.uri, index)),
    name:         String(pick(t.title, (t as any).name, 'Sans titre')),
    duration_ms:  Number(pick(t.duration_ms, (t as any).durationMs, (t as any).duration, 0)) || 0,
    uri:          String(pick(t.uri, t.id, '')),
    track_number: Number(pick((t as any).track_number, index + 1)),
    artists:      normArtists(t.artists),
    album:        { id: String((t as any).album_id ?? ''), name: albumName(t), images: cov ? [{ url: cov }] : [] },
    __src:        t,            // original conservé pour enqueueTrack
  }
}

/** LibraryPlaylist + tracks → PlaylistDetail (forme ItemPlaylist) */
export function mapPlaylistDetail(p: any, tracks: LibraryTrack[]) {
  const items = tracks.map((t, i) => ({ track: mapTrack(t, i) }))
  const cov = cover(p)
  return {
    id:          p.id,
    name:        p.name,
    description: p.description ?? '',
    uri:         p.uri ?? `${p.source}:playlist:${p.id}`,
    images:      cov ? [{ url: cov }] : [],
    tracks: { limit: items.length, total: items.length, offset: 0, items },
    items:  { limit: items.length, total: items.length, offset: 0, items },
  }
}

/** LibraryAlbum + tracks → AlbumDetail (forme ItemAlbum) */
export function mapAlbumDetail(a: LibraryAlbum, tracks: LibraryTrack[]) {
  const cov = cover(a)
  return {
    id:           a.id,
    name:         a.name,
    album_type:   (a as any).album_type ?? 'album',
    release_date: String(pick((a as any).release_date, a.year, '')),
    total_tracks: tracks.length || (a.track_count ?? 0),
    images:       cov ? [{ url: cov }] : [],
    uri:          `${a.source}:album:${a.id}`,
    artists:      normArtists(a.artists),
    tracks: {
      items: tracks.map((t, i) => mapTrack(t, i)),
      total: tracks.length, limit: tracks.length, offset: 0, next: null,
    },
  }
}

/** LibraryArtist + tracks + albums → ArtistDetail (forme ItemArtist) */
export function mapArtistDetail(ar: LibraryArtist, tracks: LibraryTrack[], albums: LibraryAlbum[]) {
  const cov = cover(ar)
  return {
    id:        ar.id,
    name:      ar.name,
    images:    cov ? [{ url: cov }] : [],
    uri:       `${ar.source}:artist:${ar.id}`,
    genres:    (ar as any).genres ?? [],
    followers: (ar as any).followers ?? undefined,
    topTracks: tracks.map((t, i) => mapTrack(t, i)),
    albums: albums.map(mapArtistAlbum),
  }
}

/** Album de discographie (forme ItemArtist) — réutilisé par la pagination « Charger plus » */
export function mapArtistAlbum(a: LibraryAlbum) {
  const c = cover(a)
  return {
    id: a.id, name: a.name, album_type: (a as any).album_type ?? 'album',
    release_date: String(pick((a as any).release_date, a.year, '')),
    images: c ? [{ url: c }] : [], uri: `${a.source}:album:${a.id}`,
    artists: normArtists(a.artists),
  }
}
