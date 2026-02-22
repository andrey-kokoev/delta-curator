<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Inspect</h1>
      <p class="text-muted-foreground">View system digest and logs</p>
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-4">
      <div class="space-y-1">
        <label class="text-sm">Since</label>
        <select v-model="since" class="rounded-lg border bg-background px-3 py-2">
          <option value="PT1H">Last hour</option>
          <option value="PT6H">Last 6 hours</option>
          <option value="PT24H">Last 24 hours</option>
          <option value="P7D">Last 7 days</option>
        </select>
      </div>

      <button
        @click="loadDigest"
        class="mt-5 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        :disabled="loading"
      >
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>

    <!-- Digest Content -->
    <div v-if="digest" class="rounded-lg border bg-card">
      <div class="border-b p-4 flex items-center justify-between">
        <h2 class="font-semibold">Digest</h2>
        <button
          @click="downloadDigest"
          class="text-sm text-primary hover:underline"
        >
          Download
        </button>
      </div>
      <div class="p-6">
        <pre class="whitespace-pre-wrap font-mono text-sm">{{ digest }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApiStore } from '@/stores/api'

const apiStore = useApiStore()

const since = ref('PT24H')
const loading = ref(false)
const digest = ref<string | null>(null)

async function loadDigest() {
  try {
    loading.value = true
    digest.value = await apiStore.inspect(since.value, 'markdown') as string
  } catch (err) {
    console.error('Failed to load digest:', err)
    digest.value = 'Error loading digest: ' + (err as Error).message
  } finally {
    loading.value = false
  }
}

function downloadDigest() {
  if (!digest.value) return
  
  const blob = new Blob([digest.value], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `delta-curator-digest-${new Date().toISOString().split('T')[0]}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

onMounted(loadDigest)
</script>
