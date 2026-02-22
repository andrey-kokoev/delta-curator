<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Sources</h1>
        <p class="text-muted-foreground">Manage data sources for {{ project?.project_name }}</p>
      </div>
      <RouterLink
        :to="`/projects/${projectId}`"
        class="rounded-lg border px-4 py-2 hover:bg-accent"
      >
        Back to Project
      </RouterLink>
    </div>

    <div v-if="loading" class="text-center py-12">
      <p class="text-muted-foreground">Loading...</p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="(source, index) in sources"
        :key="index"
        class="rounded-lg border bg-card p-6"
      >
        <div class="flex items-start justify-between mb-4">
          <h3 class="text-lg font-semibold">{{ source.id }}</h3>
          <button
            @click="removeSource(index)"
            class="text-sm text-destructive hover:underline"
          >
            Remove
          </button>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-sm">Source ID</label>
            <input
              v-model="source.id"
              type="text"
              class="w-full rounded-lg border bg-background px-3 py-2"
            />
          </div>

          <div class="space-y-2">
            <label class="text-sm">Plugin</label>
            <select
              v-model="source.plugin"
              class="w-full rounded-lg border bg-background px-3 py-2"
            >
              <option value="rss_source">RSS Source</option>
              <option value="file_drop_source">File Drop Source</option>
              <option value="api_source">API Source</option>
            </select>
          </div>
        </div>

        <div class="mt-4 space-y-2">
          <label class="text-sm">Configuration (JSON)</label>
          <textarea
            v-model="sourceConfigJson[index]"
            rows="5"
            class="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
            @change="updateSourceConfig(index)"
          ></textarea>
        </div>
      </div>

      <button
        @click="addSource"
        class="w-full rounded-lg border border-dashed p-4 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        + Add Source
      </button>

      <div class="flex justify-end gap-4">
        <RouterLink
          :to="`/projects/${projectId}`"
          class="rounded-lg border px-4 py-2 hover:bg-accent"
        >
          Cancel
        </RouterLink>
        <button
          @click="saveSources"
          class="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          :disabled="saving"
        >
          {{ saving ? 'Saving...' : 'Save Sources' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiStore } from '@/stores/api'
import type { ProjectConfig, SourceConfig } from '@/types'

const route = useRoute()
const router = useRouter()
const apiStore = useApiStore()

const projectId = route.params.id as string
const project = ref<ProjectConfig | null>(null)
const sources = ref<SourceConfig[]>([])
const sourceConfigJson = ref<string[]>([])
const loading = ref(true)
const saving = ref(false)

async function loadProject() {
  try {
    loading.value = true
    const result = await apiStore.getConfig(projectId)
    project.value = result.config
    sources.value = [...result.config.sources]
    sourceConfigJson.value = sources.value.map(s => JSON.stringify(s.config, null, 2))
  } catch (err) {
    console.error('Failed to load project:', err)
  } finally {
    loading.value = false
  }
}

function addSource() {
  sources.value.push({
    id: '',
    plugin: 'rss_source',
    config: {}
  })
  sourceConfigJson.value.push('{}')
}

function removeSource(index: number) {
  sources.value.splice(index, 1)
  sourceConfigJson.value.splice(index, 1)
}

function updateSourceConfig(index: number) {
  try {
    sources.value[index].config = JSON.parse(sourceConfigJson.value[index])
  } catch (e) {
    console.error('Invalid JSON:', e)
  }
}

async function saveSources() {
  try {
    saving.value = true
    // Update source configs from JSON
    sources.value.forEach((source, index) => {
      try {
        source.config = JSON.parse(sourceConfigJson.value[index])
      } catch (e) {
        console.warn('Invalid JSON for source', index)
      }
    })

    if (project.value) {
      project.value.sources = sources.value
      await apiStore.saveConfig(project.value, false)
      router.push(`/projects/${projectId}`)
    }
  } catch (err) {
    console.error('Failed to save sources:', err)
    alert('Failed to save: ' + (err as Error).message)
  } finally {
    saving.value = false
  }
}

onMounted(loadProject)
</script>
