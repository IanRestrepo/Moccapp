import assert from 'node:assert/strict'
import { after, test } from 'node:test'
process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
const { setLlm } = await import('../src/ai/gemini.js')
setLlm({ async generateJson() { return { title: 'Prueba', topics: [], insufficientContent: true, questions: [] } }, async uploadFile() { throw Error('no usado') } })
const { db, closeDb } = await import('../src/db/client.js')
const { sources, exams } = await import('../src/db/schema.js')
const { startChapterExam } = await import('../src/services/chapter-exams.js')
const { saveAnswer, submitExam, listHistory, getExamDTO } = await import('../src/services/exams/index.js')
const { runAs } = await import('../src/lib/profile.js')
const { eq } = await import('drizzle-orm')
after(closeDb)
test('el miniexamen guarda preguntas, respuestas, versión y resultados por intento y perfil', async () => {
  const [source] = await db.insert(sources).values({ title: 'Reproducción', kind: 'text', color: 'lilac', contentHash: 'chapter-test', status: 'ready' }).returning()
  const cards = [{ id: 'synthetic', sourceId: source!.id, type: 'multiple_choice' as const, topic: 'Ovario', difficulty: 1 as const,
    prompt: '¿Qué concepto corresponde a esta definición? Órgano que produce ovocitos.',
    data: { type: 'multiple_choice' as const, options: ['Ovario', 'Útero', 'Oviducto', 'Vagina'], correctIndex: 0, distractorRationales: [] },
    explanation: 'El ovario produce ovocitos.', sourceQuote: 'El ovario produce ovocitos.', sourceLocation: 'Guía: Ovario' }]
  const first = await startChapterExam(source!.id, `${source!.id}:s0`, 'Ovario', cards, 'version-test')
  const second = await startChapterExam(source!.id, `${source!.id}:s0`, 'Ovario', cards, 'version-test')
  assert.notEqual(first.examId, second.examId)
  assert.equal(first.cards[0]!.id, second.cards[0]!.id)
  await saveAnswer(first.examId, first.cards[0]!.id, { answer: { type: 'multiple_choice', selectedIndex: 1 } })
  const inProgress = await getExamDTO(first.examId)
  assert.equal(inProgress.status, 'in_progress')
  const result = await submitExam(first.examId, { auto: false })
  assert.equal(result.status, 'completed')
  if (result.status === 'completed') assert.equal(result.score, 0)
  assert.deepEqual(await submitExam(first.examId, { auto: false }), result)
  const history = await listHistory({ limit: 20 })
  assert.equal(history.exams.length, 2)
  assert.ok(history.exams.every(e => e.chapterTitle === 'Ovario'))
  const [row] = await db.select().from(exams).where(eq(exams.id, first.examId))
  assert.equal(row!.guideHash, 'version-test')
  await assert.rejects(runAs('other', () => getExamDTO(first.examId)))
  await assert.rejects(startChapterExam(source!.id, `${source!.id}:s1`, 'Vacío', [], 'version-test'), /preguntas verificadas/)
})

