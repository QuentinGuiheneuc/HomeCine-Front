export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function randomFrom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]!
}

export function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n))
}

/** Message d'erreur renvoye par le back (`error`, sinon `message`), ou `fallback`. */
export function apiError(e: unknown, fallback: string): string
export function apiError(e: unknown, fallback?: string): string | undefined
export function apiError(e: unknown, fallback?: string): string | undefined {
  const d = (e as { response?: { data?: { error?: string, message?: string } } } | null)?.response?.data
  return d?.error || d?.message || fallback
}

/** Duree en ms -> "m:ss". `empty` : texte rendu quand la duree est absente ou nulle. */
export function toTime(ms?: number | null, empty = '0:00'): string {
  if (!ms || ms < 0) return empty
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
