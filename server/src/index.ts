import { env } from './env.js'
import { closeDb } from './db/client.js'
import { createApp } from './app.js'
import { resumePending } from './services/bank.js'

const server = createApp().listen(env.PORT, () => {
  console.log(`VetQuiz API en http://localhost:${env.PORT} · modelo ${env.GEMINI_MODEL}`)
})
// Armar un examen puede esperar una ampliación del banco (~3 min con PDFs grandes): sin el límite de 5 min de Node
server.requestTimeout = 10 * 60_000
server.headersTimeout = 10 * 60_000 + 1000
await resumePending()

async function shutdown() {
  server.close()
  await closeDb() // PGlite necesita cerrarse para guardar en disco
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
