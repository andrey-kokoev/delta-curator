<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">{{ activeProject?.config.project_name || projectId }}</h1>
      <p class="text-muted-foreground">{{ activeProject?.config.project_id || projectId }}</p>
    </div>

    <div class="flex flex-col md:flex-row gap-6 items-start w-full pb-6">
    <ProjectSubnav v-if="projectId" :project-id="projectId" />
    <div class="flex-1 min-w-0 space-y-6 w-full">

    <div v-if="!activeProject" class="rounded-lg border border-destructive bg-destructive/10 p-6">
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
        <label class="text-sm font-medium">Next Run Date Filter (UTC)</label>
        <p class="text-xs text-muted-foreground">
          For RSS sources, next run only considers items where <span class="font-mono">pubDate</span> is after this value.
        </p>
        <div class="flex items-center gap-2">
          <input
            v-model="cursorPublishedAt"
            type="datetime-local"
            class="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2"
            :disabled="!sourceId || updatingCursor"
          />
          <button
            @click="setCursor"
            class="whitespace-nowrap rounded-lg border px-4 py-2 hover:bg-accent transition-colors"
            :disabled="!sourceId || !cursorPublishedAt || updatingCursor"
          >
            {{ updatingCursor ? 'Saving...' : 'Use This Date' }}
          </button>
          <button
            @click="clearCursor"
            class="whitespace-nowrap rounded-lg border px-4 py-2 hover:bg-accent transition-colors"
            :disabled="!sourceId || updatingCursor"
          >
            Remove Date Filter
          </button>
          <button
            @click="resetProcessedUrls"
            class="whitespace-nowrap rounded-lg border px-4 py-2 hover:bg-accent transition-colors"
            :disabled="!sourceId || resettingProcessedUrls"
          >
            {{ resettingProcessedUrls ? 'Resetting...' : 'Reset Processed URLs' }}
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

      <div v-if="(result.processed_items || []).length" class="space-y-2">
        <p class="text-sm font-medium">Processed Items</p>
        <p v-if="result.rerank_query" class="text-xs text-muted-foreground">
          Reranker query: {{ result.rerank_query }}
        </p>
        <div class="flex flex-wrap gap-2 text-xs">
          <span
            v-for="entry in sortedOutcomeSummary"
            :key="entry.outcome"
            class="rounded px-2 py-1 font-medium"
            :class="{
              'bg-emerald-100 text-emerald-800': entry.outcome === 'event_created',
              'bg-amber-100 text-amber-800': entry.outcome === 'skipped_low_rank' || entry.outcome === 'skipped_decision',
              'bg-slate-100 text-slate-700': entry.outcome === 'skipped_existing' || entry.outcome === 'skipped_already_processed_url' || entry.outcome === 'pending'
            }"
          >
            {{ entry.outcome }}: {{ entry.count }}
          </span>
        </div>
        <ul class="max-h-64 overflow-auto space-y-1 rounded-md border bg-muted/30 p-2 text-sm">
          <li
            v-for="item in result.processed_items"
            :key="item.source_item_id"
            class="rounded bg-background px-2 py-1"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate font-medium">{{ item.title || item.source_item_id }}</p>
                <p class="truncate text-xs text-muted-foreground">{{ item.source_item_id }}</p>
                <a v-if="item.url" :href="item.url" target="_blank" rel="noopener" class="truncate text-xs text-blue-600 hover:underline">{{ item.url }}</a>
                <p v-if="item.decision_reason" class="truncate text-xs text-muted-foreground">{{ item.decision_reason }}</p>
                <p v-else-if="item.rank_score !== null && item.rank_score !== undefined" class="truncate text-xs text-muted-foreground">
                  rank {{ Number(item.rank_score).toFixed(3) }}
                </p>
                <p v-if="item.rerank_input" class="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground" v-html="formatRerankInput(item.rerank_input)"></p>
              </div>
              <span class="shrink-0 rounded px-2 py-0.5 text-xs font-medium" :class="{
                'bg-emerald-100 text-emerald-800': item.outcome === 'event_created',
                'bg-amber-100 text-amber-800': item.outcome === 'skipped_low_rank' || item.outcome === 'skipped_decision',
                'bg-slate-100 text-slate-700': item.outcome === 'skipped_existing' || item.outcome === 'skipped_already_processed_url' || !item.outcome || item.outcome === 'pending'
              }">
                {{ item.outcome || 'pending' }}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </div>
      </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useApiStore } from '@/stores/api'
import ProjectSubnav from '@/components/ProjectSubnav.vue'
import type { ProjectConfig, InspectResult, RunResult } from '@/types'

function formatRerankInput(input: string): string {
  return input
    .split('\n')
    .map(line => {
      if (line.startsWith('link:')) {
        const url = line.slice(5).trim()
        if (url.startsWith('http')) {
          return `<a href="${url}" target="_blank" rel="noopener" class="text-blue-600 hover:underline">${url}</a>`
        }
      }
      return line.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-blue-600 hover:underline">$1</a>')
    })
    .join('\n')
}

const apiStore = useApiStore()
const route = useRoute()

const projectId = route.params.id as string | undefined

