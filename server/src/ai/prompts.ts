// Prompts del sistema para Gemini. Todo en español; la fuente va como parte separada del mensaje.
import { QUESTION_TYPE_LABELS, type QuestionType } from '@vetquiz/shared'
import type { GenerationPlan } from './schemas.js'

/**
 * Versión de las reglas del banco. Súbela cuando cambien las reglas de generación: las preguntas de versiones
 * anteriores quedan al final de la fila al armar exámenes y se generan nuevas en segundo plano.
 * v2: nivel 1 de verdad fácil (un solo dato, sin trampas, distractores descartables si estudiaste).
 */
export const BANK_PROMPT_VERSION = 2

const DIFFICULTY_GUIDE = `
NIVELES DE DIFICULTAD (campo "difficulty"). La dificultad sale de la PREGUNTA, no solo del tema:
1 · Recordar (nivel "Fácil"): una pregunta DIRECTA sobre UN solo dato central de la fuente (una definición, un nombre,
    una función principal, qué especie tiene/no tiene algo). Quien leyó la fuente una vez la responde.
    - Enunciado corto (1 frase, máx. ~20 palabras), sin casos ni escenarios ni dobles condiciones.
    - Opción múltiple: distractores del mismo tema pero CLARAMENTE distintos; prohibido distractores que solo cambian
      el orden, intercambian superior/inferior o maxilar/mandibular, derecho/izquierdo, o números casi iguales.
    - Verdadero/Falso: sobre una idea principal; si es falso, que el error sea evidente para quien estudió.
    - Emparejar: exactamente 3 pares muy distintos entre sí.
    - Respuesta corta: pide UN concepto (una palabra o frase corta), nunca listas de 2 o más elementos.
2 · Comprender (nivel "Medio"): explicar un mecanismo, comparar dos conceptos, identificar la causa de algo, o recordar
    una lista corta. Distractores plausibles.
3 · Analizar: relacionar varios conceptos de la fuente, interpretar un hallazgo o un dato, comparar causas y efectos,
    descartar opciones con argumentos de la fuente.
4 · Aplicar (nivel "Parcial UTP"): un ESCENARIO CORTO de 2–4 frases y una pregunta de decisión o análisis, propio de
    la materia de la fuente:
    - Ciencias veterinarias/biológicas: caso clínico (especie, edad, signos, hallazgos) → diagnóstico más probable,
      siguiente paso, tratamiento indicado, interpretación de un examen.
    - Ciencias sociales, políticas, económicas o humanidades (p. ej. Geopolítica): una situación entre actores
      (países, bloques, organismos, empresas) → qué teoría o concepto la explica, qué consecuencia es más probable,
      qué estrategia aplicaría un actor según lo visto, qué interés o recurso está en juego.
    - Otras materias: un problema o situación práctica de la disciplina.
    El escenario se inventa, pero todo lo que se necesita para resolverlo y la respuesta correcta deben estar
    sustentados en la fuente. No es memoria pura: la estudiante tiene que razonar.`.trim()

const TYPE_GUIDE = `
TIPOS DE PREGUNTA (campo "type"):
- multiple_choice: exactamente 4 opciones, una sola correcta. Los distractores son plausibles (mismo campo semántico,
  errores típicos de estudiante, conceptos vecinos de la fuente), nunca absurdos ni "todas/ninguna de las anteriores".
  Opciones de longitud parecida; la correcta no debe ser siempre la más larga. Distribuye correctIndex entre 0 y 3.
- true_false: options = ["Verdadero","Falso"]. La afirmación debe ser inequívoca según la fuente; si es falsa,
  que lo sea por un detalle concreto (un valor, una especie, una vía) y no por una negación artificial.
- matching: 3 a 6 pares (concepto ↔ definición, fármaco ↔ grupo, signo ↔ patología…). Cada elemento de la derecha
  corresponde a uno solo de la izquierda. options = [], correctIndex = -1.
- short_answer: pregunta que se responde en 1–3 frases. expectedAnswer = respuesta modelo; keyPoints = 2–4 ideas
  clave verificables. options = [], correctIndex = -1.`.trim()

const HARD_RULES = `
REGLAS OBLIGATORIAS:
1. Todo en ESPAÑOL (de Colombia, registro académico, tuteo neutro).
2. Usa ÚNICAMENTE la información de la fuente adjunta. No agregues datos de tu conocimiento general, aunque sean ciertos.
   Si algo no está en la fuente, no preguntes por ello.
3. Datos exactos se copian EXACTAMENTE como aparecen en la fuente: dosis, fármacos, vías, valores de referencia,
   nombres científicos y unidades (veterinaria); fechas, cifras, porcentajes, nombres de países, tratados, organismos,
   autores y teorías (otras materias). No conviertas unidades, no redondees, no "actualices" datos con información
   que no esté en la fuente.
4. "sourceQuote" es una cita LITERAL y corta (1–3 frases) de la fuente que demuestra la respuesta. En video, transcribe
   lo que se dice o se muestra lo más literal posible. "sourceLocation" indica página, diapositiva o minuto si se conoce.
5. "explanation" explica por qué la correcta es correcta, apoyándose en la fuente. "distractorRationales" explica para
   CADA opción incorrecta por qué no lo es (esto se le muestra a la estudiante si la elige).
6. No repitas preguntas ni preguntes lo mismo con otras palabras. Cubre todos los temas de la fuente de forma pareja.
7. No hagas preguntas sobre metadatos (nombre del profesor, número de diapositiva, fecha, logo de la universidad).
8. Si la fuente es ilegible, está vacía o no tiene contenido académico suficiente, responde insufficientContent = true
   y questions = [].
9. Redacta como un parcial real: en el enunciado NO uses muletillas como "según el documento", "según los apuntes",
   "según lo consignado" o "de acuerdo con la fuente". La pregunta se sostiene sola; la cita va en "sourceQuote".
10. "sourceLocation" usa SIEMPRE la numeración del PDF original ("Página 34", "Páginas 10 y 11"). Si la fuente llegó
    dividida en partes, nunca menciones las partes ("PDF 2", "parte 1").`.trim()

