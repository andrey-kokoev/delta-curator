<template>
  <!-- Zone 0: Loading / Not Found -->
  <div v-if="loading" class="text-center py-12">
    <p class="text-muted-foreground">Loading project...</p>
  </div>

  <div v-else-if="!project" class="text-center py-12">
    <p class="text-muted-foreground">{{ loadError || 'Project not found' }}</p>
    <RouterLink to="/projects" class="text-primary hover:underline">Back to projects</RouterLink>
  </div>

  <div v-else class="space-y-6 w-full">
    <!-- Zone 1: Header -->
    <div class="space-y-3 w-full">
      <div class="flex items-start justify-between w-full gap-3">
        <!-- Left: Identity -->
        <div class="grow min-w-0">
          <!-- Project Name Display/Edit -->
          <div class="flex w-full items-center gap-3">
            <template v-if="!isEditingName">
              <h1 class="text-3xl font-bold tracking-tight">{{ project.config.project_name }}</h1>
              <button
                @click="startEditingName"
                class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Edit project name"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </template>
            <template v-else>
              <input
                ref="nameInputRef"
                v-model="editableProjectName"
                type="text"
                class="text-3xl font-bold tracking-tight bg-transparent border-b border-border focus:outline-none focus:border-primary px-0 w-full"
                @keydown.enter.prevent="saveNameEdit"
                @keydown.esc="cancelNameEdit"
              />
              <button
                @click="saveNameEdit"
                :disabled="inlineSaving"
                class="rounded-md px-3 py-1 bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                Save
              </button>
              <button
                @click="cancelNameEdit"
                :disabled="inlineSaving"
                class="rounded-md px-3 py-1 border text-sm hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
            </template>
          </div>
          <p class="text-muted-foreground text-sm mt-1">{{ project.config.project_id }}</p>
          
          <!-- Inline error -->
          <p v-if="inlineSaveError" class="text-destructive text-sm mt-2">{{ inlineSaveError }}</p>
        </div>

        <!-- Right: Overflow Menu -->
        <div class="relative">
          <button
            @click="showOverflowMenu = !showOverflowMenu"
            class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Project actions"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
          
          <!-- Dropdown -->
          <div
            v-if="showOverflowMenu"
            class="absolute right-0 mt-2 w-48 rounded-md border bg-card shadow-lg z-10"
            v-click-outside="() => showOverflowMenu = false"
          >
            <div class="py-1">
              <RouterLink
                :to="`/projects/${projectId}/sources`"
                class="block px-4 py-2 text-sm hover:bg-accent"
                @click="showOverflowMenu = false"
              >
                Manage Sources
              </RouterLink>
              <button
                @click="openSettings(); showOverflowMenu = false"
                class="block w-full text-left px-4 py-2 text-sm hover:bg-accent"
              >
                Project Settings
              </button>
              <button
                @click="scrollToRecentActivity(); showOverflowMenu = false"
                class="block w-full text-left px-4 py-2 text-sm hover:bg-accent"
              >
                View Runs
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Zone 2: Status Strip Tiles -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div class="rounded-lg border bg-card p-4">
        <p class="text-xs text-muted-foreground uppercase tracking-wide">Last Run</p>
        <p class="text-lg font-semibold mt-1">
          {{ lastRunTime ? formatRelativeTime(lastRunTime) : 'Never' }}
        </p>
        <p v-if="lastRunTime" class="text-xs text-muted-foreground">
          {{ formatUtcMinute(lastRunTime) }}
        </p>
      </div>
      
      <div class="rounded-lg border bg-card p-4">
        <p class="text-xs text-muted-foreground uppercase tracking-wide">Events</p>
        <p class="text-lg font-semibold mt-1">{{ recentEventsCount }}</p>
        <p class="text-xs text-muted-foreground">last 24h proxy</p>
      </div>
      
      <div class="rounded-lg border bg-card p-4">
        <p class="text-xs text-muted-foreground uppercase tracking-wide">Items</p>
        <p class="text-lg font-semibold mt-1">{{ recentItemsCount }}</p>
        <p class="text-xs text-muted-foreground">last 24h proxy</p>
      </div>
      
      <div class="rounded-lg border bg-card p-4">
        <p class="text-xs text-muted-foreground uppercase tracking-wide">Sources</p>
        <p class="text-lg font-semibold mt-1">{{ project.config.sources.length }}</p>
      </div>
      
      <div v-if="hasCursorData" class="rounded-lg border bg-card p-4">
        <p class="text-xs text-muted-foreground uppercase tracking-wide">Stale</p>
        <p class="text-lg font-semibold mt-1" :class="staleCount > 0 ? 'text-yellow-600' : ''">
          {{ staleCount }}
        </p>
        <p class="text-xs text-muted-foreground">sources</p>
      </div>
    </div>

    <!-- Zone 3: Novelty Criteria Card -->
    <div class="rounded-lg border bg-card p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">Novelty Criteria</h2>
        <button
          v-if="!isEditingCriteria"
          @click="startEditingCriteria"
          class="text-sm text-primary hover:underline"
        >
          Edit
        </button>
      </div>
      
      <!-- Display Mode -->
      <div v-if="!isEditingCriteria" class="flex flex-wrap gap-2">
        <span
          v-for="(rule, index) in noveltyRules"
          :key="index"
          class="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
        >
          {{ rule }}
        </span>
        <span v-if="noveltyRules.length === 0" class="text-muted-foreground text-sm">
          No criteria defined
        </span>
      </div>
      
      <!-- Edit Mode -->
      <div v-else class="space-y-3">
        <textarea
          ref="criteriaInputRef"
          v-model="editableNoveltyCriteria"
          rows="3"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Enter criteria, comma-separated"
          @keydown.esc="cancelCriteriaEdit"
        ></textarea>
        <div class="flex items-center gap-2">
          <button
            @click="saveCriteriaEdit"
            :disabled="inlineSaving"
            class="rounded-md px-3 py-1.5 bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            Save
          </button>
          <button
            @click="cancelCriteriaEdit"
            :disabled="inlineSaving"
            class="rounded-md px-3 py-1.5 border text-sm hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <span class="text-xs text-muted-foreground ml-2">Ctrl+Enter to save</span>
        </div>
        <p v-if="criteriaError" class="text-destructive text-sm">{{ criteriaError }}</p>
      </div>
    </div>

    <!-- Zone 4: Recent Activity Card -->
    <div ref="recentActivityRef" class="rounded-lg border bg-card">
      <div class="border-b p-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Recent Activity</h2>
        <RouterLink
          :to="`/projects/${projectId}/sources`"
          class="text-sm text-primary hover:underline"
        >
          View more
        </RouterLink>
      </div>
      
      <!-- Loading state -->
      <div v-if="runsLoading" class="p-4 text-center text-muted-foreground">
        Recent Activity: loading...
      </div>
      
      <!-- Partial warning -->
      <div v-else-if="runsPartialError" class="p-4 border-b bg-yellow-50 dark:bg-yellow-900/20">
        <p class="text-sm text-yellow-800 dark:text-yellow-200">
          ⚠️ Some runs unavailable
        </p>
      </div>
      
      <!-- Activity list -->
      <div v-if="!runsLoading && recentRunsMerged.length > 0" class="divide-y">
        <button
          v-for="run in recentRunsMerged.slice(0, 5)"
          :key="run.commit_id"
          @click="openRunDetail(run)"
          class="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3">
              <span class="font-medium">{{ formatRelativeTime(run.run_at || '') }}</span>
              <span class="text-muted-foreground text-sm">{{ formatUtcMinute(run.run_at) }}</span>
            </div>
            <p class="text-sm text-muted-foreground mt-1">
              Source: {{ run.source_id }} · 
              Items: {{ run.item_count ?? 'n/a' }} · 
              Events: {{ run.event_count ?? 'n/a' }}
            </p>
          </div>
          <div class="flex items-center gap-3 ml-4">
            <span
              v-if="run.status"
              class="px-2 py-0.5 rounded text-xs font-medium"
              :class="getRunStatusBadgeClass(run.status)"
            >
              {{ getRunStatusLabel(run.status) }}
            </span>
            <svg class="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>
      
      <div v-else-if="!runsLoading" class="p-4 text-center text-muted-foreground">
        No recent activity
      </div>
    </div>

    <!-- Zone 5: Sources Summary Card -->
    <div class="rounded-lg border bg-card">
      <div class="border-b p-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Sources</h2>
        <RouterLink
          :to="`/projects/${projectId}/sources`"
          class="text-sm text-primary hover:underline"
        >
          Manage
        </RouterLink>
      </div>
      
      <div class="divide-y">
        <div
          v-for="source in project.config.sources"
          :key="source.id"
          class="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
        >
          <RouterLink
            :to="`/projects/${projectId}/sources`"
            class="flex-1 min-w-0"
          >
            <div class="flex items-center gap-3">
              <span class="font-medium">{{ source.id }}</span>
              <span class="text-xs text-muted-foreground">{{ source.plugin }}</span>
            </div>
            <p class="text-sm text-muted-foreground mt-1">
              Next run rule: RSS pubDate after {{ formatUtcMinute(sourceCursors[source.id]?.cursor_published_at) }}
            </p>
          </RouterLink>
          
          <div class="flex items-center gap-3 ml-4">
            <!-- Health Badge -->
            <span
              class="px-2 py-0.5 rounded text-xs font-medium"
              :class="getHealthBadgeClass(getSourceHealth(sourceCursors[source.id], lastRunBySource[source.id]))"
            >
              {{ getHealthLabel(getSourceHealth(sourceCursors[source.id], lastRunBySource[source.id])) }}
            </span>
            
            <!-- Inspect last run button -->
            <button
              v-if="lastRunBySource[source.id]"
              @click="openRunDetail(lastRunBySource[source.id])"
              class="text-xs text-primary hover:underline"
            >
              Inspect last run
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Zone 6: Footer Links -->
    <div class="flex flex-wrap gap-4 pt-4 border-t">
      <button
        @click="openSettings"
        class="text-sm text-primary hover:underline"
      >
        Open Project Settings
      </button>
      <RouterLink
        :to="`/projects/${projectId}/sources`"
        class="text-sm text-primary hover:underline"
      >
        Manage Sources
      </RouterLink>
    </div>

    <!-- Drawers -->
    <RunDetailDrawer
      :is-open="isRunDetailOpen"
      :run="selectedRun"
      @close="closeRunDetail"
    />
    
    <ProjectSettingsDrawer
      :is-open="isSettingsOpen"
      :project="project"
      @close="closeSettings"
      @delete="deleteProject"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiStore } from '@/stores/api'
