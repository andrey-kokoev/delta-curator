<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="w-full max-w-md space-y-6 p-6">
      <div class="text-center space-y-2">
        <h1 class="text-3xl font-bold">Delta-Curator</h1>
        <p class="text-muted-foreground">Sign in to manage your projects</p>
      </div>
      
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <!-- Microsoft Login -->
        <button
          @click="authStore.login"
          class="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 transition-colors"
          :disabled="authStore.isLoading"
        >
          <svg class="h-5 w-5" viewBox="0 0 21 21">
            <path fill="currentColor" d="M1 1h9v9H1z"/>
            <path fill="currentColor" d="M11 1h9v9h-9z"/>
            <path fill="currentColor" d="M1 11h9v9H1z"/>
            <path fill="currentColor" d="M11 11h9v9h-9z"/>
          </svg>
          Sign in with Microsoft
        </button>

        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <span class="w-full border-t" />
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-card px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <!-- Admin Token Login -->
        <form @submit.prevent="handleAdminLogin">
          <div class="space-y-3">
            <label class="text-sm font-medium">Admin Token</label>
            <input
              v-model="adminToken"
              type="password"
              placeholder="Enter admin token"
              class="w-full rounded-lg border bg-background px-3 py-2"
            />
            <button
              type="submit"
              class="w-full rounded-lg border px-4 py-2 hover:bg-accent transition-colors"
              :disabled="authStore.isLoading || !adminToken"
            >
              {{ authStore.isLoading ? 'Logging in...' : 'Login as Admin' }}
            </button>
          </div>
        </form>
      </div>
      
      <p v-if="authStore.error" class="text-center text-sm text-destructive">
        {{ authStore.error }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()

const adminToken = ref('')

async function handleAdminLogin() {
  if (!adminToken.value) return
  
  const success = await authStore.adminLogin(adminToken.value)
  if (success) {
    adminToken.value = '' // Clear the input
    router.push('/')
  }
}
</script>
