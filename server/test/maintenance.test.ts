import assert from 'node:assert/strict'
import { after, test } from 'node:test'
process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
const { closeDb } = await import('../src/db/client.js')
const { getMaintenanceNotice, saveMaintenanceNotice } = await import('../src/services/maintenance.js')
after(closeDb)
test('el aviso inicia activo, conserva ediciones y se puede desactivar', async () => {
  assert.deepEqual(await getMaintenanceNotice(), {
    enabled: true, title: 'Estamos en mantenimiento', message: 'Podrás estudiar, pero se pueden presentar fallas.',
  })
  await saveMaintenanceNotice({ enabled: true, title: ' Actualización ', message: ' Estamos mejorando las guías. ' })
  assert.deepEqual(await getMaintenanceNotice(), { enabled: true, title: 'Actualización', message: 'Estamos mejorando las guías.' })
  await saveMaintenanceNotice({ ...await getMaintenanceNotice(), enabled: false })
  assert.equal((await getMaintenanceNotice()).enabled, false)
  await assert.rejects(saveMaintenanceNotice({ enabled: true, title: ' ', message: 'hola' }))
  await assert.rejects(saveMaintenanceNotice({ enabled: true, title: 'hola', message: 'x'.repeat(301) }))
  assert.equal((await getMaintenanceNotice()).enabled, false)
})
