<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">{{ project?.config.project_name || projectId }}</h1>
      <p class="text-muted-foreground">{{ project?.config.project_id || projectId }}</p>
    </div>

    <ProjectSubnav v-if="projectId" :project-id="projectId" />

    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Inspect</h2>
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

    <!-- Next-Run Filter Controls -->
    <div v-if="sources.length > 0" class="rounded-lg border bg-card p-6 space-y-4">
      <h2 class="text-lg font-semibold">Next Run Date Filters</h2>
      <div class="space-y-4">
        <div
          v-for="source in sources"
          :key="source.source_id"
          class="rounded-lg border p-4 space-y-3"
        >
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <p class="font-medium">{{ source.source_id }}</p>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="source.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'"
                >
                  {{ source.enabled ? 'Enabled' : 'Paused' }}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">
                Updated: {{ source.updated_at || 'n/a' }} · Recent GUIDs: {{ source.recent_guids_count }}
              </p>
            </div>
            <p class="text-xs text-muted-foreground">
              Rule: RSS pubDate after {{ formatUtcMinute(source.cursor_published_at) }}
            </p>
          </div>

          <div class="flex flex-col gap-2 md:flex-row">
            <input
              v-model="cursorInputs[source.source_id]"
              type="datetime-local"
              class="w-full rounded-lg border bg-background px-3 py-2"
              :disabled="updatingSourceId === source.source_id"
            />
            <button
              class="rounded-lg border px-4 py-2 hover:bg-accent transition-colors"
              :disabled="!cursorInputs[source.source_id] || updatingSourceId === source.source_id"
              @click="setCursor(source.source_id)"
            >
              {{ updatingSourceId === source.source_id ? 'Saving...' : 'Set' }}
            </button>
            <button
              class="rounded-lg border px-4 py-2 hover:bg-accent transition-colors"
              :disabled="updatingSourceId === source.source_id"
              @click="clearCursor(source.source_id)"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
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
import { useRoute } from 'vue-router'
import { useApiStore } from '@/stores/api'
import ProjectSubnav from '@/components/ProjectSubnav.vue'
import type { InspectResult, InspectSourceCursor, ProjectConfig } from '@/types'

const apiStore = useApiStore()
const route = useRoute()

const projectId = route.params.id as string | undefined

const since = ref('PT24H')
const loading = ref(false)
const digest = ref<string | null>(null)
const sources = ref<InspectSourceCursor[]>([])
const project = ref<{ config: ProjectConfig } | null>(null)
const cursorInputs = ref<Record<string, string>>({})
const updatingSourceId = ref<string | null>(null)

async function loadProjectContext() {
  if (!projectId) return
  try {
    project.value = await apiStore.getConfig(projectId)
  } catch (err) {
    console.error('Failed to load project context:', err)
  }
}

function isoToDatetimeLocal(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function formatUtcMinute(value: string | null | undefined): string {
  if (!value) return 'not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.toISOString().slice(0, 16)}Z`
}

async function loadDigest() {
  try {
    loading.value = true
    const result = await apiStore.inspect(since.value, 'json', projectId) as InspectResult
    digest.value = result.markdown
    sources.value = result.sources || []

    const inputs: Record<string, string> = {}
    for (const source of sources.value) {
      inputs[source.source_id] = isoToDatetimeLocal(source.cursor_published_at)
    }
    cursorInputs.value = inputs
  } catch (err) {
    console.error('Failed to load digest:', err)
    digest.value = 'Error loading digest: ' + (err as Error).message
    sources.value = []
  } finally {
    loading.value = false
  }
}

async function setCursor(sourceId: string) {
  const input = cursorInputs.value[sourceId]
  if (!input) return

  try {
    updatingSourceId.value = sourceId
    const cursorIso = new Date(input).toISOString()
    await apiStore.updateSourceCursor(sourceId, cursorIso, true, projectId)
    await loadDigest()
  } catch (err) {
    console.error('Failed to set cursor:', err)
    alert('Failed to update next-run date filter: ' + (err as Error).message)
  } finally {
    updatingSourceId.value = null
  }
}

async function clearCursor(sourceId: string) {
  try {
    updatingSourceId.value = sourceId
    await apiStore.updateSourceCursor(sourceId, null, true, projectId)
    await loadDigest()
  } catch (err) {
    console.error('Failed to clear cursor:', err)
    alert('Failed to remove next-run date filter: ' + (err as Error).message)
  } finally {
    updatingSourceId.value = null
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

onMounted(async () => {
  await loadProjectContext()
  await loadDigest()
})
</script>
