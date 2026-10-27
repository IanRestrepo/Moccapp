import type { RewardSticker } from '@vetquiz/shared'

/** Fondo de la tarjeta de cada premio según su sticker */
export const REWARD_TINT: Record<RewardSticker, string> = {
  icecream: 'bg-pink-tint',
  coffee: 'bg-orange-tint',
  cake: 'bg-pink-tint',
  ticket: 'bg-yellow-tint',
  dinner: 'bg-orange-tint',
  spa: 'bg-mint-tint',
  mountain: 'bg-mint-tint',
  plane: 'bg-sky-tint',
  gift: 'bg-lilac-tint',
}

export const REWARD_STICKER_LABEL: Record<RewardSticker, string> = {
  icecream: 'Helado',
  coffee: 'Café',
  cake: 'Postre',
  ticket: 'Boleta',
  dinner: 'Cena',
  spa: 'Spa',
  mountain: 'Paseo',
  plane: 'Viaje',
  gift: 'Regalo',
}

export const bonesText = (n: number) => n.toLocaleString('es-CO')
/** "Gratis" o "150 huesitos" */
export const costText = (n: number) => (n === 0 ? 'Gratis' : `${bonesText(n)} huesitos`)

export interface RedemptionGroup<T> {
  key: string
  first: T
  count: number
  items: T[]
}
/**
 * Agrupa los canjes iguales (mismo premio y mismo estado) para que la lista no sea eterna:
 * "Beso loco ×7 · Entregado". Por entregar primero; dentro, lo más reciente arriba.
 */
export function groupRedemptions<T extends { rewardName: string; status: string; createdAt: string }>(list: T[]): RedemptionGroup<T>[] {
  const groups = new Map<string, RedemptionGroup<T>>()
  for (const r of [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const key = `${r.status}|${r.rewardName}`
    const g = groups.get(key)
    if (g) {
      g.count++
      g.items.push(r)
    } else groups.set(key, { key, first: r, count: 1, items: [r] })
  }
  const order = (s: string) => (s === 'pending' ? 0 : s === 'delivered' ? 1 : 2)
  return [...groups.values()].sort((a, b) => order(a.first.status) - order(b.first.status) || b.first.createdAt.localeCompare(a.first.createdAt))
}
