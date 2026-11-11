// Música de la escena del examen perfecto (PerfectCelebration.vue): una pieza ORIGINAL para guitarra acústica de
// cuerdas de nylon, punteada con los dedos, cálida y en registro grave-medio (al estilo de las baladas de guitarra
// española/fingerstyle). Arpegios en La menor mientras Mocca corre y se resbala, y resuelve luminosa a Do mayor
// cuando todo estalla. Solo guitarra y un par de golpecitos en la caja.
//   0,00 s  corre: arpegio de La menor que sube
//   0,70 s  resbalón: escala menor que baja rodando
//   1,60 s  ¡pum!: golpe con la palma en la caja de la guitarra + bajo apagado
//   1,95 s  vuelve de puntitas: Fa mayor 7, muy suave
//   2,60 s  toma impulso: rasgueo de Sol que crece
//   3,05 s  EXPLOSIÓN: rasgueo lleno de Do mayor y arpegio Do – Sol/Si – La m – Fa – Do, con la melodía arriba
// Uso: node scripts/gen-perfect-scene.mjs  →  public/sounds/perfectScene.wav
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SR = 32000
const DUR = 7
const out = new Float32Array(Math.ceil(SR * DUR))
const TAU = Math.PI * 2
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)

// semilla fija: el archivo sale igual cada vez
let seed = 23
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

/**
 * Cuerda de nylon (Karplus-Strong afinado): el pulso del dedo da vueltas por una línea de retardo y se apaga solo,
 * como una cuerda real.
 *  - retardo con fracción (interpolado) → la nota queda afinada de verdad
 *  - el pulso es ruido MUY suavizado (yema del dedo, no púa) y pulsado cerca de la boca (sonido redondo)
 *  - los graves duran más que los agudos, como en una guitarra
 *  - `ring` = segundos antes de apagarla con el dedo
 */
function nylon(start, midi, gain = 0.5, { ring = 2.4, soft = 0.22, t60 } = {}) {
  const f = hz(midi)
  const L = SR / f - 0.5 // el filtro del lazo retrasa media muestra
  const N = Math.ceil(L) + 2
  const buf = new Float32Array(N)
  // pulso: ruido suavizado dos veces + "posición del dedo" a 1/5 de la cuerda
  const exc = new Float32Array(N)
  let a = 0
  let b = 0
  let mean = 0
  for (let i = 0; i < N; i++) {
    a += soft * (rand() - a)
    b += soft * 1.6 * (a - b)
    exc[i] = b
    mean += b / N
  }
  const pick = Math.max(1, Math.round(N * 0.2))
  let peak = 1e-6
  for (let i = 0; i < N; i++) {
    buf[i] = exc[i] - mean - (exc[(i + N - pick) % N] - mean) * 0.6
    peak = Math.max(peak, Math.abs(buf[i]))
  }
  for (let i = 0; i < N; i++) buf[i] /= peak

  // cuánto dura: graves ~3,2 s, agudos ~1,6 s
  const decaySecs = t60 ?? Math.max(1.4, 3.4 - (midi - 40) * 0.045)
  const loss = 10 ** (-3 / (decaySecs * f))
  const i0 = Math.round(start * SR)
  const n = Math.round((ring + 0.06) * SR)
  const mute = Math.round(ring * SR)
  let w = 0
  let prev = 0
  let warm = 0
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    // lectura interpolada L muestras atrás
    let r = w - L
    while (r < 0) r += N
    const r0 = Math.floor(r)
    const frac = r - r0
    const y = buf[r0 % N] * (1 - frac) + buf[(r0 + 1) % N] * frac
    buf[w] = loss * 0.5 * (y + prev)
    prev = y
    w = (w + 1) % N
    // la caja redondea el sonido (quita el brillo metálico)
    warm += 0.42 * (y - warm)
    // apagado con el dedo al final
    const env = i < mute ? 1 : Math.max(0, 1 - (i - mute) / (0.06 * SR))
    out[i0 + i] += gain * env * warm
  }
}

/** Rasgueo con el pulgar: de la cuerda grave a la aguda, sin prisa */
const strum = (start, chord, { gain = 0.42, spread = 0.03, ring = 2.4 } = {}) =>
  chord.forEach((m, i) => nylon(start + i * spread, m, gain * (1 - i * 0.04), { ring }))

/** Golpe con la palma en la caja de la guitarra: madera grave y corta */
function knock(start, gain = 0.8) {
  const i0 = Math.round(start * SR)
  const n = Math.round(0.28 * SR)
  let lp = 0
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / SR
    lp += 0.12 * (rand() - lp)
    out[i0 + i] +=
      gain * (Math.exp(-t * 22) * Math.sin(TAU * 98 * t) + 0.5 * Math.exp(-t * 30) * Math.sin(TAU * 196 * t) + 1.6 * Math.exp(-t * 70) * lp)
  }
}

// notas: Mi2 = 40, La2 = 45, Do3 = 48, Mi3 = 52, La3 = 57, Do4 = 60, Mi4 = 64, La4 = 69, Do5 = 72

