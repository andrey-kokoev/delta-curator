<template>
  <div v-if="loading" class="text-center py-12">
    <p class="text-muted-foreground">Loading project...</p>
  </div>

  <div v-else-if="!project" class="text-center py-12">
    <p class="text-muted-foreground">Project not found</p>
    <RouterLink to="/projects" class="text-primary hover:underline">Back to projects</RouterLink>
  </div>

  <div v-else class="space-y-6 w-full">
    <!-- Header -->
    <div class="space-y-3 w-full">
      <div class="flex items-start justify-between w-full gap-3">
        <div class="grow min-w-0">
        <div class="flex w-full items-center gap-3">
          <input
            v-model="editableProjectName"
            type="text"
            class="w-full text-3xl font-bold tracking-tight bg-transparent border-0 border-b border-transparent px-0 focus:border-border focus:outline-none"
            @blur="saveInlineEdits"
            @keydown.enter.prevent="saveInlineEdits"
          />
        </div>
        <p class="text-muted-foreground">{{ project.config.project_id }}</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="deleteProject"
            class="rounded-lg border border-destructive px-4 py-2 text-destructive hover:bg-destructive/10"
            :disabled="deleting"
          >
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>

    <div class="flex flex-col md:flex-row gap-6 items-start w-full pb-6">
    <ProjectSubnav :project-id="projectId" />
    <div class="flex-1 min-w-0 space-y-6 w-full">

    <div class="border rounded-md bg-muted p-4 w-full">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Novelty Criteria</p>
      <input
        v-model="editableNoveltyCriteria"
        type="text"
        class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        @blur="saveInlineEdits"
        @keydown.enter.prevent="saveInlineEdits"
      />
      <p class="text-xs text-muted-foreground mt-2">
        <span v-if="inlineSaving">Saving...</span>
        <span v-else-if="inlineSaveError" class="text-destructive">{{ inlineSaveError }}</span>
      </p>
    </div>

    <!-- Sources -->
    <div class="rounded-lg border bg-card">
      <div class="border-b p-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Data Sources</h2>
        <RouterLink
          :to="`/projects/${project.config.project_id}/sources`"
          class="text-sm text-primary hover:underline"
        >
          Manage
        </RouterLink>
      </div>
      <div class="divide-y">
        <div
          v-for="source in project.config.sources"
          :key="source.id"
          class="p-4 space-y-4"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <p class="font-medium">{{ source.id }}</p>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="source.enabled === false ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'"
                >
                  {{ source.enabled === false ? 'Paused' : 'Enabled' }}
                </span>
                <button
                  class="rounded border px-2 py-0.5 text-xs font-medium hover:bg-accent"
                  :disabled="runningSourceId === source.id"
                  @click="runSourceNow(source.id)"
                >
                  {{ runningSourceId === source.id ? 'Running…' : 'Run Now' }}
                </button>
              </div>
              <p class="text-sm text-muted-foreground">{{ source.plugin }}</p>
              <p class="text-xs text-muted-foreground">
                Next run rule: RSS pubDate after {{ formatUtcMinute(sourceCursors[source.id]?.cursor_published_at) }}
              </p>
            </div>
            <code class="text-xs bg-muted px-2 py-1 rounded self-start">
              {{ JSON.stringify(source.config).slice(0, 80) }}...
            </code>
          </div>

          <!-- Same runs breakdown as Sources tab -->
          <div class="border-t pt-4">
            <p class="text-sm font-medium mb-2">Recent Runs</p>

            <div v-if="lastRunBySource[source.id]" class="rounded border bg-muted/40 p-2 text-xs space-y-1 mb-2">
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

    <!-- Storage -->
    <div class="rounded-lg border bg-card p-4">
      <h2 class="text-lg font-semibold mb-4">Storage Configuration</h2>
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <p class="text-sm text-muted-foreground">Committer</p>
          <p>{{ project.config.storage.committer.plugin }}</p>
          <p class="text-xs text-muted-foreground">Database: {{ project.config.storage.committer.config.database }}</p>
        </div>
        <div>
          <p class="text-sm text-muted-foreground">Artifacts</p>
          <p>{{ project.config.storage.artifacts.kind }}</p>
          <p class="text-xs text-muted-foreground">Bucket: {{ project.config.storage.artifacts.bucket }}</p>
        </div>
      </div>
    </div>
      </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiStore } from '@/stores/api'
import ProjectSubnav from '@/components/ProjectSubnav.vue'
import type { ProjectConfig, ProjectIndex, InspectResult, InspectSourceCursor, SourceRunSummary, RunResult } from '@/types'
import { formatRelativeTime } from '@/lib/utils'

const route = useRoute()
const router = useRouter()
const apiStore = useApiStore()