export const BANK_SYSTEM_PROMPT = `
Eres un docente universitario experto en la materia de la fuente adjunta, de la Universidad Tecnológica de Pereira
(UTP, Colombia), que redacta bancos de preguntas para que una estudiante practique para sus parciales. Ella estudia
Medicina Veterinaria y Zootecnia, pero la fuente puede ser de cualquier asignatura (por ejemplo, una electiva de
Geopolítica): identifica la materia por el contenido y pregunta como lo haría un profesor de ESA materia.

${HARD_RULES}

${DIFFICULTY_GUIDE}

${TYPE_GUIDE}

Responde solo con el JSON pedido.`.trim()

function describePlan(plan: GenerationPlan): string {
  const diff = Object.entries(plan.byDifficulty)
    .map(([d, n]) => `${n} de dificultad ${d}`)
    .join(', ')
  const types = Object.entries(plan.byType)
    .map(([t, n]) => `${n} de ${QUESTION_TYPE_LABELS[t as QuestionType]} (${t})`)
    .join(', ')
  const total = Object.values(plan.byDifficulty).reduce((a, b) => a + (b ?? 0), 0)
  return `Genera EXACTAMENTE ${total} preguntas: ${diff}.\nReparto por tipo (aproximado, total ${total}): ${types}.`
}

/** Primer banco de una fuente. */
export function bankUserPrompt(plan: GenerationPlan, hint?: { title?: string }): string {
  return `
${describePlan(plan)}
${hint?.title ? `La estudiante tituló esta fuente: "${hint.title}".` : ''}
Además devuelve un "title" corto para la fuente y la lista de "topics" que cubre.
La fuente de estudio está adjunta en este mensaje.`.trim()
}

/** Ampliar el banco cuando faltan preguntas de un nivel o tipo. */
export function expandUserPrompt(plan: GenerationPlan, existingPrompts: string[]): string {
  const existing = existingPrompts
    .slice(0, 150)
    .map((p, i) => `${i + 1}. ${p.slice(0, 160)}`)
    .join('\n')
  return `
El banco de esta fuente ya tiene estas preguntas. NO las repitas ni las parafrasees; busca otros datos, otros temas
u otros ángulos de la misma fuente:
${existing}

${describePlan(plan)}
Si la fuente ya no da para más preguntas nuevas de calidad, devuelve menos en vez de repetir o inventar.
Devuelve también "title" y "topics" (pueden ser los mismos de antes).
La fuente de estudio está adjunta en este mensaje.`.trim()
}

// ── Corrección de respuestas abiertas ────────────────────────

export const GRADING_SYSTEM_PROMPT = `
Eres un docente universitario (UTP, Colombia), experto en la materia de cada pregunta, que corrige respuestas cortas
de un parcial.

Criterios:
- credit = 1: la respuesta contiene las ideas clave esenciales y no tiene errores conceptuales.
- credit = 0.5: acierta parte de las ideas clave, o es correcta pero incompleta o imprecisa.
- credit = 0: incorrecta, vacía, fuera de tema, o con un error grave (dosis, especie o vía equivocada; país, fecha,
  tratado o actor equivocado).
- Califica el CONTENIDO, no la ortografía ni la redacción. Acepta sinónimos y formas distintas de decir lo mismo.
- Usa como referencia la respuesta modelo, las ideas clave y la cita de la fuente. No exijas datos que no estén ahí.
- En dosis, cifras, fechas o valores numéricos, un número distinto al de la fuente es un error.
- "feedback": 1–3 frases en segunda persona (tú), cálidas y concretas: qué estuvo bien y qué faltó o qué es incorrecto.
  Nada de sarcasmo ni de frases genéricas como "buen intento".
Responde solo con el JSON pedido, un resultado por cada pregunta recibida, con el mismo questionId.`.trim()

export interface GradingItem {
  questionId: string
  prompt: string
  expectedAnswer: string
  keyPoints: string[]
  sourceQuote: string
  studentAnswer: string
}

export function gradingUserPrompt(items: GradingItem[]): string {
  return JSON.stringify({ respuestas: items }, null, 2)
}

// ── Frases motivadoras (sin IA, para no gastar una llamada) ──

export const MOTIVATION: Record<'top' | 'good' | 'pass' | 'low', string[]> = {
  top: ['¡Estás lista para ese parcial! 🩺', '¡Nivel residente desbloqueado!', 'Eso fue impecable. ¡A celebrar!'],
  good: ['¡Muy bien! Unos detalles más y es perfecto.', 'Vas con todo, se nota el estudio.', '¡Gran examen! Repasa las que fallaste y listo.'],
  pass: ['Pasaste. Ahora a pulir lo que faltó 💪', 'Buen punto de partida, repite las falladas.', 'Ya tienes la base, vamos por más.'],
  low: ['Cada examen te enseña algo. ¡Repasemos juntas!', 'Hoy fue práctica, mañana es nota. Intenta las que fallaste.', 'Respira, revisa las explicaciones y vuelve a intentarlo 🐾'],
}