import RunDetailDrawer from '@/components/RunDetailDrawer.vue'
import ProjectSettingsDrawer from '@/components/ProjectSettingsDrawer.vue'
import type { ProjectConfig, ProjectIndex, InspectResult, InspectSourceCursor, SourceRunSummary } from '@/types'
import {
  formatRelativeTime,
  formatUtcMinute,
  mergeRunsAcrossSources,
  getSourceHealth,
  getHealthBadgeClass,
  getHealthLabel,
  getRunStatusBadgeClass,
  getRunStatusLabel,
  isSourceStale
} from '@/lib/projectUtils'

const route = useRoute()
const router = useRouter()
const apiStore = useApiStore()

const projectId = route.params.id as string
const project = ref<{ config: ProjectConfig; index: ProjectIndex } | null>(apiStore.projectCache[projectId] || null)
const loading = ref(true)
const loadError = ref<string | null>(null)

// Source cursors from inspect
const sourceCursors = ref<Record<string, InspectSourceCursor>>({})

// Runs data
const sourceRuns = ref<Record<string, SourceRunSummary[]>>({})
const lastRunBySource = ref<Record<string, SourceRunSummary>>({})
const runsLoading = ref(false)
const runsPartialError = ref(false)

// UI state
const showOverflowMenu = ref(false)
const isRunDetailOpen = ref(false)
const isSettingsOpen = ref(false)
const selectedRun = ref<SourceRunSummary | null>(null)
const recentActivityRef = ref<HTMLElement | null>(null)

