// Mudanza: copia todo de la base local (PGlite) a un Postgres (Neon) y los archivos a Vercel Blob.
//
//   FROM=pglite://./.data/pg TO=postgres://… [BLOB_READ_WRITE_TOKEN=…] [STORAGE_DIR=./uploads] \
//     npx tsx scripts/move-to-postgres.ts [--replace]
//
// El destino recibe primero las migraciones. Si ya tiene datos, se detiene (o con --replace los borra antes).
// La base local no se toca.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { PgTable } from 'drizzle-orm/pg-core'
import pg from 'pg'
import * as schema from '../src/db/schema.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const FROM = process.env.FROM ?? 'pglite://./.data/pg'
const TO = process.env.TO
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? './uploads')
const BLOB = process.env.BLOB_READ_WRITE_TOKEN
const replace = process.argv.includes('--replace')

if (!TO?.startsWith('postgres')) throw new Error('Falta TO=postgres://…')
if (!FROM.startsWith('pglite://')) throw new Error('FROM debe ser pglite://<carpeta>')

// orden de las llaves foráneas
const TABLES: [string, PgTable][] = [
  ['sources', schema.sources],
  ['question_bank', schema.questionBank],
  ['exams', schema.exams],
  ['exam_answers', schema.examAnswers],
  ['user_stats', schema.userStats],
  ['rewards', schema.rewards],
  ['redemptions', schema.redemptions],
  ['path_progress', schema.pathProgress],
]

const local = new PGlite(path.resolve(FROM.slice('pglite://'.length)))
const src = drizzlePglite(local, { schema })
const pool = new pg.Pool({ connectionString: TO, max: 4 })
const dst = drizzlePg(pool, { schema })

console.log('→ migraciones en el destino')
await migrate(dst, { migrationsFolder: path.resolve(here, '../drizzle') })

const counts = await Promise.all(TABLES.map(async ([name]) => Number((await pool.query(`select count(*) from "${name}"`)).rows[0].count)))
if (counts.some((n) => n > 0)) {
  if (!replace) throw new Error(`El destino ya tiene datos (${TABLES.map(([n], i) => `${n}=${counts[i]}`).join(', ')}). Usa --replace para borrarlos.`)
  console.log('→ borrando datos del destino (--replace)')
  await pool.query(`truncate ${TABLES.map(([n]) => `"${n}"`).join(', ')} cascade`)
}

// archivos: disco → Blob (las keys locales pasan a ser URLs del Blob)
const fileUrl = new Map<string, string>()
if (BLOB) {
  const { put } = await import('@vercel/blob')
  const withFiles = (await src.select().from(schema.sources)).filter((s) => s.storageKey && !/^https:\/\//.test(s.storageKey))
  for (const s of withFiles) {
    const buf = await readFile(path.resolve(STORAGE_DIR, s.storageKey!)).catch(() => null)
    if (!buf) {
      console.warn(`  ! no está el archivo de "${s.title}" (${s.storageKey}); queda sin archivo`)
      continue
    }
    const r = await put(`uploads/${s.storageKey}`, buf, { access: 'public', addRandomSuffix: true, contentType: s.mimeType ?? undefined })
    fileUrl.set(s.storageKey!, r.url)
    console.log(`  ↑ ${s.title} (${(buf.length / 1e6).toFixed(1)} MB)`)
  }
} else console.warn('  ! sin BLOB_READ_WRITE_TOKEN: los archivos no se copian (las fuentes ya tienen su banco de preguntas)')

for (const [name, table] of TABLES) {
  let rows = (await src.select().from(table)) as Record<string, unknown>[]
  if (name === 'sources') rows = rows.map((r) => ({ ...r, storageKey: r.storageKey ? (fileUrl.get(r.storageKey as string) ?? r.storageKey) : null }))
  // exams se refiere a sí mismo (parent_exam_id): primero los padres
  if (name === 'exams') rows.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime())
  for (let i = 0; i < rows.length; i += 200) await dst.insert(table).values(rows.slice(i, i + 200) as never)
  console.log(`  ✓ ${name}: ${rows.length}`)
}

// verificación
const check = await Promise.all(TABLES.map(async ([name]) => Number((await pool.query(`select count(*) from "${name}"`)).rows[0].count)))
const local_ = await Promise.all(TABLES.map(async ([name]) => Number((await local.query<{ count: number }>(`select count(*)::int as count from "${name}"`)).rows[0]!.count)))
const bad = TABLES.filter((_, i) => check[i] !== local_[i])
if (bad.length) throw new Error(`No cuadran: ${bad.map(([n]) => n).join(', ')}`)
await dst.execute(sql`select 1`)
console.log('✔ mudanza completa: todas las tablas cuadran')

await pool.end()
await local.close()
