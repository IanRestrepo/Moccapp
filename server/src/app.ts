import path from 'node:path'
import cors from 'cors'
import express from 'express'
import { env } from './env.js'
import { accessStatus, enterAccess, requireAccess } from './lib/access.js'
import { AppError, errorHandler } from './lib/errors.js'
import { examsRouter } from './routes/exams.js'
import { adminRouter, presenceRouter, rewardsRouter } from './routes/rewards.js'
import { sourcesRouter } from './routes/sources.js'
import { statsRouter } from './routes/stats.js'
import { studyRouter } from './routes/study.js'
import { uploadsRouter } from './routes/uploads.js'
import { pathRouter } from './routes/path.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  // detrás del proxy de Railway/Render: IP real y cookies "secure"
  app.set('trust proxy', 1)
  if (!env.STATIC_DIR) app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }))
  // texto pegado hasta ~400k caracteres
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', (_req, res) => res.json({ ok: true, model: env.GEMINI_MODEL }))
  app.use('/api/uploads', uploadsRouter)
  app.use('/api', requireAccess)
  app.get('/api/access', accessStatus)
  app.post('/api/access', enterAccess)
  app.use('/api/sources', sourcesRouter)
  app.use('/api/exams', examsRouter)
  app.use('/api/stats', statsRouter)
  app.use('/api/study', studyRouter)
  app.use('/api/path', pathRouter)
  app.use('/api/rewards', rewardsRouter)
  app.use('/api/admin', adminRouter)
  app.use('/api/presence', presenceRouter)

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Ruta no encontrada.')))

  // En producción el mismo servidor entrega la app (PWA). El router del cliente usa #, así que basta index.html.
  if (env.STATIC_DIR) {
    const root = path.resolve(env.STATIC_DIR)
    app.use(
      express.static(root, {
        index: 'index.html',
        // los archivos con hash se cachean para siempre; index.html y el service worker, nunca
        setHeaders: (res, file) =>
          res.setHeader('Cache-Control', /\/assets\//.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache'),
      }),
    )
  }

  app.use(errorHandler)
  return app
}
