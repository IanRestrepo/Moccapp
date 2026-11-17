import { and, eq, inArray } from 'drizzle-orm'
import type { StudyCardDTO } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { questionBank } from '../db/schema.js'
import { insertExam } from './exams/index.js'
import { hashPrompt } from './ingest/hash.js'
import { BANK_PROMPT_VERSION } from '../ai/prompts.js'
import { Errors } from '../lib/errors.js'

/** Congela las preguntas del intento, incluidas las construidas desde las definiciones. */
export async function startChapterExam(sourceId: string, chapterKey: string, chapterTitle: string, cards: StudyCardDTO[], guideHash?: string) {
  if (!cards.length) throw Errors.conflict('QUESTIONS_PREPARING', 'No se obtuvieron preguntas verificadas para este capítulo. Pulsa Reintentar para volver a prepararlas.')
  const hashes = cards.map(c => hashPrompt(`chapter:${guideHash ?? 'source'}:${c.prompt}:${JSON.stringify(c.data)}`))
  await db.insert(questionBank).values(cards.map((c, i) => ({
    sourceId, type: c.type, topic: c.topic, difficulty: c.difficulty, prompt: c.prompt, data: c.data,
    explanation: c.explanation, sourceQuote: c.sourceQuote, sourceLocation: c.sourceLocation,
    guideHash, promptHash: hashes[i]!, promptVersion: BANK_PROMPT_VERSION, generationBatch: 1,
  }))).onConflictDoNothing()
  const rows = await db.select().from(questionBank).where(and(eq(questionBank.sourceId, sourceId), inArray(questionBank.promptHash, hashes)))
  const byHash = new Map(rows.map(q => [q.promptHash, q.id]))
  const saved = cards.map((c, i) => ({ ...c, id: byHash.get(hashes[i]!)! }))
  const examId = await insertExam({ sourceIds: [sourceId], chapterKey, chapterTitle, guideHash, identityOrder: true,
    level: 'easy', types: [...new Set(cards.map(c => c.type))], mode: 'normal', timeLimitSec: 24 * 60 * 60,
    questionIds: saved.map(c => c.id) })
  return { examId, cards: saved }
}
