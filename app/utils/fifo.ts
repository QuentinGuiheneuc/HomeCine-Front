/**
 * Formats FIFO — « 48000:16:8 » → « 48 kHz · 16 bits · 7.1 ».
 *
 * L'API porte désormais le format en trois champs (`rate`, `bits`, `channels`)
 * et ne renvoie `sampleformat` que recomposé, en lecture seule. Les deux
 * entrées existent donc : `formatFifoFormat` pour les champs, celle-ci pour la
 * chaîne quand c'est tout ce qu'on a.
 */
export function formatSampleformat(sf?: string | null): string | null {
  if (!sf) return null
  const [rate, bits, ch] = String(sf).split(':').map(v => Number(v))
  const khz  = rate ? `${+(rate / 1000).toFixed(1).replace(/.0$/, '')} kHz` : null
  const b    = bits ? `${bits} bits` : null
  const chan = ch ? (ch === 8 ? '7.1' : ch === 6 ? '5.1' : ch === 2 ? 'stéréo' : `${ch} canaux`) : null
  const parts = [khz, b, chan].filter(Boolean)
  return parts.length ? parts.join(' · ') : String(sf)
}

/** Même rendu, à partir des champs distincts renvoyés par l'API. */
export function formatFifoFormat(f?: { rate?: number | null, bits?: number | null, channels?: number | null } | null): string | null {
  if (!f) return null
  const parts = [f.rate, f.bits, f.channels]
  if (parts.every(v => v == null)) return null
  return formatSampleformat(`${f.rate ?? ''}:${f.bits ?? ''}:${f.channels ?? ''}`)
}
