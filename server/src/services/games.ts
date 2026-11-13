// Jueguitos para estudiar: sopa de letras hecha con los términos de la guía de cada fuente (la pista es la definición;
// la palabra escondida es el término). Cada sopa terminada da un sobre; al abrirlo salen Moccas de colección.
import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import {
  MOCCA_INFO,
  MOCCA_MOODS,
  type MoccaAlbumDTO,
  type GameCompleteResponse,
  type GamesDTO,
  type MoccaMood,
  type MoccaRarity,
  type OpenPackResponse,
  type StudyGuide,
  type WordSearchDTO,
  type WordSearchWordDTO,
} from '@vetquiz/shared'
import { db } from '../db/client.js'
import { moccaCards, sources, userStats, wordGames } from '../db/schema.js'
import { AppError } from '../lib/errors.js'
import { currentProfile, isOwner, statsIdFor, visibleOwners } from '../lib/profile.js'
import { getStatsRow, localDate, recordActivity } from './gamification.js'
import { ensureGuide, guideStatus, guidesFor } from './guide.js'
import { getSource } from './sources.js'

type Rng = () => number

// ── Sopa de letras ───────────────────────────────────────────

/** "Médula ósea" → "MEDULAOSEA" (sin tildes ni espacios; la Ñ se conserva) */
export function gridWord(term: string): string {
  return term
    .toUpperCase()
    .replace(/Ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'Ñ')
    .replace(/[^A-ZÑ]/g, '')
}

const MIN_LEN = 3
const MAX_LEN = 12
const MAX_WORDS = 7
const MIN_WORDS = 4

interface Candidate {
  word: string
  display: string
  clue: string
  topic: string
}

/** La pista no puede decir la palabra: se cambia por una rayita */
function hideAnswer(clue: string, display: string): string {
  const escaped = display.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return clue.replace(new RegExp(escaped, 'gi'), '_____').trim()
}

/** Palabras que sirven para una sopa: los términos de la guía y, si faltan, los conceptos del mapa */
export function candidates(guide: StudyGuide): Candidate[] {
  const out: Candidate[] = []
  const seen = new Set<string>()
  const add = (display: string, clue: string, topic: string) => {
    const word = gridWord(display)
    if (word.length < MIN_LEN || word.length > MAX_LEN || seen.has(word) || clue.trim().length < 12) return
    seen.add(word)
    out.push({ word, display: display.trim(), clue: hideAnswer(clue, display.trim()), topic })
  }
  for (const s of guide.sections) for (const t of s.terms) add(t.term, t.definition, s.title)
  for (const b of guide.conceptMap.branches)
    for (const c of b.children ?? []) {
      if (c.detail) add(c.label, c.detail, b.label)
      for (const d of c.children ?? []) if (d.detail) add(d.label, d.detail, b.label)
    }
  return out
}

// hacia la derecha, hacia abajo y las dos diagonales que avanzan a la derecha (nunca al revés: es para estudiar)
const DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
]
const FILL = 'AAAAAEEEEEOOOOIIIUUSSRRNNLLDDCCTTMMPPBGVHFQJYZXÑ'

