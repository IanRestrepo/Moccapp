import { GoogleGenAI, Modality } from '@google/genai'
import { createHash } from 'node:crypto'
import { env } from '../env.js'
import { AppError } from '../lib/errors.js'

const cache = new Map<string, Buffer>()
const pending = new Map<string, Promise<Buffer>>()
let bytes = 0

export async function narrate(text: string): Promise<Buffer> {
  const key = createHash('sha256').update(text).digest('hex')
  const saved = cache.get(key)
  if (saved) return saved
  if (pending.has(key)) return pending.get(key)!
  if (pending.size >= 3) throw new AppError(429, 'VOICE_BUSY', 'La voz está ocupada. Intenta de nuevo.')
  const task = (async () => {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
      contents: `Lee exclusivamente el texto siguiente en español latinoamericano, con voz cálida, cercana y natural, como una profesora conversando a ritmo fluido. Entonación expresiva y suave, pausas breves en la puntuación, sin silencios prolongados entre frases ni al inicio o al final, sin cantar, resumir, omitir frases ni añadir palabras. Lee todas las frases exactamente una vez y en el orden recibido.\n\nTexto:\n${text}`,
      config: {
        httpOptions: { timeout: 45000 },
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sulafat' } } },
      },
    })
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'))?.inlineData
    if (!part?.data) throw new AppError(502, 'VOICE_EMPTY', 'No se pudo preparar la voz.')
    const pcm = Buffer.from(part.data, 'base64')
    const sampleRate = Number(part.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000)
    const header = Buffer.alloc(44)
    header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8)
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
    header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28)
    header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
    const wav = Buffer.concat([header, pcm])
    while (bytes + wav.length > 32 * 1024 * 1024 && cache.size) {
      const oldest = cache.keys().next().value!
      bytes -= cache.get(oldest)!.length; cache.delete(oldest)
    }
    if (wav.length <= 32 * 1024 * 1024) { cache.set(key, wav); bytes += wav.length }
    return wav
  })()
  pending.set(key, task)
  try { return await task } finally { pending.delete(key) }
}
