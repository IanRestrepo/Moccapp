// Entrada para Vercel: la misma app de Express, sin listen() (Vercel la llama por cada petición).
// La conexión a la base y las migraciones se hacen al cargar el módulo (arranque en frío).
import { createApp } from './app.js'

export default createApp()
