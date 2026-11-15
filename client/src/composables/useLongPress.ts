// "Mantener presionado" en el celular: a los 450 ms llama a la acción (con una vibración corta).
// Si el dedo se mueve (está bajando la pantalla), no cuenta.
let firedAt = 0

export function useLongPress<T>(action: (item: T) => void, ms = 450) {
  let timer = 0
  let x = 0
  let y = 0
  const cancel = () => clearTimeout(timer)
  return {
    /** v-bind="bind(item)" en el elemento */
    bind: (item: T) => ({
      onPointerdown(e: PointerEvent) {
        x = e.clientX
        y = e.clientY
        cancel()
        timer = window.setTimeout(() => {
          firedAt = Date.now()
          if (navigator.vibrate) navigator.vibrate(15)
          action(item)
        }, ms)
      },
      onPointermove(e: PointerEvent) {
        if (Math.abs(e.clientX - x) > 10 || Math.abs(e.clientY - y) > 10) cancel()
      },
      onPointerup: cancel,
      onPointercancel: cancel,
      onPointerleave: cancel,
      // el menú del navegador al mantener presionado una imagen/enlace
      onContextmenu: (e: Event) => e.preventDefault(),
    }),
    /** true justo después de un "mantener presionado": el clic que sigue no debe abrir la fuente */
    fired: () => Date.now() - firedAt < 700,
  }
}
