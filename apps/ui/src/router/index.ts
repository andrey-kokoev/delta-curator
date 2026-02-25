import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/pages/Home.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/Login.vue'),
      meta: { requiresAuth: false }
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('@/pages/Projects.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/projects/:id',
      name: 'project-detail',
      component: () => import('@/pages/ProjectDetail.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/projects/:id/edit',
      name: 'project-edit',
      component: () => import('@/pages/ProjectEdit.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/projects/:id/sources',
      name: 'project-sources',
      component: () => import('@/pages/ProjectSources.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/projects/:id/pipeline',
      name: 'project-pipeline',
      redirect: to => `/projects/${to.params.id}`,
      meta: { requiresAuth: true }
    },
    {
      path: '/projects/:id/run',
      name: 'project-run',
      component: () => import('@/pages/RunControl.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/projects/:id/inspect',
      name: 'project-inspect',
      component: () => import('@/pages/Inspect.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/projects/:id/content',
      name: 'project-content',
      component: () => import('@/pages/Content.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/projects/:id/search',
      name: 'project-search',
      component: () => import('@/pages/Search.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/content',
      redirect: '/projects',
      name: 'content',
      meta: { requiresAuth: true }
    },
    {
      path: '/search',
      redirect: '/projects',
      name: 'search',
      meta: { requiresAuth: true }
    },
    {
      path: '/run',
      redirect: '/projects',
      name: 'run',
      meta: { requiresAuth: true }
    },
    {
      path: '/inspect',
      redirect: '/projects',
      name: 'inspect',
      meta: { requiresAuth: true }
    },
    {
      path: '/health',
      name: 'health',
      component: () => import('@/pages/Health.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/pages/Settings.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  
  if (!authStore.isAuthenticated && !authStore.isLoading) {
    await authStore.checkAuth()
  }
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    next('/')
  } else {
    next()
  }
})

export default router
