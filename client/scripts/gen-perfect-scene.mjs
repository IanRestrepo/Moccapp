// Sonido de la escena del examen perfecto, hecho a la medida de la animación (PerfectCelebration.vue):
//   0,00 s  patitas corriendo (pizzicato rápido que sube)
//   0,70 s  frenazo y resbalón: silbido que sube con vibrato
//   1,60 s  ¡pum!: golpe grave + "bonk" de madera + pajaritos de mareo
//   1,95 s  vuelve de puntitas: cuatro notas suaves de marimba
//   2,60 s  toma impulso: redoble que sube
//   3,05 s  EXPLOSIÓN: bombo, platillo y fanfarria de Mocca (arpegio que sube y acorde final con campanitas);
//           un "boing" en cada salto
// Uso: node scripts/gen-perfect-scene.mjs  →  public/sounds/perfectScene.wav
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SR = 32000
const DUR = 6.4
const out = new Float32Array(Math.ceil(SR * DUR))
const TAU = Math.PI * 2
const note = (n) => 440 * 2 ** ((n - 69) / 12) // número MIDI → Hz

/** Suma una voz: fn(t) con t en segundos desde su inicio */
function add(start, dur, fn, gain = 1) {
  const i0 = Math.round(start * SR)
  const n = Math.round(dur * SR)
  for (let i = 0; i < n && i0 + i < out.length; i++) out[i0 + i] += gain * fn(i / SR, i)
}
// semilla fija: el archivo sale igual cada vez
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

/** Marimba / pizzicato: ataque seco y caída rápida */
const pluck = (start, midi, gain = 0.5, decay = 9) => {
  const f = note(midi)
  add(start, 0.5, (t) => Math.exp(-t * decay) * (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 4 * t) * Math.exp(-t * 30)), gain)
}
/** Campanita: parciales inarmónicos, caída larga */
const bell = (start, midi, gain = 0.25, decay = 4) => {
  const f = note(midi)
  add(start, 1.4, (t) => Math.exp(-t * decay) * (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.76 * t) + 0.25 * Math.sin(TAU * f * 5.4 * t)), gain)
}
/** Metal de fanfarria: armónicos de sierra con ataque suave y un poquito de vibrato */
const brass = (start, midi, dur, gain = 0.3) => {
  const f = note(midi)
  add(
    start,
    dur + 0.25,
    (t) => {
      const env = Math.min(1, t / 0.025) * (t < dur ? 1 : Math.exp(-(t - dur) * 14))
      const vib = 1 + 0.004 * Math.sin(TAU * 5.5 * t) * Math.min(1, t / 0.3)
      let s = 0
      // el brillo se abre al atacar, como una trompeta
      const bright = 0.55 + 0.45 * Math.exp(-t * 6)
      for (let h = 1; h <= 7; h++) s += (Math.sin(TAU * f * vib * h * t) / h) * bright ** (h - 1)
      return env * s
    },
    gain,
  )
}
/** Ruido filtrado (paso bajo de un polo) con envolvente */
const noise = (start, dur, gain, env, cutoff = 0.5) => {
  let y = 0
  add(start, dur, (t) => {
    y += cutoff * (rand() - y)
    return env(t) * y
  }, gain)
}
/** Tono que se desliza de f0 a f1 */
const sweep = (start, dur, f0, f1, gain, env, vibrato = 0) => {
  let phase = 0
  add(start, dur, (t) => {
    const k = t / dur
    const f = f0 * (f1 / f0) ** k * (1 + vibrato * Math.sin(TAU * 11 * t))
    phase += (TAU * f) / SR
    return env(t, k) * Math.sin(phase)
  }, gain)
}

// ── 0,00 s: patitas corriendo ──
for (let i = 0; i < 7; i++) {
  pluck(0.02 + i * 0.1, 72 + i * 2 + (i % 2 ? 3 : 0), 0.34, 22)
  noise(0.02 + i * 0.1, 0.05, 0.1, (t) => Math.exp(-t * 90), 0.9)
}

// ── 0,70 s: frenazo y resbalón ──
noise(0.7, 0.3, 0.16, (t) => Math.exp(-t * 9), 0.35)
sweep(0.72, 0.82, 380, 1750, 0.3, (t, k) => Math.min(1, t / 0.04) * (1 - k * 0.25), 0.03)

