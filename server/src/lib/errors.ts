import type { ErrorRequestHandler } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import type { ApiError } from '@vetquiz/shared'

/** Error con mensaje listo para mostrar en la UI (en español, sin jerga técnica). */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message)
  }
}

export const Errors = {
  notFound: (what = 'Eso') => new AppError(404, 'NOT_FOUND', `${what} no existe o fue borrado.`),
  unsupportedFile: () =>
    new AppError(400, 'UNSUPPORTED_FILE', 'Ese tipo de archivo no lo puedo leer. Sube PDF, Word, PowerPoint, una foto o un .txt.'),
  fileTooLarge: (mb: number) => new AppError(413, 'FILE_TOO_LARGE', `El archivo pesa más de ${mb} MB. Prueba con uno más liviano.`),
  invalidYoutube: () =>
    new AppError(400, 'INVALID_YOUTUBE_URL', 'Ese link no parece de YouTube. Copia el link del video desde el botón Compartir.'),
  videoUnavailable: () =>
    new AppError(422, 'VIDEO_UNAVAILABLE', 'Ese video es privado, no está listado o no está disponible. Prueba con uno público.'),
  noContent: () =>
    new AppError(422, 'INSUFFICIENT_CONTENT', 'No encontré suficiente contenido para hacer preguntas. ¿Es el archivo correcto?'),
  emptyDocument: () =>
    new AppError(422, 'EMPTY_DOCUMENT', 'No pude sacar texto de ese archivo. Si es escaneado, súbelo como PDF o como foto.'),
  aiBusy: () =>
    new AppError(503, 'AI_BUSY', 'La IA está ocupada en este momento. Intenta de nuevo en un minuto.', true),
  aiFailed: () =>
    new AppError(502, 'AI_FAILED', 'No pude generar las preguntas esta vez. Dale a "Reintentar" en un momento.', true),
  aiConfig: () =>
    new AppError(500, 'AI_CONFIG', 'La conexión con Gemini no está configurada bien (revisa GEMINI_API_KEY).'),
  conflict: (code: string, message: string) => new AppError(409, code, message),
}

export function toApiError(err: AppError): ApiError {
  return { error: { code: err.code, message: err.message, retryable: err.retryable } }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let appErr: AppError
  if (err instanceof AppError) appErr = err
  else if (err instanceof ZodError)
    appErr = new AppError(400, 'VALIDATION', err.issues[0]?.message ?? 'Datos inválidos.')
  else if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE')
    appErr = Errors.fileTooLarge(Number(process.env.UPLOAD_MAX_MB ?? 50))
  else if (err?.type === 'entity.too.large') appErr = new AppError(413, 'PAYLOAD_TOO_LARGE', 'El texto es demasiado largo.')
  else if (err?.type === 'entity.parse.failed') appErr = new AppError(400, 'BAD_JSON', 'Datos inválidos.')
  else {
    console.error(err)
    appErr = new AppError(500, 'INTERNAL', 'Algo salió mal de nuestro lado. Intenta de nuevo.', true)
  }
  res.status(appErr.status).json(toApiError(appErr))
}
