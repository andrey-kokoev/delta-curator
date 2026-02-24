<template>
  <aside class="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card">
    <div class="flex h-full flex-col">
      <!-- Header -->
      <div class="flex h-16 items-center border-b px-6">
        <h1 class="text-lg font-semibold">Delta-Curator</h1>
      </div>
      
      <!-- Navigation -->
      <nav class="flex-1 space-y-1 p-4">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="[
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            $route.path === item.path
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          ]"
        >
          <component :is="item.icon" class="h-4 w-4" />
          {{ item.name }}
        </RouterLink>
      </nav>
      
      <!-- User Section -->
      <div class="border-t p-4">
        <div class="flex items-center gap-3 mb-3">
          <div class="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
            {{ authStore.user?.name?.[0] || '?' }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ authStore.user?.name }}</p>
            <p class="text-xs text-muted-foreground truncate">{{ authStore.user?.email }}</p>
          </div>
        </div>
        <button
          @click="authStore.logout"
          class="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut class="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { 
  Home, 
  FolderKanban, 
  Heart,
  Settings,
  LogOut
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const navItems = [
  { name: 'Dashboard', path: '/', icon: Home },
  { name: 'Projects', path: '/projects', icon: FolderKanban },
  { name: 'Health', path: '/health', icon: Heart },
  { name: 'Settings', path: '/settings', icon: Settings },
]
</script>