const activeProject = ref<{ config: ProjectConfig } | null>(projectId ? apiStore.projectCache[projectId] : null)
const sourceId = ref('')
const maxItems = ref(50)
const running = ref(false)
const updatingCursor = ref(false)
const resettingProcessedUrls = ref(false)
const cursorPublishedAt = ref('')
const sourceCursorById = ref<Record<string, string>>({})
const result = ref<RunResult | null>(null)

const outcomeSummary = computed(() => {
  const summary = {
    event_created: 0,
    skipped_low_rank: 0,
    skipped_decision: 0,
    skipped_existing: 0,
    skipped_already_processed_url: 0,
    pending: 0
  }

  for (const item of result.value?.processed_items || []) {
    const outcome = item.outcome || 'pending'
    if (outcome in summary) {
      summary[outcome as keyof typeof summary] += 1
    } else {
      summary.pending += 1
    }
  }

  return summary
})

const sortedOutcomeSummary = computed(() => {
  const labelOrder = ['event_created', 'skipped_low_rank', 'skipped_decision', 'skipped_existing', 'skipped_already_processed_url', 'pending'] as const
  return labelOrder
    .map((outcome) => ({ outcome, count: outcomeSummary.value[outcome] }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return labelOrder.indexOf(a.outcome) - labelOrder.indexOf(b.outcome)
    })
})

function formatUtcMinute(value: string | null | undefined): string {
  if (!value) return 'not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.toISOString().slice(0, 16)}Z`
}

function isoToDatetimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function getEffectiveProjectId(): string | null {
  if (projectId) return projectId
  return activeProject.value?.config.project_id || null
}

function syncCursorInputForSource() {
  if (!sourceId.value) {
    cursorPublishedAt.value = ''
    return
  }

  const saved = sourceCursorById.value[sourceId.value]
  cursorPublishedAt.value = typeof saved === 'string' ? saved : ''
}

async function loadSourceCursors() {
  const effectiveProjectId = getEffectiveProjectId()
  if (!effectiveProjectId) return

  try {
    const result = await apiStore.inspect('PT24H', 'json', effectiveProjectId) as InspectResult
    const byId: Record<string, string> = {}

    for (const source of result.sources || []) {
      byId[source.source_id] = isoToDatetimeLocal(source.cursor_published_at)
    }

    sourceCursorById.value = byId
    syncCursorInputForSource()
  } catch (err) {
    console.error('Failed to load source cursors:', err)
  }
}

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

    await loadSourceCursors()
  } catch (err) {
    console.error('No active project:', err)
  }
}

async function runBatch() {
  if (!sourceId.value) return
  const effectiveProjectId = getEffectiveProjectId()
  if (!effectiveProjectId) return

  try {
    running.value = true
    result.value = await apiStore.runBatch(sourceId.value, maxItems.value, effectiveProjectId)
  } catch (err) {
    console.error('Run failed:', err)
    alert('Run failed: ' + (err as Error).message)
  } finally {
    running.value = false
  }
}

async function setCursor() {
  if (!sourceId.value || !cursorPublishedAt.value) return
  const effectiveProjectId = getEffectiveProjectId()
  if (!effectiveProjectId) return

  try {
    updatingCursor.value = true
    const cursorIso = new Date(cursorPublishedAt.value).toISOString()
    const response = await apiStore.updateSourceCursor(sourceId.value, cursorIso, true, effectiveProjectId)
    sourceCursorById.value[sourceId.value] = isoToDatetimeLocal(response.cursor_published_at)
    syncCursorInputForSource()
    alert(`Next run filter updated for ${response.source_id}: RSS pubDate after ${formatUtcMinute(response.cursor_published_at)}`)
  } catch (err) {
    console.error('Set cursor failed:', err)
    alert('Updating next-run date filter failed: ' + (err as Error).message)
  } finally {
    updatingCursor.value = false
  }
}

async function clearCursor() {
  if (!sourceId.value) return
  const effectiveProjectId = getEffectiveProjectId()
  if (!effectiveProjectId) return

  try {
    updatingCursor.value = true
    const response = await apiStore.updateSourceCursor(sourceId.value, null, true, effectiveProjectId)
    sourceCursorById.value[sourceId.value] = ''
    syncCursorInputForSource()
    alert(`Next run date filter removed for ${response.source_id}`)
  } catch (err) {
    console.error('Clear cursor failed:', err)
    alert('Removing next-run date filter failed: ' + (err as Error).message)
  } finally {
    updatingCursor.value = false
  }
}

async function resetProcessedUrls() {
  if (!sourceId.value) return
  const effectiveProjectId = getEffectiveProjectId()
  if (!effectiveProjectId) return

  const confirmed = window.confirm(`Reset processed URL memory for ${sourceId.value}? This allows previously-seen URLs to be processed again.`)
  if (!confirmed) return

  try {
    resettingProcessedUrls.value = true
    const response = await apiStore.resetProcessedUrls(sourceId.value, effectiveProjectId)
    alert(`Processed URL memory reset for ${response.source_id}: ${response.deleted_count} entries removed.`)
  } catch (err) {
    console.error('Reset processed URLs failed:', err)
    alert('Reset processed URLs failed: ' + (err as Error).message)
  } finally {
    resettingProcessedUrls.value = false
  }
}

watch(sourceId, () => {
  syncCursorInputForSource()
})

onMounted(loadActiveProject)
</script>
