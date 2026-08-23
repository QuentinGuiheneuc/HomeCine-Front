/**
 * Correspondance « piste en cours de lecture ».
 *
 * La clé courante (fournie par le lecteur actif) est l'une de : sourceId / uri /
 * titre de la piste jouée. On compare une piste de liste (brute LibraryTrack ou
 * mappée avec `__src`) à cette clé sur tous ses identifiants plausibles.
 * Source-agnostique → fonctionne pour fileplayer, deezer, youtube, spotify…
 */
export function trackKeys(t: any): string[] {
  if (!t) return []
  const s = t.__src ?? t
  return [s?.sourceId, s?.uri, s?.id, s?.title, t?.uri, t?.name, t?.title]
    .filter((v: any) => v != null && v !== '')
    .map((v: any) => String(v))
}

export function isNowPlaying(t: any, key?: string | null): boolean {
  if (!key) return false
  return trackKeys(t).includes(key)
}
