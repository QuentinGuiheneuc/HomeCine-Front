// // utils/parametricEq.ts
// export type EqType = "peaking" | "lowpass" | "highpass" | "lowshelf" | "highshelf"

// export type EqBand = {
//   enabled: boolean
//   type: EqType
//   freq: number
//   q: number
//   gainDb: number
// }

// export type Biquad = {
//   b: [number, number, number] // b0 b1 b2
//   a: [number, number, number] // 1 a1 a2
// }

// export type EqResult = {
//   fs: number
//   sections: Array<{ band: EqBand; biquad: Biquad }>
// }

// export type EqCurvePoint = { f: number; db: number }

// function clamp(v: number, min: number, max: number) {
//   return Math.max(min, Math.min(max, v))
// }
// function dbToA(db: number) {
//   return Math.pow(10, db / 40)
// }
// function normalize(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
//   return { b: [b0 / a0, b1 / a0, b2 / a0], a: [1, a1 / a0, a2 / a0] }
// }

// // RBJ cookbook
// export function designBiquad(fs: number, band: EqBand): Biquad {
//   const f0 = clamp(band.freq, 1, fs / 2 - 1)
//   const w0 = (2 * Math.PI * f0) / fs
//   const cosw0 = Math.cos(w0)
//   const sinw0 = Math.sin(w0)

//   const Q = clamp(band.q, 0.0001, 1000)
//   const A = dbToA(band.gainDb)

//   if (band.type === "peaking") {
//     const alpha = sinw0 / (2 * Q)
//     return normalize(
//       1 + alpha * A,
//       -2 * cosw0,
//       1 - alpha * A,
//       1 + alpha / A,
//       -2 * cosw0,
//       1 - alpha / A
//     )
//   }

//   if (band.type === "lowpass") {
//     const alpha = sinw0 / (2 * Q)
//     return normalize(
//       (1 - cosw0) / 2,
//       1 - cosw0,
//       (1 - cosw0) / 2,
//       1 + alpha,
//       -2 * cosw0,
//       1 - alpha
//     )
//   }

//   if (band.type === "highpass") {
//     const alpha = sinw0 / (2 * Q)
//     return normalize(
//       (1 + cosw0) / 2,
//       -(1 + cosw0),
//       (1 + cosw0) / 2,
//       1 + alpha,
//       -2 * cosw0,
//       1 - alpha
//     )
//   }

//   // Shelves : q = slope S
//   const S = clamp(band.q, 0.0001, 10)
//   const alpha = (sinw0 / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2)
//   const sqrtA = Math.sqrt(A)

//   if (band.type === "lowshelf") {
//     return normalize(
//       A * ((A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha),
//       2 * A * ((A - 1) - (A + 1) * cosw0),
//       A * ((A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha),
//       (A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha,
//       -2 * ((A - 1) + (A + 1) * cosw0),
//       (A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha
//     )
//   }

//   // highshelf
//   return normalize(
//     A * ((A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha),
//     -2 * A * ((A - 1) + (A + 1) * cosw0),
//     A * ((A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha),
//     (A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha,
//     2 * ((A - 1) - (A + 1) * cosw0),
//     (A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha
//   )
// }

// export function buildEqResult(fs: number, bands: EqBand[]): EqResult {
//   return {
//     fs,
//     sections: bands
//       .filter(b => b.enabled)
//       .map(band => ({ band, biquad: designBiquad(fs, band) }))
//   }
// }

// // --- FR curve ---
// type Complex = { re: number; im: number }
// const cMul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
// const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im })
// const cDiv = (a: Complex, b: Complex): Complex => {
//   const den = b.re * b.re + b.im * b.im
//   return { re: (a.re * b.re + a.im * b.im) / den, im: (a.im * b.re - a.re * b.im) / den }
// }
// const cAbs = (a: Complex) => Math.hypot(a.re, a.im)

// function biquadH(bq: Biquad, w: number): Complex {
//   const z1 = { re: Math.cos(-w), im: Math.sin(-w) }
//   const z2 = cMul(z1, z1)

//   const num = cAdd({ re: bq.b[0], im: 0 }, cAdd(cMul({ re: bq.b[1], im: 0 }, z1), cMul({ re: bq.b[2], im: 0 }, z2)))
//   const den = cAdd({ re: bq.a[0], im: 0 }, cAdd(cMul({ re: bq.a[1], im: 0 }, z1), cMul({ re: bq.a[2], im: 0 }, z2)))
//   return cDiv(num, den)
// }

// export function computeEqCurve(result: EqResult, points = 256, fMin = 20, fMax = 20000): EqCurvePoint[] {
//   const fs = result.fs
//   const out: EqCurvePoint[] = []

//   const min = clamp(fMin, 1, fs / 2 - 1)
//   const max = clamp(fMax, min + 1, fs / 2 - 1)

//   for (let i = 0; i < points; i++) {
//     const t = i / (points - 1)
//     const f = min * Math.pow(max / min, t)
//     const w = (2 * Math.PI * f) / fs

//     let H: Complex = { re: 1, im: 0 }
//     for (const s of result.sections) H = cMul(H, biquadH(s.biquad, w))

//     const db = 20 * Math.log10(Math.max(cAbs(H), 1e-12))
//     out.push({ f, db })
//   }
//   return out
// }
