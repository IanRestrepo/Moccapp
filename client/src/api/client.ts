// Cliente tipado de la API. Los contratos vienen de @vetquiz/shared: si el backend cambia, esto no compila.
import type {
  Answer,
  ApiError,
  CreateExamInput,
  CreateExamResponse,
  ExamDTO,
  ExamHistoryItemDTO,
  ExamInProgressDTO,
  AdminRewardsDTO,
  AdminPresenceDTO,
  AdminPersonDTO,
  PingResponse,
  SentMoccaMessageDTO,
  MoccaMessageMood,
  CollectionDTO,
  CollectionInput,
  StudyDeckDTO,
  PathDTO,
  PathLessonDTO,
  PathCompleteResponse,
  PresenceView,
  RedeemResponse,
  RedemptionDTO,
  RewardDTO,
  RewardInput,
  RewardsDTO,
  SourceColor,
  SourceDTO,
  StatsDTO,
} from '@vetquiz/shared'

/** Error con el mensaje amigable que manda el backend, listo para mostrar */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message)
  }
}

const networkError = () =>
  new ApiRequestError('Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.', 'NETWORK', 0, true)

/** Si el servidor pide código de acceso, App.vue muestra la pantalla de entrada */
export const LOCKED_EVENT = 'vq:locked'
const signalLocked = (code: string) => code === 'ACCESS_REQUIRED' && window.dispatchEvent(new Event(LOCKED_EVENT))

async function toError(res: Response): Promise<ApiRequestError> {
  const body = (await res.json().catch(() => null)) as ApiError | null
  if (body?.error) signalLocked(body.error.code)
  if (body?.error) return new ApiRequestError(body.error.message, body.error.code, res.status, body.error.retryable)
  return new ApiRequestError('Algo salió mal. Intenta de nuevo.', 'UNKNOWN', res.status, res.status >= 500)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw networkError()
  }
  if (!res.ok) throw await toError(res)
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export interface CreateSourceResponse {
  source: SourceDTO
  deduplicated: boolean
}

/** Subida con progreso real (fetch todavía no da progreso de subida, XHR sí). */
function uploadWithProgress(form: FormData, onProgress: (ratio: number) => void, signal?: AbortSignal): Promise<CreateSourceResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/sources')
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onerror = () => reject(networkError())
    xhr.onabort = () => reject(new ApiRequestError('Subida cancelada.', 'ABORTED', 0, false))
    xhr.onload = () => {
      const body = xhr.response as (CreateSourceResponse & ApiError) | null
      if (xhr.status >= 200 && xhr.status < 300 && body) return resolve(body)
      if (body?.error) signalLocked(body.error.code)
      if (body?.error) return reject(new ApiRequestError(body.error.message, body.error.code, xhr.status, body.error.retryable))
      reject(new ApiRequestError('No se pudo subir el archivo.', 'UPLOAD_FAILED', xhr.status, true))
    }
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(form)
  })
}

let blobMode: Promise<boolean> | null = null
const usesBlobUploads = () =>
  (blobMode ??= request<{ blobUploads?: boolean }>('GET', '/access')
    .then((s) => !!s.blobUploads)
    .catch(() => {
      blobMode = null
      return false
    }))

async function uploadViaBlob(file: File, opts: { title?: string; onProgress?: (r: number) => void; signal?: AbortSignal }): Promise<CreateSourceResponse> {
  const { upload } = await import('@vercel/blob/client')
  let blob
  try {
    blob = await upload(`uploads/${file.name}`, file, {
      access: 'public',
      handleUploadUrl: '/api/uploads/blob',
      multipart: file.size > 8 * 1024 * 1024,
      contentType: file.type || 'application/octet-stream',
      abortSignal: opts.signal,
      // la subida es casi todo el trabajo; el registro de la fuente es lo que falta
      onUploadProgress: (e) => opts.onProgress?.(Math.min(0.97, e.percentage / 100)),
    })
  } catch (err) {
    if (opts.signal?.aborted) throw err
    throw new ApiRequestError('No se pudo subir el archivo. Revisa tu internet e intenta de nuevo.', 'UPLOAD_FAILED', 0, true)
  }
  const res = await request<CreateSourceResponse>('POST', '/sources', {
    kind: 'blob',
    url: blob.url,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    title: opts.title,
  })
  opts.onProgress?.(1)
  return res
}