// ── 1,60 s: ¡pum! ──
sweep(1.6, 0.4, 150, 42, 0.95, (t) => Math.exp(-t * 11))
noise(1.6, 0.18, 0.4, (t) => Math.exp(-t * 28), 0.25)
pluck(1.62, 55, 0.5, 26)
// pajaritos de mareo
;[1.74, 1.84, 1.94].forEach((t0, i) => sweep(t0, 0.07, 2300 + i * 200, 3100 + i * 200, 0.1, (t, k) => Math.sin(Math.PI * k)))

// ── 1,95 s: vuelve de puntitas ──
;[60, 64, 67, 71].forEach((m, i) => pluck(2.03 + i * 0.18, m, 0.36, 13))

// ── 2,60 s: toma impulso ──
sweep(2.6, 0.45, 180, 1100, 0.2, (t, k) => k * k)
noise(2.6, 0.45, 0.22, (t) => (t / 0.45) ** 2, 0.6)
for (let i = 0; i < 9; i++) pluck(2.62 + i * 0.047, 48 + i, 0.16 + i * 0.02, 40)

// ── 3,05 s: EXPLOSIÓN y fanfarria de Mocca ──
const B = 3.05
sweep(B, 0.9, 130, 34, 1.1, (t) => Math.exp(-t * 5))
noise(B, 1.3, 0.34, (t) => Math.exp(-t * 3.2), 0.95) // platillo
noise(B, 0.12, 0.5, (t) => Math.exp(-t * 40), 0.3)
// acorde de golpe (Do mayor)
;[48, 60, 64, 67].forEach((m) => brass(B, m, 0.16, 0.2))
// arpegio que sube: sol–do–mi–sol
;[67, 72, 76, 79].forEach((m, i) => {
  brass(B + 0.22 + i * 0.115, m, 0.1, 0.26)
  bell(B + 0.22 + i * 0.115, m + 12, 0.12, 7)
})
// acorde final, largo y abierto, que sube medio paso de emoción al cierre (Do → Fa/Do → Do)
const END = B + 0.72
;[60, 67, 72, 76, 84].forEach((m, i) => brass(END, m, 0.5, i === 4 ? 0.2 : 0.17))
;[60, 65, 72, 77, 84].forEach((m) => brass(END + 0.52, m, 0.22, 0.15))
;[60, 67, 72, 76, 79, 88].forEach((m, i) => brass(END + 0.76, m, 1.15, i === 5 ? 0.16 : 0.17))
sweep(END + 0.76, 0.7, 110, 40, 0.6, (t) => Math.exp(-t * 6))
noise(END + 0.76, 1.5, 0.26, (t) => Math.exp(-t * 2.6), 0.95)
// campanitas que caen como chispas
const SCALE = [84, 86, 88, 91, 93, 96, 98, 100]
for (let i = 0; i < 16; i++) bell(END + 0.1 + i * 0.105, SCALE[(i * 5 + (i % 3)) % SCALE.length], 0.085 + 0.04 * ((i + 1) % 2), 5)
// un "boing" en cada salto (0,64 s por salto)
for (let j = 0; j < 4; j++) {
  const t0 = B + j * 0.64 + 0.02
  sweep(t0, 0.16, 300, 760, 0.1, (t, k) => Math.sin(Math.PI * k) * 0.9, 0.02)
}

// ── mezcla: limitador suave y desvanecido final ──
const fadeFrom = out.length - Math.round(SR * 0.35)
let peak = 0
for (let i = 0; i < out.length; i++) {
  if (i > fadeFrom) out[i] *= 1 - (i - fadeFrom) / (out.length - fadeFrom)
  out[i] = Math.tanh(out[i] * 0.9)
  peak = Math.max(peak, Math.abs(out[i]))
}
const norm = 0.92 / peak

const data = Buffer.alloc(out.length * 2)
for (let i = 0; i < out.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * norm)) * 32767), i * 2)
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
console.log(`${file} · ${DUR} s · ${((44 + data.length) / 1024).toFixed(0)} KB · pico ${peak.toFixed(2)}`)
