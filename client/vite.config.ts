import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: '/',
        name: 'Moccapp · Estudia con Mocca',
        short_name: 'Moccapp',
        description: 'Exámenes, tarjetas y un camino de lecciones con Mocca.',
        scope: '/',
        orientation: 'portrait',
        lang: 'es-CO',
        theme_color: '#121019',
        background_color: '#121019',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // la API nunca se cachea: los exámenes y el banco siempre vienen frescos del servidor
        navigateFallbackDenylist: [/^\/api/],
        // avisos push (public/push-sw.js)
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wav}'],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
    // VITE_API_PORT permite un entorno de pruebas aparte (4001) sin tocar el servidor de producción (4000)
    proxy: { '/api': `http://localhost:${process.env.VITE_API_PORT ?? 4000}` },
  },
})
