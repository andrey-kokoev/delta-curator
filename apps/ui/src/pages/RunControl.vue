<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Run Batch</h1>
      <p class="text-muted-foreground">Process new items from sources</p>
    </div>

    <ProjectSubnav v-if="projectId" :project-id="projectId" />

    <!-- Project Info -->
    <div v-if="activeProject" class="rounded-lg border bg-card p-6">
      <h2 class="text-lg font-semibold">Project</h2>
      <p class="text-muted-foreground">{{ activeProject.config.project_name }}</p>
      <p class="text-sm text-muted-foreground mt-1">
        {{ activeProject.config.sources.length }} sources available
      </p>
    </div>

    <div v-else class="rounded-lg border border-destructive bg-destructive/10 p-6">
      <p class="text-destructive">No project configured</p>
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

      <div class="border-t pt-4 space-y-2">
        <label class="text-sm font-medium">Cursor Published At (UTC)</label>
        <input
          v-model="cursorPublishedAt"
          type="datetime-local"
          class="w-full rounded-lg border bg-background px-3 py-2"
          :disabled="!sourceId || updatingCursor"
        />
        <div class="flex gap-2">
          <button
            @click="setCursor"
            class="flex-1 rounded-lg border px-4 py-2 hover:bg-accent transition-colors"
            :disabled="!sourceId || !cursorPublishedAt || updatingCursor"
          >
            {{ updatingCursor ? 'Saving...' : 'Set Cursor' }}
          </button>
          <button
            @click="clearCursor"
            class="flex-1 rounded-lg border px-4 py-2 hover:bg-accent transition-colors"
            :disabled="!sourceId || updatingCursor"
          >
            Clear Cursor
          </button>
        </div>
      </div>
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
import { useRoute } from 'vue-router'
import { useApiStore } from '@/stores/api'
import ProjectSubnav from '@/components/ProjectSubnav.vue'
import type { ProjectConfig } from '@/types'

const apiStore = useApiStore()
const route = useRoute()

const projectId = route.params.id as string | undefined

const activeProject = ref<{ config: ProjectConfig } | null>(null)
const sourceId = ref('')
const maxItems = ref(50)
const running = ref(false)
const updatingCursor = ref(false)
const cursorPublishedAt = ref('')
const result = ref<{ commit_id: string | null; items_processed: number; events_written: number; trace_id?: string } | null>(null)

async function loadActiveProject() {
  try {
    if (projectId) {
      activeProject.value = await apiStore.getConfig(projectId)
    } else {
      activeProject.value = await apiStore.getActiveConfig()
    }

    if (activeProject.value?.config.sources.length) {
      sourceId.value = activeProject.value.config.sources[0].id
    }
  } catch (err) {
    console.error('No active project:', err)
  }
}

async function runBatch() {
  if (!sourceId.value) return
  
  try {
    running.value = true
    result.value = await apiStore.runBatch(sourceId.value, maxItems.value, projectId)
  } catch (err) {
    console.error('Run failed:', err)
    alert('Run failed: ' + (err as Error).message)
  } finally {
    running.value = false
  }
}

async function setCursor() {
  if (!sourceId.value || !cursorPublishedAt.value) return

  try {
    updatingCursor.value = true
    const cursorIso = new Date(cursorPublishedAt.value).toISOString()
    const response = await apiStore.updateSourceCursor(sourceId.value, cursorIso, true, projectId)
    alert(`Cursor updated for ${response.source_id} to ${response.cursor_published_at}`)
  } catch (err) {
    console.error('Set cursor failed:', err)
    alert('Set cursor failed: ' + (err as Error).message)
  } finally {
    updatingCursor.value = false
  }
}

async function clearCursor() {
  if (!sourceId.value) return

  try {
    updatingCursor.value = true
    const response = await apiStore.updateSourceCursor(sourceId.value, null, true, projectId)
    cursorPublishedAt.value = ''
    alert(`Cursor cleared for ${response.source_id}`)
  } catch (err) {
    console.error('Clear cursor failed:', err)
    alert('Clear cursor failed: ' + (err as Error).message)
  } finally {
    updatingCursor.value = false
  }
}

onMounted(loadActiveProject)
</script>