// ── 0,00 s: corre (La menor que sube, punteado rápido) ──
;[45, 52, 57, 60, 64, 69, 72].forEach((m, i) => nylon(0.02 + i * 0.1, m, 0.55 + i * 0.03, { ring: 0.9 }))

// ── 0,70 s: resbalón (escala de La menor que baja rodando, cada vez más rápido) ──
let t = 0.74
;[76, 74, 72, 71, 69, 67, 65, 64, 62, 60, 59, 57].forEach((m, i) => {
  nylon(t, m, 0.5 - i * 0.012, { ring: 0.5 })
  t += 0.075 - i * 0.0022
})

// ── 1,60 s: ¡pum! ──
knock(1.6, 1)
nylon(1.61, 40, 0.75, { ring: 0.22 })

// ── 1,95 s: vuelve de puntitas (Fa mayor 7, pianísimo) ──
;[53, 57, 60, 64].forEach((m, i) => nylon(2.04 + i * 0.17, m, 0.36, { ring: 1.1, soft: 0.16 }))

// ── 2,60 s: toma impulso (Sol, tres rasgueos que crecen) ──
const G = [43, 47, 50, 55, 59, 67]
;[0, 0.17, 0.31].forEach((d, i) => strum(2.6 + d, G, { gain: 0.2 + i * 0.1, spread: 0.012, ring: 0.5 }))

// ── 3,05 s: EXPLOSIÓN — Do mayor lleno y el arpegio que canta ──
const B = 3.05
knock(B, 0.9)
strum(B, [48, 52, 55, 60, 64, 72], { gain: 0.6, spread: 0.022, ring: 2.6 })

// patrón de dedos (bajo – medio – agudo – medio), una corchea cada 0,15 s, con la melodía en la cuerda aguda
const STEP = 0.15
const bars = [
  { bass: 48, mid: [55, 60], top: 76 }, // Do, melodía Mi
  { bass: 47, mid: [55, 62], top: 74 }, // Sol/Si, melodía Re
  { bass: 45, mid: [52, 60], top: 72 }, // La menor, melodía Do
  { bass: 41, mid: [53, 57], top: 69 }, // Fa, melodía La
]
bars.forEach(({ bass, mid, top }, b) => {
  const at = B + 0.6 + b * 4 * STEP
  nylon(at, bass, 0.62, { ring: 1.4 })
  nylon(at, top, 0.56, { ring: 1.3 })
  nylon(at + STEP, mid[0], 0.36, { ring: 0.9 })
  nylon(at + 2 * STEP, mid[1], 0.38, { ring: 0.9 })
  nylon(at + 3 * STEP, mid[0], 0.32, { ring: 0.8 })
})
// vuelta a casa: Sol que sube a Do, y el acorde final rodado despacio, que se queda sonando
const HOME = B + 0.6 + 16 * STEP
nylon(HOME - 2 * STEP, 71, 0.5, { ring: 0.5 })
nylon(HOME - STEP, 74, 0.52, { ring: 0.5 })
knock(HOME, 0.45)
strum(HOME, [48, 55, 60, 64, 67, 72, 76], { gain: 0.58, spread: 0.045, ring: 3 })
nylon(HOME + 0.55, 79, 0.42, { ring: 2.4, soft: 0.18 })
nylon(HOME + 0.9, 84, 0.36, { ring: 2.2, soft: 0.16 })

// ── mezcla: sin distorsión; nivelar y desvanecer el final ──
const fadeFrom = out.length - Math.round(SR * 0.9)
let peak = 0
for (let i = 0; i < out.length; i++) {
  if (i > fadeFrom) out[i] *= ((out.length - i) / (out.length - fadeFrom)) ** 1.5
  peak = Math.max(peak, Math.abs(out[i]))
}
// solo se redondean los picos (los golpes), para que la guitarra no quede bajita
const soft = (x) => (Math.abs(x) < 0.65 ? x : Math.sign(x) * (0.65 + 0.35 * Math.tanh((Math.abs(x) - 0.65) / 0.35)))
const norm = (0.98 / peak) * 1.35
const data = Buffer.alloc(out.length * 2)
for (let i = 0; i < out.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, soft(out[i] * norm))) * 32767), i * 2)
const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + data.length, 4)
header.write('WAVEfmt ', 8)
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20) // PCM
header.writeUInt16LE(1, 22) // mono
header.writeUInt32LE(SR, 24)
header.writeUInt32LE(SR * 2, 28)
header.writeUInt16LE(2, 32)
header.writeUInt16LE(16, 34)
header.write('data', 36)
header.writeUInt32LE(data.length, 40)
const file = fileURLToPath(new URL('../public/sounds/perfectScene.wav', import.meta.url))
writeFileSync(file, Buffer.concat([header, data]))
console.log(`sounds/perfectScene.wav · ${DUR} s · ${((44 + data.length) / 1024).toFixed(0)} KB · pico ${peak.toFixed(2)}`)
