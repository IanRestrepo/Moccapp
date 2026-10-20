// Genera los íconos de la PWA: Mocca sobre fondo lila. Requiere macOS (qlmanage + sips).
// Uso: node scripts/gen-icons.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mocca = readFileSync(path.join(root, 'scripts/mocca-happy.svg'), 'utf8')
  .replace(/^<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')

/** `pad` = margen para íconos "maskable" (Android recorta un círculo) */
const icon = (size, pad) => {
  const s = (size * (1 - pad * 2)) / 210
  const x = (size - 200 * s) / 2
  const y = (size - 210 * s) / 2 + size * 0.02
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${pad ? 0 : size * 0.22}" fill="#ab90f7"/>
  <g transform="translate(${x} ${y}) scale(${s})">${mocca}</g>
</svg>`
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'vq-icons-'))
const targets = [
  ['icon-192.png', 192, 0.1],
  ['icon-512.png', 512, 0.1],
  ['icon-maskable-512.png', 512, 0.2],
  ['apple-touch-icon.png', 180, 0.1],
]
for (const [name, size, pad] of targets) {
  const svg = path.join(tmp, `${name}.svg`)
  writeFileSync(svg, icon(size, pad))
  execFileSync('qlmanage', ['-t', '-s', String(size), '-o', tmp, svg], { stdio: 'ignore' })
  renameSync(`${svg}.png`, path.join(root, 'public/icons', name))
  execFileSync('sips', ['-z', String(size), String(size), path.join(root, 'public/icons', name)], { stdio: 'ignore' })
  console.log(name)
}
writeFileSync(path.join(root, 'public/icons/icon.svg'), icon(512, 0.1))
