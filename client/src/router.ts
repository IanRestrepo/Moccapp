import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useUiStore } from '@/stores/ui'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomeView, meta: { nav: true } },
    { path: '/fuentes', component: () => import('@/views/SourcesView.vue'), meta: { nav: true } },
    { path: '/historial', component: () => import('@/views/HistoryView.vue'), meta: { nav: true } },
    { path: '/premios', component: () => import('@/views/RewardsView.vue'), meta: { nav: true } },
    { path: '/admin', component: () => import('@/views/AdminView.vue') },
    { path: '/carpeta/:id', component: () => import('@/views/CollectionView.vue') },
    { path: '/guia/:id', component: () => import('@/views/GuideView.vue') },
    // mini examen de un tema de la guía (misma pantalla que las lecciones del camino)
    { path: '/guia/:id/tema/:i', component: () => import('@/views/LessonView.vue') },
    { path: '/jugar', component: () => import('@/views/GamesView.vue') },
    { path: '/jugar/sopa/:sourceId', component: () => import('@/views/WordSearchView.vue') },
    { path: '/album', component: () => import('@/views/AlbumView.vue') },
    { path: '/calendario', component: () => import('@/views/CalendarView.vue') },
    { path: '/camino', component: () => import('@/views/PathView.vue') },
    { path: '/leccion/:key', component: () => import('@/views/LessonView.vue') },
    { path: '/estudiar', component: () => import('@/views/StudyView.vue') },
    { path: '/configurar', component: () => import('@/views/ConfigureView.vue') },
    { path: '/examen/:id', component: () => import('@/views/ExamView.vue') },
    { path: '/resultados/:id', component: () => import('@/views/ResultsView.vue') },
    { path: '/mocca', component: () => import('@/views/MoccaView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

// los premios son solo de Ash
router.beforeEach(async (to) => {
  if (to.path !== '/premios') return
  const ui = useUiStore()
  // siempre se espera a que el servidor diga quién es (máximo 4 s): el valor guardado podría ser de otra persona
  if (!ui.known) await Promise.race([ui.ownerKnown, new Promise((r) => setTimeout(r, 4000))])
  if (!ui.known || !ui.owner) return '/'
})
