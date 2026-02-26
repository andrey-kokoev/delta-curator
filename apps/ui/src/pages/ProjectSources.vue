<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">{{ project?.project_name || projectId }}</h1>
      <p class="text-muted-foreground">{{ project?.project_id || projectId }}</p>
    </div>

    <div class="flex flex-col md:flex-row gap-6 items-start w-full pb-6">
    <ProjectSubnav :project-id="projectId" />
    <div class="flex-1 min-w-0 space-y-6 w-full">

    <div class="flex items-center justify-end">
      <div class="flex items-center gap-2">
        <button
          @click="openSourceDialog = true"
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Sparkles class="h-4 w-4" />
          New Source
        </button>
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
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                v-model="source.enabled"
                type="checkbox"
              />
              <span>{{ source.enabled === false ? 'Paused' : 'Enabled' }}</span>
            </label>
            <button
              @click="removeSource(index)"
              class="text-sm text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
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
          <p class="text-xs text-muted-foreground">
            Next run rule: RSS pubDate after {{ formatUtcMinute(sourceCursors[source.id]?.cursor_published_at) }}
          </p>
          <div class="flex flex-col gap-2 md:flex-row">
            <input
              v-model="cursorInputs[source.id]"
              type="datetime-local"
              class="w-full rounded-lg border bg-background px-3 py-2"
              :disabled="!source.id || updatingSourceId === source.id"
            />
            <button
              class="rounded-lg border px-4 py-2 hover:bg-accent transition-colors"
              :disabled="!source.id || !cursorInputs[source.id] || updatingSourceId === source.id"
              @click="setCursor(source.id)"
            >
              {{ updatingSourceId === source.id ? 'Saving...' : 'Use This Date' }}
            </button>
            <button
              class="rounded-lg border px-4 py-2 hover:bg-accent transition-colors"
              :disabled="!source.id || updatingSourceId === source.id"
              @click="clearCursor(source.id)"
            >
              Remove Date Filter
            </button>
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

        <div class="mt-4 space-y-2 border-t pt-4">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium">Runs</p>
            <button
              class="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
              :disabled="!source.id || runningSourceId === source.id"
              @click="runSourceNow(source.id)"
            >
              {{ runningSourceId === source.id ? 'Running…' : 'Run Now' }}
            </button>
          </div>

          <div v-if="lastRunBySource[source.id]" class="rounded border bg-muted/40 p-2 text-xs space-y-1">
            <p class="font-medium">Last Run Details</p>
            <p v-if="lastRunBySource[source.id]?.rerank_query" class="text-muted-foreground truncate">
              reranker query: {{ lastRunBySource[source.id]?.rerank_query }}
            </p>
            <ul v-if="(lastRunBySource[source.id]?.processed_items || []).length" class="max-h-40 overflow-auto space-y-1">
              <li
                v-for="item in (lastRunBySource[source.id]?.processed_items || [])"
                :key="item.source_item_id"
                class="rounded bg-background px-2 py-1"
              >
                <p class="truncate">{{ item.title || item.source_item_id }}</p>
                <p class="truncate text-muted-foreground">{{ item.url || item.source_item_id }}</p>
                <p class="truncate text-muted-foreground">
                  {{ item.outcome || 'pending' }}
                  <span v-if="item.outcome === 'skipped_low_rank' && item.rank_score != null">
                    (rank: {{ Number(item.rank_score).toFixed(3) }})
                  </span>
                </p>
              </li>
            </ul>
          </div>

          <div v-if="(sourceRuns[source.id] || []).length === 0" class="text-xs text-muted-foreground">
            No runs yet.
          </div>
          <ul v-else class="space-y-1 text-xs text-muted-foreground">
            <li
              v-for="run in sourceRuns[source.id]"
              :key="run.commit_id"
              class="rounded bg-muted/60 px-2 py-1 cursor-pointer hover:bg-muted/80 transition-colors"
              @click="toggleRunExpand(run.commit_id)"
            >
              <div class="flex items-center justify-between">
                <span>{{ formatRunTime(run.run_at) }} · items {{ formatRunMetric(run.item_count, 'items') }} · events {{ formatRunMetric(run.event_count, 'events') }}</span>
                <span class="text-muted-foreground ml-2 shrink-0">{{ expandedRuns.has(run.commit_id) ? '▼' : '▶' }}</span>
              </div>
              <div v-if="expandedRuns.has(run.commit_id)" class="mt-2 text-xs space-y-1 cursor-default text-foreground" @click.stop>
                <p v-if="run.rerank_query" class="text-muted-foreground truncate">
                  reranker query: {{ run.rerank_query }}
                </p>
                <ul v-if="(run.processed_items || []).length" class="max-h-40 overflow-auto space-y-1">
                  <li
                    v-for="item in (run.processed_items || [])"
                    :key="item.source_item_id"
                    class="rounded bg-background px-2 py-1 border border-border/50"
                  >
                    <p class="truncate">{{ item.title || item.source_item_id }}</p>
                    <p class="truncate text-muted-foreground">{{ item.url || item.source_item_id }}</p>
                    <p class="truncate text-muted-foreground">
                      {{ item.outcome || 'pending' }}
                      <span v-if="item.outcome === 'skipped_low_rank' && item.rank_score != null">
                        (rank: {{ Number(item.rank_score).toFixed(3) }})
                      </span>
                    </p>
                  </li>
                </ul>
                <div v-else class="text-muted-foreground italic mt-1">
                  No detailed item records found for this run.
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>

    </div>
      </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Sparkles } from 'lucide-vue-next'
