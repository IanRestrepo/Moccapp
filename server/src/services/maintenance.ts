import { eq } from 'drizzle-orm'
import { MaintenanceNoticeSchema, type MaintenanceNotice } from '@vetquiz/shared'
import { db } from '../db/client.js'
import { maintenanceNotice } from '../db/schema.js'

export async function getMaintenanceNotice(): Promise<MaintenanceNotice> {
  const [row] = await db.select().from(maintenanceNotice).where(eq(maintenanceNotice.id, 1))
  return MaintenanceNoticeSchema.parse(row)
}

export async function saveMaintenanceNotice(input: unknown): Promise<MaintenanceNotice> {
  const value = MaintenanceNoticeSchema.parse(input)
  await db.insert(maintenanceNotice).values({ id: 1, ...value })
    .onConflictDoUpdate({ target: maintenanceNotice.id, set: value })
  return value
}
