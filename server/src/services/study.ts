// Modo estudio: las preguntas del banco como tarjetas, sin examen, sin reloj y sin IA (instantáneo).
import { and, inArray } from 'drizzle-orm'
import type { Difficulty, StudyDeckDTO } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { questionBank, sources } from '../db/schema.js'
import { AppError, Errors } from '../lib/errors.js'
import { visibleOwners } from '../lib/profile.js'

const shuffle = <T>(xs: T[]) => {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j]!, xs[i]!]
  }
  return xs
}

export async function getStudyDeck(sourceIds: string[]): Promise<StudyDeckDTO> {
  const found = await db.select().from(sources).where(and(inArray(sources.id, sourceIds), inArray(sources.owner, visibleOwners())))
  if (found.length !== sourceIds.length) throw Errors.notFound('Esa fuente')
  const rows = await db.select().from(questionBank).where(inArray(questionBank.sourceId, sourceIds))
  if (!rows.length) {
    const processing = found.some((s) => s.status === 'processing')
    throw new AppError(409, 'NO_CARDS', processing ? 'Mocca todavía está leyendo la fuente. Espera un momentico.' : 'Esta fuente no tiene preguntas todavía.')
  }
  // de lo más fácil a lo más difícil, barajado dentro de cada nivel
  const cards = shuffle(rows).sort((a, b) => a.difficulty - b.difficulty)
  const first = found.find((s) => s.id === sourceIds[0])!
  return {
    title: found.length > 1 ? `${first.title} + ${found.length - 1} más` : first.title,
    cards: cards.map((q) => ({
      id: q.id,
      sourceId: q.sourceId,
      type: q.type,
      topic: q.topic,
      difficulty: q.difficulty as Difficulty,
      prompt: q.prompt,
      data: q.data,
      explanation: q.explanation,
      sourceQuote: q.sourceQuote,
      sourceLocation: q.sourceLocation,
    })),
  }
}
