<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Run Batch</h1>
      <p class="text-muted-foreground">Process new items from sources</p>
    </div>

    <!-- Active Project Info -->
    <div v-if="activeProject" class="rounded-lg border bg-card p-6">
      <h2 class="text-lg font-semibold">Active Project</h2>
      <p class="text-muted-foreground">{{ activeProject.config.project_name }}</p>
      <p class="text-sm text-muted-foreground mt-1">
        {{ activeProject.config.sources.length }} sources available
      </p>
    </div>

    <div v-else class="rounded-lg border border-destructive bg-destructive/10 p-6">
      <p class="text-destructive">No active project configured</p>
      <RouterLink to="/projects" class="text-primary hover:underline">Select a project</RouterLink>
    </div>

    <!-- Run Form -->
    <div class="rounded-lg border bg-card p-6 space-y-4">
      <h2 class="text-lg font-semibold">Batch Configuration</h2>

      <div class="space-y-2">
        <label class="text-sm font-medium">Source</label>
        <select
          v-model="sourceId"
          class="w-full rounded-lg border bg-background px-3 py-2"
          :disabled="!activeProject"
        >
          <option value="">Select a source...</option>
          <option
            v-for="source in activeProject?.config.sources"
            :key="source.id"
            :value="source.id"
          >
            {{ source.id }} ({{ source.plugin }})
          </option>
        </select>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">Max Items</label>
        <input
          v-model.number="maxItems"
          type="number"
          min="1"
          max="5000"
          class="w-full rounded-lg border bg-background px-3 py-2"
        />
      </div>

      <button
        @click="runBatch"
        class="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        :disabled="!sourceId || running"
      >
        {{ running ? 'Running...' : 'Run Batch' }}
      </button>
    </div>

    <!-- Results -->
    <div v-if="result" class="rounded-lg border bg-card p-6 space-y-4">
      <h2 class="text-lg font-semibold">Results</h2>
      
      <div class="grid gap-4 md:grid-cols-3">
        <div class="p-4 bg-muted rounded-lg text-center">
          <p class="text-2xl font-bold">{{ result.items_processed }}</p>
          <p class="text-sm text-muted-foreground">Items Processed</p>
        </div>
        <div class="p-4 bg-muted rounded-lg text-center">
          <p class="text-2xl font-bold">{{ result.events_written }}</p>
          <p class="text-sm text-muted-foreground">Events Written</p>
        </div>
        <div class="p-4 bg-muted rounded-lg text-center">
          <p class="text-2xl font-bold truncate">{{ result.commit_id || 'None' }}</p>
          <p class="text-sm text-muted-foreground">Commit ID</p>
        </div>
      </div>

      <div v-if="result.trace_id" class="text-sm text-muted-foreground">
        Trace ID: {{ result.trace_id }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApiStore } from '@/stores/api'
import type { ProjectConfig } from '@/types'

const apiStore = useApiStore()

const activeProject = ref<{ config: ProjectConfig } | null>(null)
const sourceId = ref('')
const maxItems = ref(50)
const running = ref(false)
const result = ref<{ commit_id: string | null; items_processed: number; events_written: number; trace_id?: string } | null>(null)

async function loadActiveProject() {
  try {
    activeProject.value = await apiStore.getActiveConfig()
  } catch (err) {
    console.error('No active project:', err)
  }
}

async function runBatch() {
  if (!sourceId.value) return
  
  try {
    running.value = true
    result.value = await apiStore.runBatch(sourceId.value, maxItems.value)
  } catch (err) {
    console.error('Run failed:', err)
    alert('Run failed: ' + (err as Error).message)
  } finally {
    running.value = false
  }
}

onMounted(loadActiveProject)
</script>
