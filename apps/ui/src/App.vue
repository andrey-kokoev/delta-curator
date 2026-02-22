<template>
  <div id="app" class="min-h-screen bg-background">
    <Navigation v-if="authStore.isAuthenticated" />
    <main :class="{ 'ml-64': authStore.isAuthenticated }">
      <div class="p-6">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Navigation from '@/components/Navigation.vue'

const authStore = useAuthStore()

onMounted(() => {
  authStore.checkAuth()
})
</script>
