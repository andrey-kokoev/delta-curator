<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
      <p class="text-muted-foreground">Overview of your delta-curator instance</p>
    </div>

    <!-- Stats -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-lg border bg-card p-6">
        <div class="flex items-center gap-2">
          <FolderKanban class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm font-medium">Projects</span>
        </div>
        <p class="mt-2 text-3xl font-bold">{{ stats.projects }}</p>
      </div>
      
      <div class="rounded-lg border bg-card p-6">
        <div class="flex items-center gap-2">
          <FileText class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm font-medium">Curated Docs</span>
        </div>
        <p class="mt-2 text-3xl font-bold">{{ stats.docs }}</p>
      </div>
      
      <div class="rounded-lg border bg-card p-6">
        <div class="flex items-center gap-2">
          <GitCommit class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm font-medium">Commits</span>
        </div>
        <p class="mt-2 text-3xl font-bold">{{ stats.commits }}</p>
      </div>
      
      <div class="rounded-lg border bg-card p-6">
        <div class="flex items-center gap-2">
          <Activity class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm font-medium">Status</span>
        </div>
        <p class="mt-2 text-lg font-bold" :class="health?.ok ? 'text-success' : 'text-destructive'">
          {{ health?.ok ? 'Healthy' : 'Error' }}
        </p>
      </div>
    </div>

    <!-- Project -->
    <div v-if="activeConfig" class="rounded-lg border bg-card">
      <div class="border-b p-6">
        <h2 class="text-lg font-semibold">Project</h2>
      </div>
      <div class="p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-medium">{{ activeConfig.config.project_name }}</h3>
            <p class="text-sm text-muted-foreground">{{ activeConfig.config.project_id }}</p>
          </div>
          <RouterLink
            :to="`/projects/${activeConfig.config.project_id}`"
            class="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            View Project
          </RouterLink>
        </div>
        <div class="grid gap-4 md:grid-cols-2 text-sm">
          <div>
            <span class="text-muted-foreground">Topic:</span>
            <span class="ml-2 font-medium">{{ activeConfig.config.topic.label }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">Sources:</span>
            <span class="ml-2 font-medium">{{ activeConfig.config.sources.length }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="rounded-lg border bg-card">
      <div class="border-b p-6">
        <h2 class="text-lg font-semibold">Quick Actions</h2>
      </div>
      <div class="p-6 grid gap-4 md:grid-cols-3">
        <RouterLink
          to="/projects"
          class="flex items-center gap-3 rounded-lg border p-4 hover:bg-accent transition-colors"
        >
          <Plus class="h-5 w-5" />
          <div>
            <p class="font-medium">New Project</p>
            <p class="text-sm text-muted-foreground">Create a new curation project with AI</p>
          </div>
        </RouterLink>
        
        <RouterLink
          :to="activeConfig ? `/projects/${activeConfig.config.project_id}/run` : '/projects'"
          class="flex items-center gap-3 rounded-lg border p-4 hover:bg-accent transition-colors"
        >
          <Play class="h-5 w-5" />
          <div>
            <p class="font-medium">Run Batch</p>
            <p class="text-sm text-muted-foreground">Process new items</p>
          </div>
        </RouterLink>
        
        <RouterLink
          :to="activeConfig ? `/projects/${activeConfig.config.project_id}/search` : '/projects'"
          class="flex items-center gap-3 rounded-lg border p-4 hover:bg-accent transition-colors"
        >
          <Search class="h-5 w-5" />
          <div>
            <p class="font-medium">Search</p>
            <p class="text-sm text-muted-foreground">Query curated content</p>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { FolderKanban, FileText, GitCommit, Activity, Plus, Play, Search } from 'lucide-vue-next'
import { useApiStore } from '@/stores/api'
import type { ProjectConfig, HealthStatus } from '@/types'

const apiStore = useApiStore()

const stats = ref({ projects: 0, docs: 0, commits: 0 })
const health = ref<HealthStatus | null>(null)
const activeConfig = ref<{ config: ProjectConfig } | null>(null)

onMounted(async () => {
  try {
    const [configs, healthStatus, active] = await Promise.all([
      apiStore.listConfigs(),
      apiStore.getHealth().catch(() => null),
      apiStore.getActiveConfig().catch(() => null)
    ])
    
    stats.value.projects = configs.configs.length
    health.value = healthStatus
    activeConfig.value = active
  } catch (err) {
    console.error('Failed to load dashboard:', err)
  }
})
</script>
