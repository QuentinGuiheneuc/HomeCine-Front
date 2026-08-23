/**
 * Helpers YouTube — extraction du videoId et détection de source.
 * Tolère une piste brute (LibraryTrack) ou mappée (avec `__src`).
 */

/** Source de la piste est-elle YouTube ? */
export function isYoutube(t: any): boolean {
  const s = t?.__src ?? t
  return String(s?.source ?? t?.source ?? '').toLowerCase() === 'youtube'
}

/**
 * Extrait l'identifiant vidéo YouTube depuis sourceId/uri/id.
 * Gère les formes : watch?v=ID, youtu.be/ID, /shorts/ID, ou un ID nu.
 */
export function youtubeVideoId(t: any): string {
  const s = t?.__src ?? t
  const raw = String(s?.sourceId ?? s?.uri ?? s?.id ?? t?.sourceId ?? t?.uri ?? '')
  const m =
    raw.match(/[?&]v=([^&]+)/) ||
    raw.match(/youtu\.be\/([^?&/]+)/) ||
    raw.match(/\/shorts\/([^?&/]+)/) ||
    raw.match(/\/embed\/([^?&/]+)/)
  return m ? m[1]! : raw
}
