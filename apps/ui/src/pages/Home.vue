<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
      <p class="text-muted-foreground">Overview of your delta-curator instance</p>
    </div>

    <!-- Instance Summary Strip (Compact) -->
    <div class="rounded-lg border bg-card">
      <div class="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x">
        <div class="p-4 flex items-center gap-3">
          <FolderKanban class="h-5 w-5 text-muted-foreground" />
          <div>
            <p class="text-xs text-muted-foreground uppercase tracking-wide">Projects</p>
            <p class="text-xl font-bold">{{ stats.projects >= 0 ? stats.projects : '—' }}</p>
          </div>
        </div>
        <div class="p-4 flex items-center gap-3">
          <FileText class="h-5 w-5 text-muted-foreground" />
          <div>
            <p class="text-xs text-muted-foreground uppercase tracking-wide">Curated Docs</p>
            <p class="text-xl font-bold">{{ stats.docs >= 0 ? stats.docs : '—' }}</p>
          </div>
        </div>
        <div class="p-4 flex items-center gap-3">
          <GitCommit class="h-5 w-5 text-muted-foreground" />
          <div>
            <p class="text-xs text-muted-foreground uppercase tracking-wide">Commits</p>
            <p class="text-xl font-bold">{{ stats.commits >= 0 ? stats.commits : '—' }}</p>
          </div>
        </div>
        <div class="p-4 flex items-center gap-3">
          <Activity class="h-5 w-5 text-muted-foreground" />
          <div>
            <p class="text-xs text-muted-foreground uppercase tracking-wide">Health</p>
            <p class="text-xl font-bold" :class="healthClass">{{ healthText }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Window Switcher -->
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Projects</h2>
      <div class="inline-flex rounded-lg border bg-card p-1" role="tablist">
        <button
          v-for="mode in windowModes"
          :key="mode.value"
          @click="setWindowMode(mode.value)"
          :class="[
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            windowMode === mode.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          ]"
          :aria-current="windowMode === mode.value ? 'true' : undefined"
          role="tab"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loadingProjects" class="space-y-4">
      <div class="h-32 rounded-lg border bg-card animate-pulse" />
      <div class="h-32 rounded-lg border bg-card animate-pulse" />
    </div>

    <!-- No Projects State -->
    <div v-else-if="projects.length === 0" class="rounded-lg border bg-card p-8 text-center">
      <FolderKanban class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h3 class="text-lg font-semibold mb-2">No projects yet</h3>
      <p class="text-muted-foreground mb-4">Create your first project to get started</p>
      <RouterLink
        to="/projects"
        class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus class="h-4 w-4" />
        Create Project
      </RouterLink>
    </div>

    <template v-else>
      <!-- Pinned Projects -->
      <section v-if="pinnedProjects.length > 0 || showPinnedEmpty" class="space-y-3">
        <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pinned</h3>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ProjectCard
            v-for="project in pinnedProjects"
            :key="project.project_id"
            :project="project"
            :activity="getActivity(project.project_id)"
            :window-mode="windowMode"
            @toggle-pin="handleTogglePin"
            @mark-reviewed="handleMarkReviewed"
          />
        </div>
      </section>

      <!-- Pinned Empty Helper -->
      <section v-else-if="recentProjects.length > 0" class="space-y-3">
        <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pinned</h3>
        <div class="rounded-lg border border-dashed bg-card p-6 text-center">
          <Star class="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p class="text-sm text-muted-foreground">Pin projects to keep them here.</p>
        </div>
      </section>

      <!-- Recent Projects -->
      <section v-if="recentProjects.length > 0" class="space-y-3">
        <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">Recent</h3>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ProjectCard
            v-for="project in recentProjects"
            :key="project.project_id"
            :project="project"
            :activity="getActivity(project.project_id)"
            :window-mode="windowMode"
            @toggle-pin="handleTogglePin"
            @mark-reviewed="handleMarkReviewed"
          />
        </div>
      </section>
    </template>

    <!-- Quick Action -->
    <section class="pt-4 border-t">
      <RouterLink
        to="/projects"
        class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus class="h-4 w-4" />
        New Project
      </RouterLink>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { FolderKanban, FileText, GitCommit, Activity, Plus, Star } from 'lucide-vue-next'
import { useApiStore } from '@/stores/api'
import type { ProjectListItem, ProjectActivity, HealthStatus } from '@/types'
import ProjectCard from '@/components/ProjectCard.vue'

const apiStore = useApiStore()

// Window mode
const windowModes = [
  { value: '24h' as const, label: '24h' },
  { value: '7d' as const, label: '7d' },
  { value: 'since_review' as const, label: 'Since review' }
]
const windowMode = ref<'24h' | '7d' | 'since_review'>('24h')

