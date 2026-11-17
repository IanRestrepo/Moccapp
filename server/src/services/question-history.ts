import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { QuestionData, StudyCardDTO, StudyGuide } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { examAnswers, exams, guideExposure, questionBank } from '../db/schema.js'
import { currentProfile } from '../lib/profile.js'
import { conceptKeys } from './guide-concepts.js'
import { guideFingerprint } from './guide-grounding.js'

interface Question { id: string; sourceId: string; topic: string; sourceQuote: string; data: QuestionData; guideHash?: string | null }
export interface Seen { times: number; lastAt: number; credit: number | null }
export interface QuestionHistory { questions: Map<string, Seen>; concepts: Map<string, Seen> }
export const emptyHistory = (): QuestionHistory => ({ questions: new Map(), concepts: new Map() })
function add(map: Map<string, Seen>, key: string, times: number, at: number, credit: number | null) {
  const old = map.get(key)
  map.set(key, { times: (old?.times ?? 0) + times, lastAt: Math.max(old?.lastAt ?? 0, at), credit: !old || at >= old.lastAt ? credit : old.credit })
}

export async function questionHistory(questions: Question[], guides: Map<string, StudyGuide>): Promise<QuestionHistory> {
  const out = emptyHistory()
  if (!questions.length && !guides.size) return out
  const byId = new Map(questions.map(q => [q.id, q]))
  const ids = [...new Set([...guides.keys(), ...questions.map(q => q.sourceId)])]
  const [exposures, history] = await Promise.all([
    db.select().from(guideExposure).where(and(eq(guideExposure.profile, currentProfile()), inArray(guideExposure.sourceId, ids))),
    db.select({ questionId: examAnswers.questionId, credit: examAnswers.credit, at: exams.createdAt })
      .from(examAnswers).innerJoin(exams, eq(exams.id, examAnswers.examId)).innerJoin(questionBank, eq(questionBank.id, examAnswers.questionId))
      .where(and(eq(exams.profile, currentProfile()), inArray(questionBank.sourceId, ids))).orderBy(asc(exams.createdAt)),
  ])
  for (const h of history) {
    const q = byId.get(h.questionId)
    if (!q) continue
    const currentGuide = guides.get(q.sourceId)
    if (currentGuide && q.guideHash !== guideFingerprint(currentGuide)) continue
    add(out.questions, q.id, 1, h.at.getTime(), h.credit)
    const guide = guides.get(q.sourceId)
    if (guide) for (const key of conceptKeys(q.sourceId, q, guide)) add(out.concepts, key, 1, h.at.getTime(), h.credit)
  }
  for (const h of exposures) {
    const guide = guides.get(h.sourceId)
    if (!guide || h.guideHash !== guideFingerprint(guide)) continue
    add(out.questions, h.questionKey, h.timesSeen, h.lastSeenAt.getTime(), null)
    for (const key of h.concepts) add(out.concepts, key, h.timesSeen, h.lastSeenAt.getTime(), null)
  }
  return out
}

export async function recordExposure(cards: StudyCardDTO[], guide: StudyGuide): Promise<void> {
  if (!cards.length) return
  const rows = [...new Map(cards.map(card => [card.id, card])).values()].map(card => ({
    profile: currentProfile(), sourceId: card.sourceId, guideHash: guideFingerprint(guide), questionKey: card.id,
    concepts: conceptKeys(card.sourceId, card, guide), timesSeen: 1, lastSeenAt: new Date(),
  }))
  await db.insert(guideExposure).values(rows).onConflictDoUpdate({
    target: [guideExposure.profile, guideExposure.sourceId, guideExposure.guideHash, guideExposure.questionKey],
    set: { timesSeen: sql`${guideExposure.timesSeen} + 1`, lastSeenAt: new Date() },
  })
}
