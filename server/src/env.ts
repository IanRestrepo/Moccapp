import { z } from 'zod'

const EnvSchema = z.object({
  /** postgres://… o pglite://<carpeta> (Postgres embebido, sin instalar nada) o pglite://memory */
  DATABASE_URL: z.string().regex(/^(postgres(ql)?|pglite):\/\//, 'DATABASE_URL debe empezar con postgres:// o pglite://'),
  GEMINI_API_KEY: z.string().min(10, 'Falta GEMINI_API_KEY en .env'),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  /** Modelos de respaldo, en orden, si el principal se queda sin cuota o está saturado (la cuota gratis es por modelo) */
  GEMINI_FALLBACK_MODELS: z
    .string()
    .default('gemini-3.6-flash,gemini-3.5-flash-lite')
    .transform((v) => v.split(',').map((m) => m.trim()).filter(Boolean)),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  GEMINI_INLINE_MAX_MB: z.coerce.number().default(15),
  /** PDFs más pesados que esto se dividen en partes (Gemini acepta máx. 50 MB por PDF) */
  GEMINI_PDF_CHUNK_MAX_MB: z.coerce.number().default(40),
  UPLOAD_MAX_MB: z.coerce.number().default(150),
  STORAGE_DIR: z.string().default('./uploads'),
  /** En Vercel: los archivos van a Vercel Blob (no hay disco). Lo pone Vercel al crear el Blob */
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  APP_TIMEZONE: z.string().default('America/Bogota'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** Solo en la nube: código para entrar (mín. 8 caracteres). Vacío = sin código (local) */
  ACCESS_CODE: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined)
    .refine((v) => !v || v.length >= 8, 'ACCESS_CODE debe tener al menos 8 caracteres'),
  /**
   * Perfiles extra con su propio código, "nombre:código" separados por coma (ej. "ash:xxxx,magola:yyyy").
   * El primero es la dueña ("ash"): sus datos son los de siempre. Con esto, ACCESS_CODE ya no sirve para entrar
   * en dispositivos nuevos, pero los que ya entraron con él siguen siendo de la dueña.
   */
  PROFILE_CODES: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const [name, ...code] = p.split(':')
          return { name: name!.trim().toLowerCase(), code: code.join(':').trim() }
        }),
    )
    .refine((ps) => ps.every((p) => /^[a-z]{2,20}$/.test(p.name) && p.code.length >= 8), 'PROFILE_CODES: "nombre:código" con código de 8+ caracteres')
    .refine((ps) => !ps.length || ps[0]!.name === 'ash', 'PROFILE_CODES: el primer perfil debe ser "ash" (la dueña)'),
  /** Código de la página de administrador (premios). En producción es obligatorio; vacío en local = abierta */
  ADMIN_CODE: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined)
    .refine((v) => !v || v.length >= 8, 'ADMIN_CODE debe tener al menos 8 caracteres'),
  /** WhatsApp del administrador con indicativo y sin "+" (ej. 573001234567): ahí llega el aviso de cada premio */
  ADMIN_WHATSAPP: z
    .string()
    .optional()
    .transform((v) => v?.replace(/\D/g, '') || undefined),
  /** Nombre de la dueña de la app (la saludan los premios) */
  OWNER_NAME: z.string().default('Ashley'),
  /** Carpeta con el build del cliente (client/dist) para servir la app desde el mismo servidor */
  STATIC_DIR: z.string().optional(),
  /** Carpeta de migraciones (si no se encuentra sola) */
  MIGRATIONS_DIR: z.string().optional(),
})

export const env = EnvSchema.parse(process.env)
