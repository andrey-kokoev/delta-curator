<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="w-full max-w-md space-y-6 p-6">
      <div class="text-center space-y-2">
        <h1 class="text-3xl font-bold">Delta-Curator</h1>
        <p class="text-muted-foreground">Sign in to manage your projects</p>
      </div>
      
      <div class="rounded-lg border bg-card p-6">
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
      </div>
      
      <p v-if="authStore.error" class="text-center text-sm text-destructive">
        {{ authStore.error }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
</script>
