// Moccapp en el celular: instalarla en el inicio (PWA) y activar los avisos push.
// En iPhone los avisos solo funcionan con la app agregada al inicio (iOS 16.4+).
import { computed, ref } from 'vue'
import { api } from '@/api/client'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const ua = navigator.userAgent
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
const standaloneNow = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

const installed = ref(standaloneNow())
const installEvent = ref<InstallPromptEvent | null>(null)
const permission = ref<NotificationPermission | 'unsupported'>('Notification' in window ? Notification.permission : 'unsupported')
const subscribed = ref(false)

// Android/Chrome avisa que se puede instalar: se guarda para el botón "Agregar a inicio"
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installEvent.value = e as InstallPromptEvent
})
window.addEventListener('appinstalled', () => {
  installed.value = true
  installEvent.value = null
})

const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Clave pública VAPID (base64url) → bytes */
function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export function usePhone() {
  // en iPhone, los avisos piden tenerla instalada
  const canPush = computed(() => pushSupported() && (!isIOS || installed.value))
  const canInstall = computed(() => !installed.value && (!!installEvent.value || isIOS))

  async function refresh() {
    installed.value = standaloneNow()
    permission.value = 'Notification' in window ? Notification.permission : 'unsupported'
    subscribed.value = permission.value === 'granted' && !!(await currentSubscription().catch(() => null))
  }

  /** Android/Chrome: abre el diálogo del sistema. iPhone: devuelve false (hay que mostrar los pasos). */
  async function install(): Promise<boolean> {
    const ev = installEvent.value
    if (!ev) return false
    await ev.prompt()
    const { outcome } = await ev.userChoice
    installEvent.value = null
    if (outcome === 'accepted') installed.value = true
    return outcome === 'accepted'
  }

  /** Pide permiso y registra este dispositivo. `admin` = avisos de premios reclamados (página /admin). */
  async function enablePush(admin = false): Promise<'ok' | 'denied' | 'unsupported' | 'disabled'> {
    if (!pushSupported()) return 'unsupported'
    const { enabled, publicKey } = await api.pushKey()
    if (!enabled || !publicKey) return 'disabled'
    const result = await Notification.requestPermission()
    permission.value = result
    if (result !== 'granted') return 'denied'
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
    await api.pushSubscribe(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }, admin)
    subscribed.value = true
    return 'ok'
  }

  return { installed, canInstall, canPush, permission, subscribed, isIOS, install, enablePush, refresh }
}
