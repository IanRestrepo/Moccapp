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
router.beforeEach((to) => {
  if (to.path === '/premios' && !useUiStore().owner) return '/'
})
