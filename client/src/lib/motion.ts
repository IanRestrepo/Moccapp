// Resortes y presets de movimiento compartidos por todos los componentes.
import type { SourceColor } from '@vetquiz/shared'

export const spring = {
  /** Botones y píldoras: rápido y con poco rebote */
  press: { type: 'spring', stiffness: 600, damping: 30 },
  /** Tarjetas que entran o cambian de pregunta */
  card: { type: 'spring', stiffness: 380, damping: 30 },
  /** Barra de progreso: se pasa un poco y vuelve */
  fill: { type: 'spring', stiffness: 140, damping: 16, mass: 0.9 },
  /** Mascota: elástica y juguetona */
  jelly: { type: 'spring', stiffness: 260, damping: 10 },
} as const

export const pressable = {
  whilePress: { scale: 0.96, y: 2 },
  transition: spring.press,
}

/**
 * Clases literales por color (Tailwind no detecta clases armadas con plantillas).
 * solid = bloque saturado con texto negro · tint = fondo suave de estado.
 */
export const colorClasses: Record<SourceColor, { solid: string; tint: string; bg: string }> = {
  orange: { solid: 'bg-orange text-on-color', tint: 'bg-orange-tint', bg: 'bg-orange' },
  yellow: { solid: 'bg-yellow text-on-color', tint: 'bg-yellow-tint', bg: 'bg-yellow' },
  lilac: { solid: 'bg-lilac text-on-color', tint: 'bg-lilac-tint', bg: 'bg-lilac' },
  pink: { solid: 'bg-pink text-on-color', tint: 'bg-pink-tint', bg: 'bg-pink' },
  mint: { solid: 'bg-mint text-on-color', tint: 'bg-mint-tint', bg: 'bg-mint' },
  sky: { solid: 'bg-sky text-on-color', tint: 'bg-sky-tint', bg: 'bg-sky' },
}
