/**
 * Formats FIFO — « 48000:16:8 » → « 48 kHz · 16 bits · 7.1 ».
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