test('las lecciones aíslan capítulos y el resultado guardado determina las estrellas', async () => {
  const { studyGuides } = await import('../src/db/schema.js')
  const { ensureGuideQuestions } = await import('../src/services/bank.js')
  const { guideTopicQuiz, completeLesson } = await import('../src/services/path.js')
  const { guideFingerprint } = await import('../src/services/guide-grounding.js')
  const [source] = await db.insert(sources).values({ title: 'Guía por etapas', kind: 'text', color: 'lilac', contentHash: 'stages-test', status: 'ready' }).returning()
  const guide = { version: 2, overview: '', checklist: [], conceptMap: { center: 'Etapas', branches: [] }, sections: ['Inicial', 'Posterior'].map(title => ({
    title, summary: `${title}: explicación de los conceptos.`, location: '', keyPoints: [], tables: [], tip: '', bankTopics: [], images: [],
    terms: Array.from({ length: 4 }, (_, i) => ({ term: `${title} ${i}`, definition: `Definición del concepto ${title} número ${i}.` })),
  })) }
  await db.insert(studyGuides).values({ sourceId: source!.id, status: 'ready', data: guide })
  await ensureGuideQuestions(source!.id, guide)
  const quiz = await guideTopicQuiz(source!.id, 0)
  assert.equal(quiz.cards.length, 4)
  assert.ok(quiz.cards.every(c => !JSON.stringify(c).includes('Posterior')))
  for (const card of quiz.cards) await saveAnswer(quiz.examId, card.id, { answer: { type: 'multiple_choice', selectedIndex: 1 } })
  await submitExam(quiz.examId, { auto: false })
  const done = await completeLesson(quiz.pathKey, 4, 4, true, quiz.examId)
  assert.equal(done.stars, 1, 'no confiar en el conteo de aciertos enviado por el cliente')
  assert.equal(done.xp, 0, 'el examen ya entregó XP; no duplicarlos')
  const [saved] = await db.select().from(exams).where(eq(exams.id, quiz.examId))
  assert.equal(saved!.guideHash, guideFingerprint(guide))
  await assert.rejects(completeLesson(`${source!.id}:s1`, 4, 4, true, quiz.examId), /envía el miniexamen/)
})

test('un capítulo vacío espera su generación específica y abre el intento al terminar', async () => {
  const { studyGuides } = await import('../src/db/schema.js')
  const { guideTopicQuiz } = await import('../src/services/path.js')
  const { GUIDE_REVIEW_SYSTEM } = await import('../src/services/guide-review.js')
  const { expandBankOnce } = await import('../src/services/bank.js')
  const { FAST_BANK_PLAN } = await import('../src/ai/schemas.js')
  const [source] = await db.insert(sources).values({ title: 'Capítulo vacío', kind: 'text', color: 'lilac', contentHash: 'empty-chapter-test', status: 'ready' }).returning()
  const fact = 'El proceso de transporte ocurre mediante la lanzadera del citrato.'
  const make = (title: string, summary: string) => ({ title, summary, location: '', keyPoints: [], terms: [], tables: [], tip: '', bankTopics: [], images: [] })
  const guide = { version: 2, overview: '', checklist: [], conceptMap: { center: 'Etapas', branches: [] }, sections: [make('Transporte', fact), make('Capítulo posterior', 'DATO_POSTERIOR_NO_ESTUDIADO')] }
  await db.insert(studyGuides).values({ sourceId: source!.id, status: 'ready', data: guide })
  let focused = 0
  setLlm({ async generateJson(p) {
    if (p.system === GUIDE_REVIEW_SYSTEM) {
      assert.doesNotMatch(p.source[0]!.text!, /DATO_POSTERIOR/)
      return { approved: [0] }
    }
    if (p.source[0]!.text!.includes('DATO_POSTERIOR')) return { title: 'Capítulo vacío', topics: [], insufficientContent: true, questions: [] }
    focused++
    return { title: 'Transporte', topics: ['Transporte'], insufficientContent: false, questions: [{
      type: 'true_false', difficulty: 1, topic: 'Transporte', prompt: fact, options: ['Verdadero', 'Falso'], correctIndex: 0,
      explanation: fact, sourceQuote: fact, sourceLocation: 'Guía: Transporte',
      distractorRationales: [{ optionIndex: 1, why: 'El transporte se realiza mediante esa lanzadera.' }], matchingPairs: [], expectedAnswer: '', keyPoints: [],
    }] }
  }, async uploadFile() { throw Error('no usado') } })
  const quiz = await guideTopicQuiz(source!.id, 0)
  assert.equal(focused, 1)
  assert.equal(quiz.cards.length, 1)
  assert.ok(quiz.examId)
  assert.equal(quiz.cards[0]!.topic, 'Transporte')
  await expandBankOnce(source!.id, FAST_BANK_PLAN)
})
