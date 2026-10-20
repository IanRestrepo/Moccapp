import { defineConfig } from 'drizzle-kit'

try {
  process.loadEnvFile('../.env')
} catch {
  // sin .env: `drizzle-kit generate` no necesita conexión
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
})
