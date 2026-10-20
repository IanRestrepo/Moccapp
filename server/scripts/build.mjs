// Empaqueta el servidor para producción en dist/index.js.
// @vetquiz/shared (TypeScript) se incluye dentro; las dependencias de npm quedan externas.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [path.join(root, 'src/index.ts')],
  outfile: path.join(root, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  packages: 'external',
  alias: { '@vetquiz/shared': path.resolve(root, '../shared/src/index.ts') },
  logLevel: 'info',
})
