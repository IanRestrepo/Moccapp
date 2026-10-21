// Premios de Ashley: huesitos, canjes, aviso por WhatsApp y página de administrador.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { RedeemResponse, RewardDTO, RewardsDTO } from '@vetquiz/shared'

process.env.DATABASE_URL = 'pglite://memory'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.ADMIN_WHATSAPP = '+57 300 123 4567'

const { computeBones } = await import('@vetquiz/shared')
const { createApp } = await import('../src/app.js')
const { db, closeDb } = await import('../src/db/client.js')
const { exams, sources } = await import('../src/db/schema.js')

let base = ''
let server: import('node:http').Server
before(async () => {
  server = createApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})
after(async () => {
  server.close()
  await closeDb()
})

const api = async <T>(method: string, url: string, body?: unknown) => {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: (await res.json().catch(() => null)) as T }
}

describe('reglas de huesitos', () => {
  test('terminar + correctas + nota + perfecto + racha', () => {
    assert.equal(computeBones({ credits: 20, questionCount: 20, score: 5, percent: 100, firstOfDay: true, streak: 1 }), 5 + 20 + 10 + 25 + 3)
    assert.equal(computeBones({ credits: 12.5, questionCount: 15, score: 4.2, percent: 83.3, firstOfDay: false, streak: 4 }), 5 + 12 + 10)
    assert.equal(computeBones({ credits: 0, questionCount: 10, score: 0, percent: 0, firstOfDay: true, streak: 30 }), 5 + 21)
  })

  test('los bonos grandes no se pueden "farmear" con exámenes de 2 o 3 preguntas', () => {
    assert.equal(computeBones({ credits: 3, questionCount: 3, score: 5, percent: 100, firstOfDay: false, streak: 0 }), 5 + 3)
  })
})

describe('premios', () => {
  let rewards: RewardDTO[] = []
  let heladitoRedemption = ''

  test('abona los huesitos de los exámenes hechos antes de existir los premios (una sola vez)', async () => {
    const [src] = await db
      .insert(sources)
      .values({ title: 'Anatomía', kind: 'text', color: 'yellow', contentHash: 'text:x', status: 'ready' })
      .returning()
    await db.insert(exams).values({
      sourceId: src!.id,
      level: 'utp',
      questionTypes: ['multiple_choice'],
      questionCount: 10,
      timeLimitSec: 600,
      deadlineAt: new Date(),
      status: 'completed',
      percent: 100,
      score: 5,
    })
    const first = await api<RewardsDTO>('GET', '/rewards')
    assert.equal(first.status, 200)
    assert.equal(first.body.balance, 5 + 10 + 10 + 25)
    assert.equal(first.body.ownerName, 'Ashley')
    const again = await api<RewardsDTO>('GET', '/rewards')
    assert.equal(again.body.balance, 50, 'no se abona dos veces')
    rewards = first.body.rewards
  })

  test('trae la escalera inicial del heladito al viaje internacional', () => {
    assert.equal(rewards.length, 8)
    assert.equal(rewards[0]!.name, 'Heladito')
    assert.equal(rewards.at(-1)!.name, 'Viaje internacional')
    for (let i = 1; i < rewards.length; i++) assert.ok(rewards[i]!.cost > rewards[i - 1]!.cost, 'precios en escalera')
  })

  test('sin saldo suficiente → 409 con cuántos le faltan', async () => {
    const heladito = rewards.find((r) => r.sticker === 'icecream')!
    const res = await api<{ error: { code: string; message: string } }>('POST', `/rewards/${heladito.id}/redeem`)
    assert.equal(res.status, 409)
    assert.equal(res.body.error.code, 'NOT_ENOUGH_BONES')
    assert.match(res.body.error.message, /Te faltan 100 huesitos/)
  })

  test('el administrador le regala huesitos (en local sin ADMIN_CODE la página está abierta)', async () => {
    const res = await api<{ balance: number }>('POST', '/admin/bones', { amount: 150 })
    assert.equal(res.status, 200)
    assert.equal(res.body.balance, 200)
  })

  test('reclamar descuenta el saldo y arma el WhatsApp con el mensaje listo', async () => {
    const heladito = rewards.find((r) => r.sticker === 'icecream')!
    const res = await api<RedeemResponse>('POST', `/rewards/${heladito.id}/redeem`)
    assert.equal(res.status, 201)
    assert.equal(res.body.balance, 50)
    assert.equal(res.body.redemption.status, 'pending')
    assert.match(res.body.whatsappUrl!, /^https:\/\/wa\.me\/573001234567\?text=/)
    assert.match(decodeURIComponent(res.body.whatsappUrl!), /Reclamé «Heladito» en Moccapp con 150 huesitos/)
    heladitoRedemption = res.body.redemption.id
    const after = await api<RewardsDTO>('GET', '/rewards')
    assert.equal(after.body.redemptions[0]!.rewardName, 'Heladito')
    assert.equal(after.body.earnedTotal, 200, 'lo ganado nunca baja')
  })

  test('cancelar le devuelve los huesitos; no se puede resolver dos veces', async () => {
    const res = await api<{ redemption: { status: string } }>('PATCH', `/admin/redemptions/${heladitoRedemption}`, { status: 'cancelled' })
    assert.equal(res.body.redemption.status, 'cancelled')
    assert.equal((await api<RewardsDTO>('GET', '/rewards')).body.balance, 200)
    assert.equal((await api('PATCH', `/admin/redemptions/${heladitoRedemption}`, { status: 'delivered' })).status, 409)
  })

  test('editar, crear y borrar premios; uno con canjes se oculta en vez de borrarse', async () => {
    const heladito = rewards.find((r) => r.sticker === 'icecream')!
    const edited = await api<{ reward: RewardDTO }>('PATCH', `/admin/rewards/${heladito.id}`, { cost: 120, name: 'Heladito doble' })
    assert.equal(edited.body.reward.cost, 120)
    const created = await api<{ reward: RewardDTO }>('POST', '/admin/rewards', { name: 'Peluche de Mocca', sticker: 'gift', cost: 700 })
    assert.equal(created.status, 201)
    assert.equal((await api('POST', '/admin/rewards', { name: '', sticker: 'gift', cost: 10 })).status, 400)

    assert.equal((await api('DELETE', `/admin/rewards/${heladito.id}`)).status, 204)
    assert.equal((await api('DELETE', `/admin/rewards/${created.body.reward.id}`)).status, 204)
    const visible = (await api<RewardsDTO>('GET', '/rewards')).body.rewards.map((r) => r.name)
    assert.ok(!visible.includes('Heladito doble') && !visible.includes('Peluche de Mocca'))
    const admin = (await api<RewardsDTO>('GET', '/admin/rewards')).body.rewards
    assert.equal(admin.find((r) => r.id === heladito.id)?.active, false, 'tiene canjes: solo se oculta')
    assert.ok(!admin.some((r) => r.id === created.body.reward.id), 'sin canjes: se borra')
  })

  test('el saldo aparece en las stats de Inicio', async () => {
    const res = await api<{ stats: { bones: number } }>('GET', '/stats')
    assert.equal(res.body.stats.bones, 200)
  })
})
