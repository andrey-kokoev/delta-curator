<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Sources</h1>
        <p class="text-muted-foreground">Manage data sources for {{ project?.project_name }}</p>
      </div>
      <div class="flex items-center gap-2">
        <SplitButton @primary="openSourceDialog = true" @secondary="addManualSource">
          <template #primary-icon>
            <Sparkles class="h-4 w-4" />
          </template>
          <template #primary-text>New Source</template>
          <template #secondary-icon>
            <Plus class="h-4 w-4" />
          </template>
          <template #secondary-text>Create Manually</template>
        </SplitButton>
        <RouterLink
          :to="`/projects/${projectId}`"
          class="rounded-lg border px-4 py-2 hover:bg-accent"
        >
          Back to Project
        </RouterLink>
      </div>
    </div>

    <div v-if="loading" class="text-center py-12">
      <p class="text-muted-foreground">Loading...</p>
    </div>

    <div v-else class="space-y-4">
      <AICreateSourceDialog
        v-model:open="openSourceDialog"
        @created="addGuidedSource"
      />

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

      <div class="flex justify-end gap-4">
        <RouterLink
          :to="`/projects/${projectId}`"
          class="rounded-lg border px-4 py-2 hover:bg-accent"
        >
          Cancel
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Sparkles } from 'lucide-vue-next'
import { useApiStore } from '@/stores/api'
import SplitButton from '@/components/SplitButton.vue'
import AICreateSourceDialog from '@/components/AICreateSourceDialog.vue'
import type { ProjectConfig, SourceConfig } from '@/types'

const route = useRoute()
const apiStore = useApiStore()

const projectId = route.params.id as string
const project = ref<ProjectConfig | null>(null)
const sources = ref<SourceConfig[]>([])
const sourceConfigJson = ref<string[]>([])
const loading = ref(true)
const saving = ref(false)
const openSourceDialog = ref(false)
const lastSavedSnapshot = ref('[]')
const hasLoadedInitialState = ref(false)
let autosaveTimer: ReturnType<typeof setTimeout> | null = null

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function createSourcesSnapshot(list: SourceConfig[]): string {
  const normalized = list.map(source => ({
    id: source.id,
    plugin: source.plugin,
    config: source.config ?? {},
    state: source.state ?? {},
  }))
  return stableStringify(normalized)
}

function queueAutosave() {
  if (!hasLoadedInitialState.value) return
  const currentSnapshot = createSourcesSnapshot(sources.value)
  if (currentSnapshot === lastSavedSnapshot.value) return

  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
  }

  autosaveTimer = setTimeout(() => {
    void persistSources()
  }, 350)
}

async function loadProject() {
  try {
    loading.value = true
    const result = await apiStore.getConfig(projectId)
    project.value = result.config
    sources.value = [...result.config.sources]
    sourceConfigJson.value = sources.value.map(s => JSON.stringify(s.config, null, 2))
    lastSavedSnapshot.value = createSourcesSnapshot(result.config.sources)
    hasLoadedInitialState.value = true
  } catch (err) {
    console.error('Failed to load project:', err)
  } finally {
    loading.value = false
  }
}

function addManualSource() {
  sources.value.push({
    id: '',
    plugin: 'rss_source',
    config: {}
  })
  sourceConfigJson.value.push('{}')
}

function addGuidedSource(source: SourceConfig) {
  sources.value.push(source)
  sourceConfigJson.value.push(JSON.stringify(source.config ?? {}, null, 2))
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

async function persistSources() {
  if (!project.value || !hasLoadedInitialState.value) return

  const nextSnapshot = createSourcesSnapshot(sources.value)
  if (nextSnapshot === lastSavedSnapshot.value) return

  try {
    saving.value = true
    project.value.sources = sources.value
    await apiStore.saveConfig(project.value, false)
    lastSavedSnapshot.value = nextSnapshot
  } catch (err) {
    console.error('Failed to auto-save sources:', err)
  } finally {
    saving.value = false
  }
}

watch(sources, () => {
  queueAutosave()
}, { deep: true })

onMounted(loadProject)
</script>
