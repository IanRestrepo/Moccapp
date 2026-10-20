import { onBeforeUnmount, ref } from 'vue'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Número que cuenta hacia arriba con desaceleración (nota y XP en Resultados). */
export function useCountUp() {
  const value = ref(0)
  let raf = 0

  function run(to: number, ms = 1200, delay = 0) {
    cancelAnimationFrame(raf)
    if (reducedMotion()) return void (value.value = to)
    const start = performance.now() + delay
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / ms))
      value.value = to * (1 - (1 - t) ** 3)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  }
  onBeforeUnmount(() => cancelAnimationFrame(raf))
  return { value, run }
}