const shuffle = <T>(xs: T[], rng: Rng): T[] => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Arma la sopa: elige hasta 7 palabras (de temas distintos cuando se puede), las acomoda y rellena lo demás */
export function buildWordSearch(pool: Candidate[], rng: Rng = Math.random): { size: number; rows: string[]; words: WordSearchWordDTO[] } | null {
  // una por tema primero, luego las que falten
  const byTopic = new Map<string, Candidate[]>()
  for (const c of shuffle(pool, rng)) byTopic.set(c.topic, [...(byTopic.get(c.topic) ?? []), c])
  const picked: Candidate[] = []
  for (let round = 0; picked.length < MAX_WORDS; round++) {
    const layer = [...byTopic.values()].map((list) => list[round]).filter((c): c is Candidate => !!c)
    if (!layer.length) break
    picked.push(...layer.slice(0, MAX_WORDS - picked.length))
  }
  if (picked.length < MIN_WORDS) return null

  const longest = Math.max(...picked.map((c) => c.word.length))
  const size = Math.min(13, Math.max(10, longest + 1))
  const grid: string[][] = Array.from({ length: size }, () => Array<string>(size).fill(''))
  const placed: WordSearchWordDTO[] = []
  // las largas primero: son las más difíciles de acomodar
  for (const c of [...picked].sort((a, b) => b.word.length - a.word.length)) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const [dr, dc] = DIRS[Math.floor(rng() * DIRS.length)]!
      const row = Math.floor(rng() * size)
      const col = Math.floor(rng() * size)
      const endR = row + dr * (c.word.length - 1)
      const endC = col + dc * (c.word.length - 1)
      if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue
      let fits = true
      for (let i = 0; i < c.word.length; i++) {
        const cell = grid[row + dr * i]![col + dc * i]!
        if (cell && cell !== c.word[i]) {
          fits = false
          break
        }
      }
      if (!fits) continue
      for (let i = 0; i < c.word.length; i++) grid[row + dr * i]![col + dc * i] = c.word[i]!
      placed.push({ ...c, row, col, dr, dc })
      break
    }
  }
  if (placed.length < MIN_WORDS) return null
  const rows = grid.map((r) => r.map((ch) => ch || FILL[Math.floor(rng() * FILL.length)]!).join(''))
  // en el mismo orden en que se eligieron (mezcla de temas), no por largo
  placed.sort((a, b) => picked.findIndex((p) => p.word === a.word) - picked.findIndex((p) => p.word === b.word))
  return { size, rows, words: placed }
}

/** Sobres que se pueden ganar por día (las sopas siguen disponibles para practicar) */
export const DAILY_PACKS = 6

async function packsToday(profile = currentProfile(), now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 26 * 3600_000)
  const rows = await db
    .select({ at: wordGames.completedAt })
    .from(wordGames)
    .where(and(eq(wordGames.profile, profile), eq(wordGames.packGranted, true), gte(wordGames.completedAt, since)))
  const today = localDate(now)
  return rows.filter((r) => r.at && localDate(r.at) === today).length
}

export async function listGames(): Promise<GamesDTO> {
  const srcs = await db
    .select()
    .from(sources)
    .where(and(eq(sources.status, 'ready'), inArray(sources.owner, visibleOwners())))
  const guides = await guidesFor(srcs.map((s) => s.id))
  const stats = await getStatsRow()
  return {
    sources: srcs.map((s) => {
      const row = guides.get(s.id)
      const guide = guideStatus(row)
      return { id: s.id, title: s.title, color: s.color, guide, words: guide === 'ready' && row?.data ? candidates(row.data).length : 0 }
    }),
    packs: stats.packs,
    packsToday: await packsToday(),
    dailyLimit: DAILY_PACKS,
  }
}

export async function newWordSearch(sourceId: string, rng: Rng = Math.random): Promise<WordSearchDTO> {
  const source = await getSource(sourceId)
  const row = (await guidesFor([sourceId])).get(sourceId)
  if (guideStatus(row) !== 'ready' || !row?.data) {
    // la sopa sale de la guía: se empieza a preparar y se le avisa
    await ensureGuide(sourceId).catch(() => {})
    throw new AppError(409, 'GUIDE_NOT_READY', 'Mocca está preparando la guía de este tema (1 o 2 minutos). Intenta de nuevo en un momento.', true)
  }
  const puzzle = buildWordSearch(candidates(row.data), rng)
  if (!puzzle) throw new AppError(422, 'NOT_ENOUGH_WORDS', 'Este tema no tiene suficientes términos para armar una sopa de letras. Prueba con otro.')
  const [game] = await db.insert(wordGames).values({ profile: currentProfile(), sourceId }).returning()
  return { id: game!.id, sourceId, title: source.title, color: source.color, ...puzzle }
}