// State
const projects = ref<ProjectListItem[]>([])
const activityByProject = ref<Record<string, ProjectActivity>>({})
const loadingProjects = ref(false)
const loadingActivity = ref(false)
const health = ref<HealthStatus | null>(null)
const stats = ref({ projects: 0, docs: 0, commits: 0 })

// Error state per project for optimistic updates
const projectErrors = ref<Record<string, string>>({})

// Computed
const healthText = computed(() => {
  if (!health.value) return 'Unknown'
  return health.value.ok ? 'Healthy' : 'Error'
})

const healthClass = computed(() => {
  if (!health.value) return 'text-muted-foreground'
  return health.value.ok ? 'text-success' : 'text-destructive'
})

const pinnedProjects = computed(() => {
  return projects.value
    .filter(p => p.pinned)
    .sort((a, b) => {
      // Sort by last_activity_at desc (null last), then name asc
      if (a.last_activity_at && b.last_activity_at) {
        return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
      }
      if (a.last_activity_at) return -1
      if (b.last_activity_at) return 1
      return a.project_name.localeCompare(b.project_name)
    })
})

const recentProjects = computed(() => {
  return projects.value
    .filter(p => !p.pinned)
    .sort((a, b) => {
      // Sort by last_activity_at desc (null last), then name asc
      if (a.last_activity_at && b.last_activity_at) {
        return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
      }
      if (a.last_activity_at) return -1
      if (b.last_activity_at) return 1
      return a.project_name.localeCompare(b.project_name)
    })
    .slice(0, 6) // Limit to top 6
})

const showPinnedEmpty = computed(() => {
  return pinnedProjects.value.length === 0 && projects.value.length > 0
})

// Methods
function getActivity(projectId: string): ProjectActivity | undefined {
  return activityByProject.value[projectId]
}

function setWindowMode(mode: '24h' | '7d' | 'since_review') {
  windowMode.value = mode
}

async function loadProjects() {
  loadingProjects.value = true
  try {
    const result = await apiStore.listProjects()
    projects.value = result.projects
    stats.value.projects = result.projects.length
  } catch (err) {
    console.error('Failed to load projects:', err)
  } finally {
    loadingProjects.value = false
  }
}

async function loadActivity() {
  if (projects.value.length === 0) return
  
  loadingActivity.value = true
  try {
    const result = await apiStore.getProjectActivity(windowMode.value)
    activityByProject.value = result.activity.reduce((acc, item) => {
      acc[item.project_id] = item
      return acc
    }, {} as Record<string, ProjectActivity>)
  } catch (err) {
    console.error('Failed to load activity:', err)
  } finally {
    loadingActivity.value = false
  }
}

async function loadHealth() {
  try {
    health.value = await apiStore.getHealth()
  } catch (err) {
    console.error('Failed to load health:', err)
    health.value = null
  }
}

async function handleTogglePin(projectId: string, nextPinned: boolean) {
  const project = projects.value.find(p => p.project_id === projectId)
  if (!project) return

  // Optimistic update
  const originalPinned = project.pinned
  project.pinned = nextPinned
  delete projectErrors.value[projectId]

  try {
    const result = await apiStore.updateProject(projectId, { pinned: nextPinned })
    // Update with server response
    const index = projects.value.findIndex(p => p.project_id === projectId)
    if (index !== -1) {
      projects.value[index] = result.project
    }
  } catch (err) {
    // Revert on error
    project.pinned = originalPinned
    projectErrors.value[projectId] = 'Failed to update pin. Retry.'
    console.error('Failed to toggle pin:', err)
  }
}

async function handleMarkReviewed(projectId: string) {
  const project = projects.value.find(p => p.project_id === projectId)
  if (!project) return

  // Optimistic update
  const originalReviewedAt = project.last_reviewed_at
  const now = new Date().toISOString()
  project.last_reviewed_at = now
  delete projectErrors.value[projectId]

  try {
    const result = await apiStore.markProjectReviewed(projectId)
    // Update with server response
    const index = projects.value.findIndex(p => p.project_id === projectId)
    if (index !== -1) {
      projects.value[index] = result.project
    }
    // Refresh activity to update "since review" counts
    await loadActivity()
  } catch (err) {
    // Revert on error
    project.last_reviewed_at = originalReviewedAt
    projectErrors.value[projectId] = 'Failed to mark reviewed. Retry.'
    console.error('Failed to mark reviewed:', err)
  }
}

// Watch for window mode changes
watch(windowMode, () => {
  loadActivity()
})

// Lifecycle
onMounted(async () => {
  await Promise.all([
    loadProjects(),
    loadHealth()
  ])
  await loadActivity()
})
</script>