// Name editing
const isEditingName = ref(false)
const editableProjectName = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)

// Criteria editing
const isEditingCriteria = ref(false)
const editableNoveltyCriteria = ref('')
const criteriaInputRef = ref<HTMLTextAreaElement | null>(null)
const criteriaError = ref<string | null>(null)

// Inline save state
const inlineSaving = ref(false)
const inlineSaveError = ref<string | null>(null)

// Computed
const noveltyRules = computed(() => {
  const rules = (project.value?.config.pipeline?.decider?.config as { rules?: unknown })?.rules
  return Array.isArray(rules) ? rules.map(String) : []
})

const recentRunsMerged = computed(() => {
  return mergeRunsAcrossSources(sourceRuns.value)
})

const lastRunTime = computed(() => {
  const runs = recentRunsMerged.value
  if (runs.length === 0) return null
  return runs[0].run_at
})

const recentEventsCount = computed(() => {
  return recentRunsMerged.value
    .slice(0, 5)
    .reduce((sum, run) => sum + (run.event_count || 0), 0)
})

const recentItemsCount = computed(() => {
  return recentRunsMerged.value
    .slice(0, 5)
    .reduce((sum, run) => sum + (run.item_count || 0), 0)
})

const hasCursorData = computed(() => {
  return Object.keys(sourceCursors.value).length > 0
})