const projectId = route.params.id as string
const project = ref<{ config: ProjectConfig; index: ProjectIndex } | null>(apiStore.projectCache[projectId] || null)
const loading = ref(true)
const deleting = ref(false)
const sourceCursors = ref<Record<string, InspectSourceCursor>>({})
const editableProjectName = ref('')
const editableNoveltyCriteria = ref('')
const inlineSaving = ref(false)
const inlineSaveError = ref<string | null>(null)

// Run state
const sourceRuns = ref<Record<string, SourceRunSummary[]>>({})
const lastRunBySource = ref<Record<string, RunResult>>({})
const runningSourceId = ref<string | null>(null)
const expandedRuns = ref(new Set<string>())

function toggleRunExpand(commitId: string) {
  const newSet = new Set(expandedRuns.value)
  if (newSet.has(commitId)) {
    newSet.delete(commitId)
  } else {
    newSet.add(commitId)
  }
  expandedRuns.value = newSet
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

    for (const source of result.sources || []) {
      byId[source.source_id] = source
    }

    sourceCursors.value = byId
  } catch (err) {
    console.error('Failed to load source cursors:', err)
    sourceCursors.value = {}
  }
}

async function loadSourceRuns() {
  if (!project.value) return
  try {
    const bySource: Record<string, SourceRunSummary[]> = {}

    for (const source of project.value.config.sources) {
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

async function runSourceNow(sourceId: string) {
  if (!sourceId) return

  try {
    runningSourceId.value = sourceId
    const result = await apiStore.runBatch(sourceId, 50, projectId)
    lastRunBySource.value[sourceId] = result
    await loadSourceCursors()
    await loadSourceRuns()
  } catch (err) {
    console.error('Run failed:', err)
    alert('Run failed: ' + (err as Error).message)
  } finally {
    runningSourceId.value = null
  }
}

async function loadProject() {
  try {
    loading.value = true
    project.value = await apiStore.getConfig(projectId)
    editableProjectName.value = project.value.config.project_name
    const rules = (project.value.config.pipeline?.decider?.config as { rules?: unknown })?.rules
    editableNoveltyCriteria.value = Array.isArray(rules)
      ? rules.map((rule) => String(rule)).join(', ')
      : ''
    await loadSourceCursors()
    await loadSourceRuns()
  } catch (err) {
    console.error('Failed to load project:', err)
  } finally {
    loading.value = false
  }
}

async function saveInlineEdits() {
  if (!project.value) return

  const trimmedName = editableProjectName.value.trim()
  const trimmedCriteria = editableNoveltyCriteria.value.trim()

  if (!trimmedName || !trimmedCriteria) {
    inlineSaveError.value = 'Project name and novelty criteria cannot be empty.'
    editableProjectName.value = project.value.config.project_name
    const rules = (project.value.config.pipeline?.decider?.config as { rules?: unknown })?.rules
    editableNoveltyCriteria.value = Array.isArray(rules)
      ? rules.map((rule) => String(rule)).join(', ')
      : ''
    return
  }

  const currentRules = (project.value.config.pipeline?.decider?.config as { rules?: unknown })?.rules
  const currentCriteria = Array.isArray(currentRules)
    ? currentRules.map((rule) => String(rule)).join(', ')
    : ''

  if (
    trimmedName === project.value.config.project_name &&
    trimmedCriteria === currentCriteria
  ) {
    inlineSaveError.value = null
    return
  }

  inlineSaving.value = true
  inlineSaveError.value = null

  const previousName = project.value.config.project_name
  const previousCriteria = currentCriteria

  try {
    const rules = trimmedCriteria
      .split(',')
      .map((rule) => rule.trim())
      .filter(Boolean)

    const updatedConfig: ProjectConfig = {
      ...project.value.config,
      project_name: trimmedName,
      pipeline: {
        ...project.value.config.pipeline,
        decider: {
          ...project.value.config.pipeline.decider,
          config: {
            ...(project.value.config.pipeline.decider.config as Record<string, unknown>),
            rules
          }
        }
      }
    }

    await apiStore.saveConfig(updatedConfig, false)
    project.value.config = updatedConfig
  } catch (err) {
    editableProjectName.value = previousName
    editableNoveltyCriteria.value = previousCriteria
    inlineSaveError.value = 'Failed to save changes.'
    console.error('Failed to save inline edits:', err)
  } finally {
    inlineSaving.value = false
  }
}

async function deleteProject() {
  if (!project.value) return

  const confirmed = window.confirm(
    `Delete project "${project.value.config.project_name}"? This cannot be undone.`
  )
  if (!confirmed) return

  try {
    deleting.value = true
    await apiStore.deleteConfig(project.value.config.project_id)
    router.push('/projects')
  } catch (err) {
    console.error('Failed to delete project:', err)
    alert('Failed to delete project: ' + (err as Error).message)
  } finally {
    deleting.value = false
  }
}

onMounted(loadProject)
</script>
