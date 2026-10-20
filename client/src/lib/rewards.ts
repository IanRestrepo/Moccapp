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