const staleCount = computed(() => {
  let count = 0
  for (const cursor of Object.values(sourceCursors.value)) {
    if (isSourceStale(cursor.cursor_published_at)) {
      count++
    }
  }
  return count
})

// Methods
function startEditingName() {
  editableProjectName.value = project.value?.config.project_name || ''
  isEditingName.value = true
  nextTick(() => nameInputRef.value?.focus())
}

function cancelNameEdit() {
  isEditingName.value = false
  inlineSaveError.value = null
}

async function saveNameEdit() {
  if (!project.value) return
  
  const trimmedName = editableProjectName.value.trim()
  if (!trimmedName) {
    inlineSaveError.value = 'Project name cannot be empty'
    return
  }
  
  if (trimmedName === project.value.config.project_name) {
    isEditingName.value = false
    return
  }
  
  await saveInlineEdits(trimmedName, noveltyRules.value)
  isEditingName.value = false
}

function startEditingCriteria() {
  editableNoveltyCriteria.value = noveltyRules.value.join(', ')
  isEditingCriteria.value = true
  nextTick(() => criteriaInputRef.value?.focus())
}

function cancelCriteriaEdit() {
  isEditingCriteria.value = false
  criteriaError.value = null
}

async function saveCriteriaEdit() {
  if (!project.value) return
  
  const trimmedCriteria = editableNoveltyCriteria.value.trim()
  if (!trimmedCriteria) {
    criteriaError.value = 'Criteria cannot be empty'
    return
  }
  
  const rules = trimmedCriteria
    .split(',')
    .map(r => r.trim())
    .filter(Boolean)
  
  if (rules.length === 0) {
    criteriaError.value = 'Criteria cannot be empty'
    return
  }
  
  const currentRulesStr = noveltyRules.value.join(', ')
  if (trimmedCriteria === currentRulesStr) {
    isEditingCriteria.value = false
    return
  }
  
  await saveInlineEdits(project.value.config.project_name, rules)
  isEditingCriteria.value = false
}

async function saveInlineEdits(newName: string, newRules: string[]) {
  if (!project.value) return
  
  inlineSaving.value = true
  inlineSaveError.value = null
  
  try {
    const updatedConfig: ProjectConfig = {
      ...project.value.config,
      project_name: newName,
      pipeline: {
        ...project.value.config.pipeline,
        decider: {
          ...project.value.config.pipeline.decider,
          config: {
            ...(project.value.config.pipeline.decider.config as Record<string, unknown>),
            rules: newRules
          }
        }
      }
    }
    
    await apiStore.saveConfig(updatedConfig, false)
    project.value.config = updatedConfig
  } catch (err) {
    inlineSaveError.value = 'Failed to save changes'
    console.error('Failed to save inline edits:', err)
    // Revert not needed as we're not modifying until success
  } finally {
    inlineSaving.value = false
  }
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
  
  runsLoading.value = true
  runsPartialError.value = false
  
  try {
    const bySource: Record<string, SourceRunSummary[]> = {}
    const lastRun: Record<string, SourceRunSummary> = {}
    
    const promises = project.value.config.sources.map(async (source) => {
      if (!source.id) return
      
      try {
        const result = await apiStore.listRuns({
          projectId,
          sourceId: source.id,
          limit: 5
        })
        
        bySource[source.id] = result.runs || []
        if (result.runs && result.runs.length > 0) {
          lastRun[source.id] = result.runs[0]
        }
      } catch (err) {
        console.error(`Failed to load runs for source ${source.id}:`, err)
        runsPartialError.value = true
        bySource[source.id] = []
      }
    })
    
    await Promise.all(promises)
    
    sourceRuns.value = bySource
    lastRunBySource.value = lastRun
  } catch (err) {
    console.error('Failed to load source runs:', err)
    runsPartialError.value = true
  } finally {
    runsLoading.value = false
  }
}