export const api = {
  // Código de acceso (solo en la nube)
  accessStatus: () =>
    request<{ required: boolean; granted: boolean; profile?: string | null; owner?: boolean; name?: string | null; blobUploads?: boolean }>('GET', '/access'),
  enter: (code: string) => request<{ granted: boolean }>('POST', '/access', { code }),

  // Fuentes
  listSources: () => request<{ sources: SourceDTO[] }>('GET', '/sources').then((r) => r.sources),
  getSource: (id: string) => request<{ source: SourceDTO }>('GET', `/sources/${id}`).then((r) => r.source),
  createTextSource: (text: string, title?: string) => request<CreateSourceResponse>('POST', '/sources', { kind: 'text', text, title }),
  createYoutubeSource: (url: string, title?: string) => request<CreateSourceResponse>('POST', '/sources', { kind: 'youtube', url, title }),
  async uploadSource(file: File, opts: { title?: string; onProgress?: (r: number) => void; signal?: AbortSignal } = {}) {
    // En Vercel el archivo va directo a Vercel Blob (las funciones no reciben más de 4,5 MB)
    if (await usesBlobUploads()) return uploadViaBlob(file, opts)
    const form = new FormData()
    form.append('file', file)
    if (opts.title) form.append('title', opts.title)
    return uploadWithProgress(form, opts.onProgress ?? (() => {}), opts.signal)
  },
  retrySource: (id: string) => request<{ source: SourceDTO }>('POST', `/sources/${id}/retry`).then((r) => r.source),
  updateSource: (id: string, patch: { title?: string; color?: SourceColor }) =>
    request<{ source: SourceDTO }>('PATCH', `/sources/${id}`, patch).then((r) => r.source),
  deleteSource: (id: string) => request<void>('DELETE', `/sources/${id}`),

  // Exámenes
  createExam: (input: CreateExamInput) => request<CreateExamResponse>('POST', '/exams', input),
  getExam: (id: string) => request<{ exam: ExamDTO }>('GET', `/exams/${id}`).then((r) => r.exam),
  saveAnswer: (examId: string, questionId: string, answer: Answer | null, timeSpentSec?: number) =>
    request<{ saved: true; remainingSec: number }>('PUT', `/exams/${examId}/answers/${questionId}`, { answer, timeSpentSec }),
  submitExam: (examId: string, body: { auto?: boolean; answers?: { questionId: string; answer: Answer | null }[] }) =>
    request<{ result: ExamDTO }>('POST', `/exams/${examId}/submit`, body).then((r) => r.result),
  regradeExam: (examId: string) => request<{ result: ExamDTO }>('POST', `/exams/${examId}/regrade`).then((r) => r.result),
  retryFailed: (examId: string) => request<CreateExamResponse>('POST', `/exams/${examId}/retry-failed`),
  repeatExam: (examId: string) => request<CreateExamResponse>('POST', `/exams/${examId}/repeat`),
  history: (q: { sourceId?: string; cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    return request<{ exams: ExamHistoryItemDTO[]; nextCursor: string | null }>('GET', `/exams?${params}`)
  },

  // Carpetas
  collections: () => request<{ collections: CollectionDTO[] }>('GET', '/collections').then((r) => r.collections),
  createCollection: (input: CollectionInput) => request<{ collection: CollectionDTO }>('POST', '/collections', input).then((r) => r.collection),
  updateCollection: (id: string, patch: { name?: string; color?: SourceColor }) =>
    request<{ collection: CollectionDTO }>('PATCH', `/collections/${id}`, patch).then((r) => r.collection),
  deleteCollection: (id: string) => request<void>('DELETE', `/collections/${id}`),
  addToCollection: (id: string, sourceIds: string[]) =>
    request<{ collection: CollectionDTO }>('POST', `/collections/${id}/sources`, { sourceIds }).then((r) => r.collection),
  removeFromCollection: (id: string, sourceId: string) =>
    request<{ collection: CollectionDTO }>('DELETE', `/collections/${id}/sources/${sourceId}`).then((r) => r.collection),

  // Avisos push
  pushKey: () => request<{ enabled: boolean; publicKey: string | null }>('GET', '/push/key'),
  pushSubscribe: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, admin = false) =>
    request<{ ok: true; sent: number }>('POST', '/push/subscribe', { subscription, admin }),

  // Modo estudio
  studyDeck: (sourceIds: string[]) => request<StudyDeckDTO>('GET', `/study?sources=${sourceIds.join(',')}`),

  // Camino
  path: () => request<PathDTO>('GET', '/path'),
  pathLesson: (key: string) => request<PathLessonDTO>('GET', `/path/${encodeURIComponent(key)}`),
  completeLesson: (key: string, body: { firstTry: number; total: number }) =>
    request<PathCompleteResponse>('POST', `/path/${encodeURIComponent(key)}/complete`, body),
  openChest: (key: string) => request<{ bones: number; xp: number; nextKey: string | null }>('POST', `/path/${encodeURIComponent(key)}/open`),

  // Premios (huesitos)
  rewards: () => request<RewardsDTO>('GET', '/rewards'),
  redeem: (rewardId: string) => request<RedeemResponse>('POST', `/rewards/${rewardId}/redeem`),

  // Presencia: la app avisa que está abierta
  ping: (view: PresenceView) => request<PingResponse>('POST', '/presence', { view }),
  messageSeen: (id: string) => request<void>('POST', `/presence/messages/${id}/seen`),

  // Administrador
  adminPresence: () => request<AdminPresenceDTO>('GET', '/admin/presence'),
  adminOverview: () => request<{ people: AdminPersonDTO[] }>('GET', '/admin/overview').then((r) => r.people),
  adminMessages: () => request<{ messages: SentMoccaMessageDTO[] }>('GET', '/admin/messages').then((r) => r.messages),
  sendMoccaMessage: (body: { profile: string; text: string; mood: MoccaMessageMood; push: boolean }) =>
    request<{ message: SentMoccaMessageDTO }>('POST', '/admin/messages', body).then((r) => r.message),
  adminStatus: () => request<{ required: boolean; granted: boolean; disabled: boolean }>('GET', '/admin/status'),
  adminLogin: (code: string) => request<{ granted: boolean }>('POST', '/admin/login', { code }),
  adminRewards: () => request<AdminRewardsDTO>('GET', '/admin/rewards'),
  createReward: (input: RewardInput) => request<{ reward: RewardDTO }>('POST', '/admin/rewards', input).then((r) => r.reward),
  updateReward: (id: string, patch: Partial<RewardInput>) =>
    request<{ reward: RewardDTO }>('PATCH', `/admin/rewards/${id}`, patch).then((r) => r.reward),
  deleteReward: (id: string) => request<void>('DELETE', `/admin/rewards/${id}`),
  resolveRedemption: (id: string, status: 'delivered' | 'cancelled') =>
    request<{ redemption: RedemptionDTO }>('PATCH', `/admin/redemptions/${id}`, { status }).then((r) => r.redemption),
  grantBones: (amount: number) => request<{ balance: number }>('POST', '/admin/bones', { amount }),

  // Stats
  stats: () => request<{ stats: StatsDTO }>('GET', '/stats').then((r) => r.stats),
  updateStats: (patch: { soundEnabled?: boolean; displayName?: string }) =>
    request<{ stats: StatsDTO }>('PATCH', '/stats', patch).then((r) => r.stats),
}

export type { ExamInProgressDTO }
