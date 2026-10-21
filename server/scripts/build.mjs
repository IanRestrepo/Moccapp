// Empaqueta el servidor para producción: dist/index.js (servidor normal) y dist/vercel.js (Vercel).
// @vetquiz/shared (TypeScript) se incluye dentro; las dependencias de npm quedan externas.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  packages: 'external',
  alias: { '@vetquiz/shared': path.resolve(root, '../shared/src/index.ts') },
  logLevel: 'info',
}

// servidor normal (Mac, Docker)
await build({ ...common, entryPoints: [path.join(root, 'src/index.ts')], outfile: path.join(root, 'dist/index.js') })
// Vercel: exporta la app para api/index.mjs
await build({ ...common, entryPoints: [path.join(root, 'src/vercel.ts')], outfile: path.join(root, 'dist/vercel.js') })
