# Moccapp 🐾

App de estudio para Medicina Veterinaria y Zootecnia (UTP). Subes tus apuntes (PDF, Word, PowerPoint, fotos, texto o un video de YouTube), **Mocca** genera un banco de preguntas con Gemini y presentas exámenes ilimitados con cronómetro, nota de 0,0 a 5,0, revisión con la cita de tu fuente, XP y racha diaria.

- **Frontend**: Vue 3 + Vite + Tailwind 4, PWA (se instala en el celular)
- **Backend**: Node + Express + Drizzle + Postgres (o PGlite embebido en local)
- **IA**: Gemini (`@google/genai`), la API key solo vive en el servidor

El diseño, la base de datos, la API y los prompts están en [docs/PLAN.md](docs/PLAN.md).

---

## 1. Correrla en tu computador

### Requisitos
- **Node.js 22 o más nuevo** (`node -v` para revisar). Si no lo tienes: [nodejs.org](https://nodejs.org) o `brew install node`.
- Una **API key de Gemini**: [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

No necesitas instalar Postgres: en local se usa **PGlite**, un Postgres que corre dentro de Node y guarda todo en `server/.data/`.

### Pasos

```bash
npm install
```

```bash
cp .env.example .env
```

Abre `.env` y pega tu key en `GEMINI_API_KEY=`. Lo demás puede quedar igual.

```bash
npm run dev
```

Abre **http://localhost:5173**. Listo 🎉

> La API corre en el puerto 4000 y Vite le pasa las llamadas a `/api`. La primera vez se crean las tablas solas.

### Usarla desde el celular (misma WiFi)

1. Busca la IP de tu computador: en Mac, *Ajustes del Sistema → Wi-Fi → Detalles* (algo como `192.168.1.23`).
2. En el celular abre `http://192.168.1.23:5173`.

Funciona completa, pero para **instalarla como app** (ícono en la pantalla de inicio) hace falta HTTPS, es decir, subirla a la nube (sección 2).

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | API + app en modo desarrollo (se recargan solas) |
| `npm test` | 65 pruebas del backend (Gemini simulado, Postgres en memoria) |
| `npm run typecheck` | Revisa los tipos de `shared`, `server` y `client` |
| `npm run build` | Build de producción (app en `client/dist`, servidor en `server/dist`) |
| `npm start` | Corre el build de producción en el puerto de `.env` |
| `npm run db:generate` | Crea una migración si cambias `server/src/db/schema.ts` |

### Usar Postgres "de verdad" en local (opcional)

Con Docker: `docker compose up -d`. Con Homebrew: `brew install postgresql@17 && brew services start postgresql@17` y crea la base `vetquiz`. Luego, en `.env`:

```
DATABASE_URL=postgres://vetquiz:vetquiz@localhost:5432/vetquiz
```

---

## 2. Subirla a la nube (para usarla desde el celular en cualquier parte)

La recomendación es **[Railway](https://railway.com)**: un solo servicio entrega la app y la API, con Postgres y un disco para los archivos. El repo ya trae un `Dockerfile` que Railway detecta solo.

> **Costo**: Railway cobra un plan mensual (Hobby) y Gemini cobra por uso según los tokens. Revisa los precios vigentes en [railway.com/pricing](https://railway.com/pricing) y [ai.google.dev/pricing](https://ai.google.dev/gemini-api/docs/pricing) antes de empezar. Lo más costoso es generar el banco: con el PDF de anatomía de 56 páginas, cada una de las 2 llamadas usó unos 31 000 tokens de entrada y 25 000 de salida (incluido el razonamiento del modelo). Pasa una sola vez por fuente. Los exámenes se arman sin IA, y solo las respuestas abiertas vuelven a llamar a Gemini.

### Paso a paso

**1. Sube el código a GitHub (repositorio privado)**

```bash
git init && git add . && git commit -m "Moccapp MVP"
```

Crea un repo **privado** en GitHub y sigue las instrucciones para hacer `git push`. El `.env` **no** se sube (está en `.gitignore`).

**2. Crea el proyecto en Railway**

*New Project → Deploy from GitHub repo →* elige el repo. Railway encuentra el `Dockerfile` y empieza a construir. El primer intento puede fallar porque aún faltan las variables, y es normal.

**3. Agrega la base de datos**

En el mismo proyecto: *+ New → Database → PostgreSQL*.

**4. Agrega un volumen para los archivos subidos**

Clic derecho en el servicio de la app (o `⌘K`) → *Volume* → conéctalo al servicio y ponle de ruta de montaje **`/data`**. Sin esto, los PDFs subidos se borran en cada despliegue (el banco de preguntas sí queda, porque vive en Postgres).

**5. Variables del servicio de la app** (*Variables → Raw Editor*):

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
GEMINI_API_KEY=tu-key
GEMINI_MODEL=gemini-3.8-flash
ACCESS_CODE=una-frase-que-solo-ella-sepa
ADMIN_CODE=otra-frase-que-solo-tu-sepas
ADMIN_WHATSAPP=573001234567
APP_TIMEZONE=America/Bogota
```

- `ADMIN_CODE` protege tu página de premios (`/#/admin`). En la nube es obligatorio: sin él, la página queda apagada. `ADMIN_WHATSAPP` es tu número, con indicativo y sin "+": ahí te llega el aviso cuando ella reclama un premio.
- `ACCESS_CODE` es **obligatorio en la nube**: sin él, cualquiera que encuentre la URL podría usar tu cuota de Gemini y ver los apuntes. Usa mínimo 8 caracteres. Se escribe una sola vez por dispositivo.
- `PORT`, `NODE_ENV`, `STATIC_DIR` y `STORAGE_DIR` ya vienen en el `Dockerfile`.

**6. Genera la URL pública**

*Settings → Networking → Generate Domain*. Te da algo como `vetquiz-production.up.railway.app` con HTTPS.

**7. Instálala en el celular**

Abre la URL, escribe el código de acceso y:
- **iPhone (Safari)**: botón *Compartir* → *Agregar a inicio*.
- **Android (Chrome)**: menú ⋮ → *Instalar app*.

Queda con el ícono de Mocca y se abre en pantalla completa, como una app normal.

### Sin GitHub (opcional)

Con la [CLI de Railway](https://docs.railway.com/guides/cli): `railway login`, `railway init` y `railway up` desde esta carpeta. Los pasos 3 a 7 son los mismos.

### Otras opciones

El `Dockerfile` sirve igual en **Render** o **Fly.io**, con un Postgres (por ejemplo [Neon](https://neon.tech)) y un disco montado en `/data`. Lo único que cambia es dónde se configuran las variables y el disco.

---

## 3. Premios de Ashley

Con cada examen gana **huesitos**: +5 por terminarlo, +1 por cada respuesta correcta, +10 si saca 4,0 o más, +25 si es perfecto y +3 × su racha en el primer examen del día. Los bonos de nota y de perfecto solo cuentan en exámenes de 5 preguntas o más. Los canjea en **Premios** (del heladito al viaje internacional). Al reclamar, se le abre WhatsApp con el mensaje listo para ti.

Tú los administras en **`/#/admin`**: marcas entregado, cancelas (le devuelve los huesitos), editas premios y precios, creas nuevos y le regalas huesitos.

## 4. Seguridad

- La key de Gemini **solo** está en el servidor (`.env` o variables de Railway). El navegador nunca la ve.
- En la nube, toda la API pide el código de acceso (cookie `httpOnly` de 1 año). Hay un freno de 10 intentos fallidos cada 10 minutos.
- **Si una key se compartió por chat, correo o captura de pantalla, rótala**: en [aistudio.google.com/apikey](https://aistudio.google.com/apikey) crea una nueva, pégala en `.env` (y en Railway) y borra la anterior.
- Para cerrar la sesión en todos los dispositivos, cambia `ACCESS_CODE`.

---

## 5. Problemas comunes

| Síntoma | Qué pasa y qué hacer |
|---|---|
| "La IA está ocupada…" o reintentos en la consola con `503 high demand` | Saturación temporal de Google. El servidor reintenta solo 3 veces. Si aun así falla, dale a *Reintentar* en un minuto. |
| "Tus respuestas quedaron guardadas, pero…" al enviar | Gemini no alcanzó a corregir las abiertas. No se pierde nada: en Resultados dale a *Corregir de nuevo*. |
| "Ese video es privado…" | Solo funcionan videos **públicos** de YouTube (no privados ni "no listados"). |
| PDF de más de 150 MB | Expórtalo con menor calidad o divídelo. Los de 40 a 150 MB se leen por partes automáticamente. |
| `.doc` o `.ppt` viejos | Guárdalos como `.docx` / `.pptx` o expórtalos a PDF. |
| `Falta GEMINI_API_KEY` al arrancar | No existe `.env` o la key está vacía (paso 1). |
| `El modelo "…" no existe` | Cambia `GEMINI_MODEL` por uno vigente de [la lista de modelos](https://ai.google.dev/gemini-api/docs/models). |
| Quiero empezar de cero en local | Detén el servidor y borra `server/.data` y `server/uploads`. |

---

## 6. Estructura

```
shared/   tipos y validaciones que usan la API y la app (si cambia uno, el otro no compila)
server/   API Express: ingesta, banco de preguntas con Gemini, exámenes, corrección, XP
client/   App Vue: las 6 pantallas, Mocca, sonidos, PWA
docs/     diseño completo (PLAN.md) y una muestra real de preguntas generadas
```

Scripts útiles: `client/scripts/gen-sounds.mjs` regenera los sonidos y `client/scripts/gen-icons.mjs` los íconos (en macOS).