export async function completeWordSearch(id: string): Promise<GameCompleteResponse> {
  const profile = currentProfile()
  const [game] = await db
    .select()
    .from(wordGames)
    .where(and(eq(wordGames.id, id), eq(wordGames.profile, profile)))
  if (!game) throw new AppError(404, 'NOT_FOUND', 'Esa sopa ya no existe.')
  const today = await packsToday()
  let pack = false
  let xp = 0
  let streak = { current: 0, extendedToday: false }
  if (!game.completedAt) {
    pack = today < DAILY_PACKS
    await db.update(wordGames).set({ completedAt: new Date(), packGranted: pack }).where(eq(wordGames.id, id))
    // cuenta como estudiar hoy (racha y XP); los huesitos son de los exámenes: aquí se ganan sobres
    const r = await recordActivity({ xp: 25, bones: 0 })
    xp = r.xp
    streak = r.streak
    if (pack)
      await db
        .update(userStats)
        .set({ packs: sql`${userStats.packs} + 1` })
        .where(eq(userStats.id, statsIdFor()))
  }
  const stats = await getStatsRow()
  if (game.completedAt) streak = { current: stats.currentStreak, extendedToday: false }
  return { pack, packs: stats.packs, packsToday: today + (pack ? 1 : 0), dailyLimit: DAILY_PACKS, xp, streak }
}

// ── Sobres y colección ───────────────────────────────────────

/** Solo Ash puede conseguir estas */
const OWNER_ONLY: MoccaMood[] = ['inlove']
export const availableMoods = (owner = isOwner()): MoccaMood[] => MOCCA_MOODS.filter((m) => owner || !OWNER_ONLY.includes(m))

export const CARDS_PER_PACK = 3
const ODDS: [MoccaRarity, number][] = [
  ['legendary', 0.06],
  ['special', 0.26],
  ['normal', 0.68],
]

export function drawCard(pool: MoccaMood[], rng: Rng, atLeast?: MoccaRarity): MoccaMood {
  let roll = rng()
  let rarity: MoccaRarity = 'normal'
  for (const [r, p] of ODDS) {
    if (roll < p) {
      rarity = r
      break
    }
    roll -= p
  }
  if (atLeast === 'special' && rarity === 'normal') rarity = 'special'
  const options = pool.filter((m) => MOCCA_INFO[m].rarity === rarity)
  const from = options.length ? options : pool
  return from[Math.floor(rng() * from.length)]!
}

export async function getAlbum(): Promise<MoccaAlbumDTO> {
  const profile = currentProfile()
  const stats = await getStatsRow()
  const rows = await db.select().from(moccaCards).where(eq(moccaCards.profile, profile))
  return {
    packs: stats.packs,
    cards: rows.map((r) => ({ mood: r.mood as MoccaMood, count: r.count, firstAt: r.firstAt.toISOString() })),
    available: availableMoods(),
  }
}

export async function openPack(rng: Rng = Math.random): Promise<OpenPackResponse> {
  const profile = currentProfile()
  const stats = await getStatsRow()
  if (stats.packs < 1) throw new AppError(409, 'NO_PACKS', 'No tienes sobres. Gana uno terminando una sopa de letras.')
  // se descuenta primero y solo si todavía había (dos toques seguidos no abren dos veces el mismo sobre)
  const taken = await db
    .update(userStats)
    .set({ packs: sql`${userStats.packs} - 1`, packsOpened: sql`${userStats.packsOpened} + 1` })
    .where(and(eq(userStats.id, statsIdFor()), gte(userStats.packs, 1)))
    .returning()
  if (!taken.length) throw new AppError(409, 'NO_PACKS', 'No tienes sobres.')

  const pool = availableMoods()
  const owned = new Map((await db.select().from(moccaCards).where(eq(moccaCards.profile, profile))).map((r) => [r.mood, r.count]))
  const moods: MoccaMood[] = []
  for (let i = 0; i < CARDS_PER_PACK; i++) {
    // el primer sobre de la vida trae al menos una especial; y dentro de un sobre no se repite
    const guarantee = stats.packsOpened === 0 && i === 0 ? 'special' : undefined
    let m = drawCard(pool, rng, guarantee)
    for (let tries = 0; moods.includes(m) && tries < 12; tries++) m = drawCard(pool, rng, guarantee)
    moods.push(m)
  }
  const cards: OpenPackResponse['cards'] = []
  for (const mood of moods) {
    const before = owned.get(mood) ?? 0
    await db
      .insert(moccaCards)
      .values({ profile, mood })
      .onConflictDoUpdate({ target: [moccaCards.profile, moccaCards.mood], set: { count: sql`${moccaCards.count} + 1` } })
    owned.set(mood, before + 1)
    cards.push({ mood, rarity: MOCCA_INFO[mood].rarity, isNew: before === 0, count: before + 1 })
  }
  return { cards, packs: taken[0]!.packs }
}
