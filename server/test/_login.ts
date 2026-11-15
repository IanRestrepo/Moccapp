// Entrar como lo hace la app: con el código la primera vez (y crear usuario), después con usuario y contraseña.
export const TEST_PASSWORD = 'clave-de-prueba'

export async function signIn(base: string, code: string, ip = '10.9.9.9'): Promise<{ res: Response; cookie: string }> {
  const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }
  const first = await fetch(`${base}/access/code`, { method: 'POST', headers, body: JSON.stringify({ code }) })
  if (first.status === 409) {
    // ya tiene usuario: el usuario de prueba es el nombre del perfil (va antes del punto en la cookie de código)
    const username = code.split('-')[1]!
    const res = await fetch(`${base}/access/login`, { method: 'POST', headers, body: JSON.stringify({ username, password: TEST_PASSWORD }) })
    return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' }
  }
  if (first.status !== 200) return { res: first, cookie: '' }
  const codeCookie = first.headers.get('set-cookie')!.split(';')[0]!
  const profile = ((await first.json()) as { profile: string }).profile
  const res = await fetch(`${base}/access/setup`, {
    method: 'POST',
    headers: { ...headers, cookie: codeCookie },
    body: JSON.stringify({ username: profile, password: TEST_PASSWORD }),
  })
  return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' }
}
