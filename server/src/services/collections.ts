// Carpetas: cada persona agrupa fuentes (las suyas y, si es invitada, las de Ash) como quiera.
// Una fuente vive en una sola carpeta por persona: meterla en otra la saca de la anterior.
import { and, desc, eq, inArray } from 'drizzle-orm'
import { SOURCE_COLORS, type CollectionDTO, type CollectionInput, type SourceColor } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { collectionSources, collections, sources } from '../db/schema.js'
import { Errors } from '../lib/errors.js'
import { currentProfile, visibleOwners } from '../lib/profile.js'

async function mine(id: string) {
  const [c] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, id), eq(collections.profile, currentProfile())))
  if (!c) throw Errors.notFound('Esa carpeta')
  return c
}

/** Solo fuentes que esta persona puede ver */
async function visibleIds(ids: string[]) {
  if (!ids.length) return []
  const rows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(inArray(sources.id, ids), inArray(sources.owner, visibleOwners())))
  const ok = new Set(rows.map((r) => r.id))
  return ids.filter((id) => ok.has(id))
}

export async function listCollections(): Promise<CollectionDTO[]> {
  const rows = await db.select().from(collections).where(eq(collections.profile, currentProfile())).orderBy(desc(collections.createdAt))
  if (!rows.length) return []
  const links = await db
    .select()
    .from(collectionSources)
    .where(
      inArray(
        collectionSources.collectionId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(desc(collectionSources.addedAt))
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    sourceIds: links.filter((l) => l.collectionId === c.id).map((l) => l.sourceId),
    createdAt: c.createdAt.toISOString(),
  }))
}

const getDTO = async (id: string) => (await listCollections()).find((c) => c.id === id)!

/** Mete fuentes en la carpeta (sacándolas de las otras carpetas de esta persona) */
async function addSources(collectionId: string, ids: string[]) {
  const ok = await visibleIds([...new Set(ids)])
  if (!ok.length) return
  const myCollections = (await db.select({ id: collections.id }).from(collections).where(eq(collections.profile, currentProfile()))).map(
    (c) => c.id,
  )
  await db.transaction(async (tx) => {
    await tx
      .delete(collectionSources)
      .where(and(inArray(collectionSources.collectionId, myCollections), inArray(collectionSources.sourceId, ok)))
    await tx.insert(collectionSources).values(ok.map((sourceId) => ({ collectionId, sourceId })))
  })
}

export async function createCollection(input: CollectionInput): Promise<CollectionDTO> {
  const count = (await db.select({ id: collections.id }).from(collections).where(eq(collections.profile, currentProfile()))).length
  const color: SourceColor = input.color ?? SOURCE_COLORS[(count + 2) % SOURCE_COLORS.length]!
  const [c] = await db.insert(collections).values({ profile: currentProfile(), name: input.name, color }).returning()
  if (input.sourceIds?.length) await addSources(c!.id, input.sourceIds)
  return getDTO(c!.id)
}

export async function updateCollection(id: string, patch: { name?: string; color?: SourceColor }): Promise<CollectionDTO> {
  await mine(id)
  if (patch.name || patch.color) await db.update(collections).set(patch).where(eq(collections.id, id))
  return getDTO(id)
}

/** Borra la carpeta; las fuentes quedan sueltas (no se borra nada de lo estudiado) */
export async function deleteCollection(id: string) {
  await mine(id)
  await db.delete(collections).where(eq(collections.id, id))
}

export async function addToCollection(id: string, sourceIds: string[]): Promise<CollectionDTO> {
  await mine(id)
  await addSources(id, sourceIds)
  return getDTO(id)
}

export async function removeFromCollection(id: string, sourceId: string): Promise<CollectionDTO> {
  await mine(id)
  await db.delete(collectionSources).where(and(eq(collectionSources.collectionId, id), eq(collectionSources.sourceId, sourceId)))
  return getDTO(id)
}