import { useApiStore } from '@/stores/api'
import ProjectSubnav from '@/components/ProjectSubnav.vue'
import AICreateSourceDialog from '@/components/AICreateSourceDialog.vue'
import { formatRelativeTime } from '@/lib/utils'
import type { ProjectConfig, SourceConfig, InspectResult, InspectSourceCursor, SourceRunSummary, RunResult } from '@/types'

const route = useRoute()
const apiStore = useApiStore()

const projectId = route.params.id as string
const project = ref<ProjectConfig | null>(apiStore.projectCache[projectId]?.config || null)
const sources = ref<SourceConfig[]>([])
const sourceConfigJson = ref<string[]>([])
const loading = ref(true)
const saving = ref(false)
const openSourceDialog = ref(false)
const lastSavedSnapshot = ref('[]')
const hasLoadedInitialState = ref(false)
const sourceCursors = ref<Record<string, InspectSourceCursor>>({})
const sourceRuns = ref<Record<string, SourceRunSummary[]>>({})
const lastRunBySource = ref<Record<string, RunResult>>({})
const cursorInputs = ref<Record<string, string>>({})
const updatingSourceId = ref<string | null>(null)
const runningSourceId = ref<string | null>(null)
const expandedRuns = ref(new Set<string>())
let autosaveTimer: ReturnType<typeof setTimeout> | null = null

function toggleRunExpand(commitId: string) {
  const newSet = new Set(expandedRuns.value)
  if (newSet.has(commitId)) {
    newSet.delete(commitId)
  } else {
    newSet.add(commitId)
  }
  expandedRuns.value = newSet
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

async function loadSourceCursors() {
  try {
    const result = await apiStore.inspect('PT24H', 'json', projectId) as InspectResult
    const byId: Record<string, InspectSourceCursor> = {}
    const inputs: Record<string, string> = {}

    for (const source of result.sources || []) {
      byId[source.source_id] = source
      inputs[source.source_id] = isoToDatetimeLocal(source.cursor_published_at)
    }

    sourceCursors.value = byId
    cursorInputs.value = inputs
  } catch (err) {
    console.error('Failed to load source cursors:', err)
    sourceCursors.value = {}
    cursorInputs.value = {}
  }
}

async function loadSourceRuns() {
  try {
    const bySource: Record<string, SourceRunSummary[]> = {}

    for (const source of sources.value) {
      if (!source.id) continue

      const result = await apiStore.listRuns({
        projectId,
        sourceId: source.id,
        limit: 5
      })

      bySource[source.id] = result.runs || []
    }

    sourceRuns.value = bySource
  } catch (err) {
    console.error('Failed to load source runs:', err)
    sourceRuns.value = {}
  }
}

function formatRunTime(value: string | null): string {
  if (!value) return 'unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${formatRelativeTime(date)} (${date.toISOString().slice(0, 16)}Z)`
}

function formatRunMetric(value: number | null, kind: 'items' | 'events'): string {
  if (value === null || value === undefined) return 'n/a'
  if (value === 0) {
    return kind === 'items' ? '0 (no items fetched)' : '0 (no accepted events)'
  }
  return String(value)
}

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
    enabled: source.enabled !== false,
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
    sources.value = result.config.sources.map(source => ({
      ...source,
      enabled: source.enabled !== false,
    }))
    sourceConfigJson.value = sources.value.map(s => JSON.stringify(s.config, null, 2))
    lastSavedSnapshot.value = createSourcesSnapshot(result.config.sources)
    hasLoadedInitialState.value = true
    await loadSourceCursors()
    await loadSourceRuns()
  } catch (err) {
    console.error('Failed to load project:', err)
  } finally {
    loading.value = false
  }
}

async function runSourceNow(sourceId: string) {
  if (!sourceId) return

  try {
    runningSourceId.value = sourceId
    const result = await apiStore.runBatch(sourceId, 50, projectId)
    lastRunBySource.value[sourceId] = result
    await loadSourceCursors()
    await loadSourceRuns()
    alert(`Run completed for ${sourceId}: ${result.items_processed} items, ${result.events_written} events`)
  } catch (err) {
    console.error('Run failed:', err)
    alert('Run failed: ' + (err as Error).message)
  } finally {
    runningSourceId.value = null
  }
}

async function setCursor(sourceId: string) {
  const input = cursorInputs.value[sourceId]
  if (!sourceId || !input) return

  try {
    updatingSourceId.value = sourceId
    const cursorIso = new Date(input).toISOString()
    await apiStore.updateSourceCursor(sourceId, cursorIso, true, projectId)
    await loadSourceCursors()
  } catch (err) {
    console.error('Failed to set cursor:', err)
    alert('Failed to update next-run date filter: ' + (err as Error).message)
  } finally {
    updatingSourceId.value = null
  }
}

async function clearCursor(sourceId: string) {
  if (!sourceId) return

  try {
    updatingSourceId.value = sourceId
    await apiStore.updateSourceCursor(sourceId, null, true, projectId)
    await loadSourceCursors()
  } catch (err) {
    console.error('Failed to clear cursor:', err)
    alert('Failed to remove next-run date filter: ' + (err as Error).message)
  } finally {
    updatingSourceId.value = null
  }
}

function addGuidedSource(source: SourceConfig) {
  sources.value.push({
    ...source,
    enabled: source.enabled !== false,
  })
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
