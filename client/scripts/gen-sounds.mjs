// Genera los efectos de sonido de VetQuiz (WAV mono 16 bit) sintetizando tonos.
// Sin archivos de terceros ni licencias: se regeneran con `node scripts/gen-sounds.mjs`.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 44100
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/sounds')

const note = (n) => 440 * 2 ** ((n - 69) / 12) // MIDI → Hz
const waves = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  triangle: (p) => 2 * Math.abs(2 * (p - Math.floor(p + 0.5))) - 1,
  // pad cálido: fundamental + un poco de 2.º y 3.er armónico
  warm: (p) => Math.sin(2 * Math.PI * p) + 0.22 * Math.sin(4 * Math.PI * p) + 0.08 * Math.sin(6 * Math.PI * p),
  // campanita: parciales inarmónicos (como un glockenspiel)
  bell: (p) => Math.sin(2 * Math.PI * p) + 0.45 * Math.sin(2 * Math.PI * 2.76 * p) + 0.18 * Math.sin(2 * Math.PI * 5.4 * p),
  noise: () => Math.random() * 2 - 1,
}

/** Cada evento: { at (s), freq (Hz), dur (s), wave, gain, glide (Hz al final), vib (vibrato), attack (s) } */
function render(events, tail = 0.05) {
  const length = Math.ceil((Math.max(...events.map((e) => e.at + e.dur)) + tail) * RATE)
  const buf = new Float32Array(length)
  for (const e of events) {
    const start = Math.floor(e.at * RATE)
    const n = Math.floor(e.dur * RATE)
    let phase = 0
    let lp = 0
    for (let i = 0; i < n; i++) {
      if (e.wave === 'whoosh') {
        const t = i / n
        lp += (0.008 + 0.22 * t * t) * (Math.random() * 2 - 1 - lp)
        buf[start + i] += lp * Math.sin(Math.PI * t) ** 1.6 * (e.gain ?? 0.5) * 3
        continue
      }
      const t = i / n
      const secs = i / RATE
      // el vibrato entra suave después de 120 ms, como un trompetista sosteniendo la nota
      const vib = e.vib ? 1 + e.vib * Math.sin(2 * Math.PI * 5.5 * secs) * Math.min(1, Math.max(0, (secs - 0.12) / 0.2)) : 1
      const freq = (e.freq + ((e.glide ?? e.freq) - e.freq) * t) * vib
      phase += freq / RATE
      // ataque corto y caída exponencial: suena "redondo", no chillón
      const env = Math.min(1, i / (RATE * (e.attack ?? 0.004))) * Math.exp(-t * (e.decay ?? 5))
      buf[start + i] += waves[e.wave ?? 'sine'](phase) * env * (e.gain ?? 0.5)
    }
  }
  // normaliza para que nunca sature
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  if (peak > 0.9) for (let i = 0; i < buf.length; i++) buf[i] *= 0.9 / peak
  return buf
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2))
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(RATE, 24)
  h.writeUInt32LE(RATE * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

/** Voz de pad con dos osciladores levemente desafinados (efecto "chorus") */
const pad = (at, midi, dur, gain) => [
  { at, freq: note(midi) * 0.9975, dur, wave: 'warm', gain, attack: 0.07, decay: 1.6 },
  { at, freq: note(midi) * 1.0025, dur, wave: 'warm', gain, attack: 0.07, decay: 1.6 },
]

const sounds = {
  // ¡examen perfecto!: Mocca entra volando (barrido), aterriza (golpe grave) y suena un acorde Cmaj9 con campanitas
  perfect: render(
    [
      { at: 0, freq: 1, dur: 0.5, wave: 'whoosh', gain: 0.5 },
      // golpe: bombo grave que cae de tono + clic
      { at: 0.46, freq: 92, glide: 38, dur: 0.55, gain: 0.85, decay: 6 },
      { at: 0.46, freq: 1, dur: 0.05, wave: 'noise', gain: 0.18, decay: 30 },
      // acorde Cmaj9 (Do, Sol, Si, Re, Mi)
      ...pad(0.46, 48, 2.0, 0.07),
      ...pad(0.46, 60, 2.0, 0.07),
      ...pad(0.46, 67, 2.0, 0.06),
      ...pad(0.46, 71, 2.0, 0.055),
      ...pad(0.46, 74, 2.0, 0.05),
      ...pad(0.46, 76, 2.0, 0.05),
      // campanitas subiendo
      { at: 0.52, freq: note(88), dur: 0.7, wave: 'bell', gain: 0.1, decay: 6 },
      { at: 0.6, freq: note(91), dur: 0.7, wave: 'bell', gain: 0.1, decay: 6 },
      { at: 0.68, freq: note(95), dur: 0.7, wave: 'bell', gain: 0.1, decay: 6 },
      { at: 0.76, freq: note(98), dur: 1.0, wave: 'bell', gain: 0.11, decay: 5 },
      { at: 0.92, freq: note(100), dur: 1.2, wave: 'bell', gain: 0.07, decay: 4 },
    ],
    0.2,
  ),
  // cada tarjeta del resumen al aparecer
  pop: render([
    { at: 0, freq: 520, glide: 880, dur: 0.07, wave: 'sine', gain: 0.35, decay: 5 },
    { at: 0.02, freq: note(84), dur: 0.18, wave: 'bell', gain: 0.08, decay: 7 },
  ]),
  // toque de botón: "pop" corto
  tap: render([{ at: 0, freq: 700, glide: 1100, dur: 0.05, gain: 0.35, decay: 6 }]),
  // elegir una opción
  select: render([
    { at: 0, freq: note(76), dur: 0.07, gain: 0.3 },
    { at: 0.045, freq: note(83), dur: 0.09, gain: 0.3 },
  ]),
  // acierto: arpegio mayor brillante
  correct: render([
    { at: 0, freq: note(72), dur: 0.12, gain: 0.35 },
    { at: 0.07, freq: note(76), dur: 0.12, gain: 0.35 },
    { at: 0.14, freq: note(79), dur: 0.22, gain: 0.4, decay: 4 },
  ]),
  // fallo: dos notas suaves hacia abajo (sin regañar)
  wrong: render([
    { at: 0, freq: note(64), dur: 0.12, gain: 0.35, wave: 'triangle' },
    { at: 0.1, freq: note(60), dur: 0.2, gain: 0.35, wave: 'triangle', decay: 4 },
  ]),
  // aviso de poco tiempo
  tick: render([{ at: 0, freq: 1400, dur: 0.025, gain: 0.25, decay: 8 }]),
  // examen enviado / resultados
  finish: render([
    { at: 0, freq: note(72), dur: 0.14, gain: 0.32 },
    { at: 0.09, freq: note(76), dur: 0.14, gain: 0.32 },
    { at: 0.18, freq: note(79), dur: 0.14, gain: 0.32 },
    { at: 0.27, freq: note(84), dur: 0.5, gain: 0.38, decay: 3 },
    { at: 0.27, freq: note(91), dur: 0.35, gain: 0.12, decay: 5 },
  ]),
}

await mkdir(out, { recursive: true })
for (const [name, samples] of Object.entries(sounds)) {
  await writeFile(path.join(out, `${name}.wav`), wav(samples))
  console.log(`${name}.wav  ${(samples.length / RATE).toFixed(2)} s`)
}
