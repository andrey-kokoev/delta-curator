<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Health</h1>
      <p class="text-muted-foreground">System status and diagnostics</p>
    </div>

    <div class="flex items-center gap-4">
      <button
        @click="checkHealth"
        class="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        :disabled="loading"
      >
        {{ loading ? 'Checking...' : 'Check Health' }}
      </button>
    </div>

    <!-- Status Card -->
    <div v-if="health" class="rounded-lg border bg-card p-6">
      <div class="flex items-center gap-4">
        <div
          :class="[
            'h-12 w-12 rounded-full flex items-center justify-center',
            health.ok ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
          ]"
        >
          <Heart v-if="health.ok" class="h-6 w-6" />
          <AlertCircle v-else class="h-6 w-6" />
        </div>
        <div>
          <h2 class="text-xl font-semibold">
            {{ health.ok ? 'System Healthy' : 'System Error' }}
          </h2>
          <p class="text-muted-foreground">Version {{ health.version }}</p>
        </div>
      </div>

      <div v-if="health.last_commit_id" class="mt-6 p-4 bg-muted rounded-lg">
        <p class="text-sm text-muted-foreground">Last Commit ID</p>
        <p class="font-mono text-sm">{{ health.last_commit_id }}</p>
      </div>

      <div v-if="health.error" class="mt-6 p-4 bg-destructive/10 rounded-lg">
        <p class="text-sm text-destructive">{{ health.error }}</p>
      </div>
    </div>

    <!-- Raw Response -->
    <div v-if="health" class="rounded-lg border bg-card">
      <div class="border-b p-4">
        <h2 class="font-semibold">Raw Response</h2>
      </div>
      <div class="p-4">
        <pre class="text-xs bg-muted p-4 rounded-lg overflow-auto">{{ JSON.stringify(health, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Heart, AlertCircle } from 'lucide-vue-next'
import { useApiStore } from '@/stores/api'
import type { HealthStatus } from '@/types'

const apiStore = useApiStore()

const loading = ref(false)
const health = ref<HealthStatus | null>(null)

async function checkHealth() {
  try {
    loading.value = true
    health.value = await apiStore.getHealth()
  } catch (err) {
    console.error('Health check failed:', err)
    health.value = {
      ok: false,
      version: 'unknown',
      error: (err as Error).message
    }
  } finally {
    loading.value = false
  }
}

onMounted(checkHealth)
</script>
