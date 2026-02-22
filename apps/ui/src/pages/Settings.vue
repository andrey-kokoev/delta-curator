<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Settings</h1>
      <p class="text-muted-foreground">User preferences and system configuration</p>
    </div>

    <!-- User Info -->
    <div class="rounded-lg border bg-card p-6">
      <h2 class="text-lg font-semibold mb-4">User Information</h2>
      <div v-if="authStore.user" class="space-y-3">
        <div class="flex items-center gap-4">
          <div class="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-medium">
            {{ authStore.user.name[0] }}
          </div>
          <div>
            <p class="font-medium">{{ authStore.user.name }}</p>
            <p class="text-sm text-muted-foreground">{{ authStore.user.email }}</p>
          </div>
        </div>
        <div class="pt-3 border-t">
          <p class="text-sm text-muted-foreground">Roles</p>
          <div class="flex gap-2 mt-1">
            <span
              v-for="role in authStore.user.roles"
              :key="role"
              class="rounded-full bg-secondary px-3 py-1 text-xs"
            >
              {{ role }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="rounded-lg border bg-card p-6">
      <h2 class="text-lg font-semibold mb-4">Actions</h2>
      <div class="space-y-3">
        <button
          @click="authStore.logout"
          class="w-full flex items-center justify-center gap-2 rounded-lg border border-destructive text-destructive px-4 py-2 hover:bg-destructive/10"
        >
          <LogOut class="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>

    <!-- About -->
    <div class="rounded-lg border bg-card p-6">
      <h2 class="text-lg font-semibold mb-4">About</h2>
      <div class="space-y-2 text-sm text-muted-foreground">
        <p>Delta-Curator</p>
        <p>Event-sourced novelty accumulation system</p>
        <p>Version 0.1.0</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LogOut } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
</script>