async function loadProject() {
  try {
    loading.value = true
    loadError.value = null
    project.value = await apiStore.getConfig(projectId)
    await loadSourceCursors()
    // Load runs lazily
    loadSourceRuns()
  } catch (err: any) {
    console.error('Failed to load project:', err)
    if (err?.message?.includes('404') || err?.status === 404) {
      loadError.value = 'Project not found'
    } else {
      loadError.value = 'Failed to load project'
    }
  } finally {
    loading.value = false
  }
}

// Drawer handling
function openRunDetail(run: SourceRunSummary) {
  selectedRun.value = run
  isRunDetailOpen.value = true
  router.replace({ query: { ...route.query, inspectRun: run.commit_id } })
}

function closeRunDetail() {
  isRunDetailOpen.value = false
  selectedRun.value = null
  const query = { ...route.query }
  delete query.inspectRun
  router.replace({ query })
}

function openSettings() {
  isSettingsOpen.value = true
  router.replace({ query: { ...route.query, settings: '1' } })
}

function closeSettings() {
  isSettingsOpen.value = false
  const query = { ...route.query }
  delete query.settings
  router.replace({ query })
}

function scrollToRecentActivity() {
  recentActivityRef.value?.scrollIntoView({ behavior: 'smooth' })
}

async function deleteProject() {
  if (!project.value) return
  
  try {
    await apiStore.deleteConfig(project.value.config.project_id)
    router.push('/projects')
  } catch (err) {
    console.error('Failed to delete project:', err)
    alert('Failed to delete project: ' + (err as Error).message)
  }
}

// Query param handling on mount
function handleQueryParams() {
  const inspectRunId = route.query.inspectRun as string
  const settingsOpen = route.query.settings === '1'
  
  if (inspectRunId && recentRunsMerged.value.length > 0) {
    const run = recentRunsMerged.value.find(r => r.commit_id === inspectRunId)
    if (run) {
      selectedRun.value = run
      isRunDetailOpen.value = true
    }
  }
  
  if (settingsOpen) {
    isSettingsOpen.value = true
  }
}

// Watch for route query changes
watch(() => route.query, () => {
  if (!route.query.inspectRun && isRunDetailOpen.value) {
    isRunDetailOpen.value = false
    selectedRun.value = null
  }
  if (!route.query.settings && isSettingsOpen.value) {
    isSettingsOpen.value = false
  }
}, { deep: true })

// Click outside directive
interface ClickOutsideElement extends HTMLElement {
  _clickOutside?: (event: Event) => void
}

const vClickOutside = {
  mounted(el: ClickOutsideElement, binding: any) {
    el._clickOutside = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value()
      }
    }
    document.addEventListener('click', el._clickOutside, true)
  },
  unmounted(el: ClickOutsideElement) {
    if (el._clickOutside) {
      document.removeEventListener('click', el._clickOutside, true)
    }
  }
}

// Keyboard shortcut for criteria save
function handleKeydown(e: KeyboardEvent) {
  if (isEditingCriteria.value && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    saveCriteriaEdit()
  }
}

onMounted(() => {
  loadProject().then(() => {
    // Handle query params after project loads
    setTimeout(handleQueryParams, 100)
  })
  document.addEventListener('keydown', handleKeydown)
})
</script>
