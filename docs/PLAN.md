# VetQuiz — Fase 1: diseño (entregables 1–5)

> Nombre de trabajo: **VetQuiz**. Mascota: **Mocca** (basada en la perrita de la casa). Los dos se pueden cambiar.

## 0. Decisiones y supuestos

| Tema | Decisión |
|---|---|
| Despliegue | Local primero (Postgres en Docker o Homebrew, archivos en disco). `storage.ts` abstrae disco ↔ S3/R2 para subir a la nube después. |
| Modelo IA | `GEMINI_MODEL=gemini-3.8-flash`: el Flash estable más reciente según [la lista de modelos](https://ai.google.dev/gemini-api/docs/models), verificado el 19-oct-2026. Se usa `ai.models.generateContent` con `responseMimeType: 'application/json'` + `responseJsonSchema` (generado desde Zod con `z.toJSONSchema`). |
| Respuestas abiertas | Crédito parcial 0 / 0.5 / 1, corregido por Gemini en **una sola llamada por examen** (todas las abiertas juntas) y guardado en `exam_answers`. |
| Nota | `nota = round(5 × créditos / preguntas, 1)`. Aprueba con ≥ 3.0. Las preguntas sin responder valen 0. |
| Tipografía | Bricolage Grotesque (display) + Plus Jakarta Sans (cuerpo), servidas localmente con `@fontsource-variable` para que funcionen offline en la PWA. |
| Tailwind | v4 (`@tailwindcss/vite`), con tokens como variables CSS en `@theme`. |
| Estado cliente | Pinia (no estaba en el stack; es lo estándar en Vue 3 y sirve para el examen en curso). |
| Barajado | El servidor baraja las opciones (MC) y la columna derecha (emparejar) **al crear el examen** y guarda la permutación. Así el cliente nunca recibe la respuesta y el modelo no puede "acostumbrarla" a que la correcta sea siempre la B. |
| Cronómetro | La fuente de verdad es `deadline_at` en el servidor. El cliente corrige el desfase con `serverNow`. Se aceptan envíos hasta 15 s después del límite (latencia del celular); lo que llegue más tarde se envía en automático con lo guardado. |
| Autosave | Cada respuesta se guarda al elegirla (`PUT …/answers/:qid`). Si se cierra la pestaña o se cae el WiFi, el examen sigue donde iba. |
| Racha | Cuenta el día (zona `America/Bogota`) en que se **termina** al menos un examen. Saltarse un día la reinicia a 1. |
| Usuario | Sin auth. Una sola fila `user_stats` (id = 1). |

## 1. Estructura del monorepo

```
vetquiz/
├─ package.json              # npm workspaces: shared, server, client
├─ docker-compose.yml        # Postgres 17
├─ .env.example
├─ docs/PLAN.md              # este archivo
├─ shared/                   # tipos + Zod compartidos (contratos de la API)
│  └─ src/index.ts
├─ server/
│  ├─ drizzle.config.ts
│  ├─ drizzle/               # migraciones generadas
│  ├─ uploads/               # archivos subidos (gitignored)
│  └─ src/
│     ├─ index.ts            # arranque
│     ├─ app.ts              # express, cors, rutas, manejador de errores
│     ├─ env.ts              # validación de variables con Zod
│     ├─ db/
│     │  ├─ client.ts        # pool pg + drizzle
│     │  └─ schema.ts        # ✅ entregable 2
│     ├─ ai/
│     │  ├─ gemini.ts        # cliente @google/genai, reintentos, inline vs File API
│     │  ├─ prompts.ts       # ✅ entregable 4
│     │  └─ schemas.ts       # ✅ entregable 4 (Zod → responseJsonSchema)
│     ├─ services/
│     │  ├─ ingest/
│     │  │  ├─ hash.ts       # sha256 de bytes / texto normalizado / id del video
│     │  │  ├─ docx.ts       # mammoth → texto
│     │  │  ├─ pptx.ts       # jszip → texto con "Diapositiva N"
│     │  │  └─ youtube.ts    # validar URL, extraer videoId, oEmbed para título y miniatura
│     │  ├─ storage.ts       # disco local (después S3/R2)
│     │  ├─ bank.ts          # generar / ampliar banco
│     │  ├─ exam-builder.ts  # armar examen desde el banco (sin IA)
│     │  ├─ grading.ts       # corregir auto + abiertas con IA
│     │  └─ gamification.ts  # XP, nivel, racha
│     ├─ routes/
│     │  ├─ sources.ts
│     │  ├─ exams.ts
│     │  └─ stats.ts
│     └─ lib/
│        ├─ errors.ts        # AppError con mensajes amigables
│        └─ retry.ts         # backoff exponencial con jitter
└─ client/
   ├─ index.html
   ├─ vite.config.ts         # vue, tailwind, PWA
   ├─ public/
   │  ├─ icons/              # íconos PWA
   │  └─ sounds/             # tap, correct, wrong, tick, finish (.webm + .mp3)
   └─ src/
      ├─ main.ts, App.vue, router.ts
      ├─ styles/tokens.css   # ✅ entregable 5
      ├─ styles/main.css
      ├─ api/client.ts       # fetch tipado con @vetquiz/shared
      ├─ stores/             # exam.ts, prefs.ts
      ├─ composables/        # useCountdown, useSound, useConfetti, useReducedMotion
      ├─ components/
      │  ├─ ui/              # ✅ Button, Card, Pill, ProgressBar (entregable 5)
      │  ├─ mascot/          # ✅ MascotBlob.vue
      │  ├─ BottomNav.vue, SourceFolder.vue, TimerBadge.vue, DecoStickers.vue
      │  └─ questions/       # MultipleChoice, TrueFalse, Matching, ShortAnswer
      └─ views/
         ├─ HomeView.vue        # "Hoy"
         ├─ SourcesView.vue     # "Tus fuentes" (carpetas)
         ├─ NewSourceView.vue   # Archivo / Texto / YouTube
         ├─ ConfigureView.vue
         ├─ ExamView.vue
         ├─ ResultsView.vue
         ├─ HistoryView.vue
         └─ DesignView.vue      # vitrina del sistema de diseño (solo dev)
```

## 2. Esquema de datos

Ver [`server/src/db/schema.ts`](../server/src/db/schema.ts). Resumen:

- **sources**: `content_hash` es único, así que subir el mismo PDF dos veces devuelve la fuente existente y no se vuelve a llamar a la IA. Guarda el texto extraído de DOCX/PPTX/texto pegado, el `geminiFileUri` si se usó la File API (caduca a las 48 h y se re-sube solo si hay que ampliar el banco), el estado (`processing → ready | error`) y los `topics`.
- **question_bank**: una fila por pregunta, con `type`, `difficulty` 1–4, `topic`, `prompt`, `data` jsonb (opciones / pares / respuesta modelo, más la razón de cada distractor), `explanation`, `source_quote` y `source_location`. `prompt_hash` es único por fuente para que una ampliación no meta duplicados.
- **exams**: configuración (nivel, tipos, cantidad, tiempo), `deadline_at`, resultado (`percent`, `score`, `xp_earned`), `mode` (`normal` o `retry_failed`) y `parent_exam_id`.
- **exam_answers**: se crean **al armar** el examen (fijan el orden y el barajado `display_order`). Guardan la respuesta, el crédito, quién corrigió (`auto` o `ai`) y el feedback.
- **user_stats**: XP total, racha actual y máxima, último día activo, fechas activas recientes y la preferencia de sonido.

## 3. API REST

Base: `/api`. Errores siempre como `{ error: { code, message, retryable } }`, con `message` listo para mostrar en la UI.

### Fuentes

**`POST /api/sources`** crea una fuente y genera su banco en segundo plano.
- Archivo: `multipart/form-data` con `file` y `title?`. Acepta PDF, DOCX, PPTX, JPG/PNG/WEBP/HEIC y TXT, hasta `UPLOAD_MAX_MB`.
- Texto: JSON `{ "kind": "text", "text": "...", "title?": "..." }`
- YouTube: JSON `{ "kind": "youtube", "url": "https://youtu.be/...", "title?": "..." }`

```jsonc
// 202 Accepted (nueva) · 200 OK (ya existía con el mismo hash)
{ "source": SourceDTO, "deduplicated": false }
```
Errores: `400 UNSUPPORTED_FILE`, `400 TEXT_TOO_SHORT`, `400 INVALID_YOUTUBE_URL`, `413 FILE_TOO_LARGE`.

**`GET /api/sources`** → `{ "sources": SourceDTO[] }`, las más recientes primero.

**`GET /api/sources/:id`** → `{ "source": SourceDTO }`. El cliente consulta cada 2 s mientras `status = "processing"`.
Si termina en `error`, `errorMessage` trae un texto amigable, por ejemplo *"Ese video es privado o no está disponible. Prueba con uno público."*

**`POST /api/sources/:id/retry`** reintenta una generación que falló → `202 { "source": SourceDTO }`

**`PATCH /api/sources/:id`** `{ "title?": string, "color?": SourceColor }` → `{ "source": SourceDTO }`

**`DELETE /api/sources/:id`** → `204`. Borra en cascada el banco y los exámenes, y el archivo en disco.

### Exámenes

**`POST /api/exams`** arma un examen desde el banco.
```jsonc
// request (CreateExamSchema)
{ "sourceId": "uuid", "level": "utp", "timeLimitMin": 30, "questionCount": 20, "types": ["multiple_choice","true_false","matching","short_answer"] }
// 201
{ "exam": ExamInProgressDTO, "bankExpanded": false }
```
- Si `questionCount` no viene, se usa `suggestQuestionCount(tiempo, tipos, nivel)` (en `shared`).
- Si faltan preguntas del nivel o tipo pedidos, se **amplía el banco** con Gemini antes de responder (`bankExpanded: true`; tarda unos 15–30 s y el cliente muestra un loader). Si aun así no alcanzan, se completa con niveles vecinos y se responde igual.
- El cronómetro **empieza al responder**: `deadlineAt = now + timeLimit`.

**`POST /api/exams/:id/retry-failed`** crea un examen solo con las preguntas falladas (crédito < 1) del examen `:id`. Usa el mismo nivel y un tiempo proporcional: `ceil(tiempo × falladas / total)`, mínimo 3 min.
→ `201 { "exam": ExamInProgressDTO }` · `409 NOTHING_TO_RETRY` si no falló ninguna.

**`POST /api/exams/:id/repeat`** crea un examen nuevo con la misma fuente y configuración, priorizando preguntas que no han salido → `201 { "exam": ExamInProgressDTO }`

**`GET /api/exams/:id`** → `{ "exam": ExamInProgressDTO | ExamResultDTO }` según el estado. Si está `in_progress` y ya pasó el `deadline`, el servidor lo envía en automático antes de responder.

**`PUT /api/exams/:id/answers/:questionId`** guarda la respuesta (autosave).
```jsonc
// request
{ "answer": { "type": "multiple_choice", "selectedIndex": 2 }, "timeSpentSec": 41 }
// 200
{ "saved": true, "remainingSec": 1180 }
```
`409 EXAM_CLOSED` si ya se envió o venció.

**`POST /api/exams/:id/submit`** envía y corrige.
```jsonc
// request
{ "auto": false, "answers": [ { "questionId": "uuid", "answer": { ... } } ] }   // answers es opcional
// 200
{ "result": ExamResultDTO }
```
Corrige automáticamente MC, V/F y emparejar (emparejar da crédito proporcional: 3 de 4 pares = 0.75, que se redondea a 0.5). Las abiertas se corrigen con Gemini en un lote; si Gemini falla tras los reintentos, esas quedan en `credit: null` con `feedback: "Pendiente de corrección"` y el examen pasa a `grading`. Después las corrige `POST /api/exams/:id/regrade`.

**`GET /api/exams?sourceId=&cursor=&limit=20`** → `{ "exams": ExamHistoryItemDTO[], "nextCursor": string | null }`

### Stats

**`GET /api/stats`** → `{ "stats": StatsDTO }`
**`PATCH /api/stats`** `{ "soundEnabled?": boolean, "displayName?": string }` → `{ "stats": StatsDTO }`

### XP

| Concepto | XP |
|---|---|
| Por crédito | `10 × multiplicador del nivel` (Fácil 1 · Medio 1.25 · Difícil 1.5 · UTP 2) |
| Terminar un examen | +20 |
| Nota ≥ 4.0 | +25 · Nota 5.0: +50 |
| Primer examen del día (racha) | +10 × min(racha, 7) |

Nivel = `floor(sqrt(totalXp / 50)) + 1`. Crece rápido al principio y más despacio después.

## 4. Pipeline de IA

```
Subida ──► hash ──► ¿existe? ── sí ──► devolver fuente (sin IA)
                       │ no
                       ▼
          crear source(status=processing) ──► 202 al cliente
                       │ (en segundo plano)
                       ▼
   PDF / imagen  ──► inline (≤15 MB) o File API ─┐
   DOCX / PPTX   ──► texto extraído ────────────┤
   Texto pegado  ──► tal cual ───────────────────┼──► 2 llamadas paralelas generateContent
   YouTube       ──► fileData.fileUri = URL ─────┘    (niveles 1–2 y niveles 3–4, 24 c/u)
                                                        │
                    Zod valida pregunta por pregunta ◄──┘
                                │
                     dedupe por prompt_hash ──► insert question_bank ──► status=ready
```

- **Reintentos**: hasta 3, con backoff de 1 s → 3 s → 9 s más jitter, solo en 429/5xx/timeout o JSON inválido. Un 400 de YouTube (privado o no disponible) no se reintenta y se traduce al mensaje amigable.
- **Mínimo útil**: si después de validar quedan menos de 15 preguntas, se hace una tercera llamada. Si `insufficientContent = true`, la fuente queda en `error` con *"No encontré suficiente contenido para hacer preguntas. ¿Es la página correcta?"*
- **Temperatura**: 0.4 para generar (variedad sin inventar) y 0 para corregir abiertas.
- **Prompts y schemas**: [`server/src/ai/prompts.ts`](../server/src/ai/prompts.ts) y [`server/src/ai/schemas.ts`](../server/src/ai/schemas.ts).

### Armado del examen (sin IA)

1. Mezcla de dificultad según el nivel elegido:
   - Fácil: 70 % nivel 1, 30 % nivel 2
   - Medio: 20 % nivel 1, 60 % nivel 2, 20 % nivel 3
   - Difícil: 20 % nivel 2, 60 % nivel 3, 20 % nivel 4
   - Parcial UTP: 70 % nivel 4, 30 % nivel 3
2. Solo los tipos elegidos, repartidos de forma pareja.
3. Prioridad: primero las que nunca han salido, luego las falladas, luego las más antiguas.
4. Se varían los temas (round-robin por `topic`) para que no salgan 5 seguidas del mismo.

## 5. Sistema de diseño

- Tokens: [`client/src/styles/tokens.css`](../client/src/styles/tokens.css)
- Componentes: [`client/src/components/ui/`](../client/src/components/ui/) y [`client/src/components/mascot/MascotBlob.vue`](../client/src/components/mascot/MascotBlob.vue)
- Vitrina: `npm run dev --workspace client` → `http://localhost:5173/#/design`

## Próximas fases

- ✅ **Fase 2**: ingesta y generación del banco. Probada con un PDF real de anatomía de 103 MB (se divide en partes de máx. 40 MB).
- ✅ **Fase 3**: exámenes y corrección (`services/exams/*`, `gamification`, rutas `exams` y `stats`). Si Gemini no puede corregir las abiertas, `submit` responde `503 GRADING_PENDING` (respuestas guardadas) y `POST /exams/:id/regrade` lo reintenta.
- ✅ **Fase 4**: frontend completo (popup de nueva fuente, las 6 pantallas, sonidos, confetti, PWA).
- ✅ **Fase 5**: [README](../README.md) con instrucciones local y nube (Railway + Dockerfile), código de acceso para internet.
