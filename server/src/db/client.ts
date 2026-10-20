import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { env } from '../env.js'
import * as schema from './schema.js'

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>

// En desarrollo este archivo está en src/db/; empaquetado para producción queda en dist/
const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder =
  env.MIGRATIONS_DIR ??
  [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle')].find((p) => existsSync(p)) ??
  path.resolve('drizzle')

/**
 * postgres://… → node-postgres (producción / Docker / Homebrew).
 * pglite://<carpeta> → Postgres embebido en Node: ideal para correr local sin instalar nada.
 * pglite://memory → en memoria (tests).
 * Las migraciones se aplican al arrancar.
 */
async function createDb(): Promise<{ db: DB; close: () => Promise<void> }> {
  if (env.DATABASE_URL.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite')
    const { drizzle } = await import('drizzle-orm/pglite')
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    const target = env.DATABASE_URL.slice('pglite://'.length)
    if (target !== 'memory') await mkdir(path.dirname(path.resolve(target)), { recursive: true })
    const client = target === 'memory' ? new PGlite() : new PGlite(path.resolve(target))
    const db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder })
    return { db: db as unknown as DB, close: () => client.close() }
  }

  const { Pool } = (await import('pg')).default
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { migrate } = await import('drizzle-orm/node-postgres/migrator')
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 })
  const db = drizzle(pool, { schema })
  await migrate(db, { migrationsFolder })
  return { db: db as unknown as DB, close: () => pool.end() }
}

const created = await createDb()
export const db = created.db
export const closeDb = created.close
