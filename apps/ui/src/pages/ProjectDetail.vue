<template>
  <div v-if="loading" class="text-center py-12">
    <p class="text-muted-foreground">Loading project...</p>
  </div>

  <div v-else-if="!project" class="text-center py-12">
    <p class="text-muted-foreground">Project not found</p>
    <RouterLink to="/projects" class="text-primary hover:underline">Back to projects</RouterLink>
  </div>

  <div v-else class="space-y-6">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-3xl font-bold tracking-tight">{{ project.config.project_name }}</h1>
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
        <button
          v-if="!project.index.is_active"
          @click="activate"
          class="rounded-lg border px-4 py-2 hover:bg-accent"
          :disabled="activating"
        >
          {{ activating ? 'Activating...' : 'Activate' }}
        </button>
        <RouterLink
          :to="`/projects/${project.config.project_id}/edit`"
          class="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        >
          Edit
        </RouterLink>
      </div>
    </div>

    <ProjectSubnav :project-id="projectId" />

    <!-- Overview -->
    <div class="grid gap-4 md:grid-cols-3">
      <div class="rounded-lg border bg-card p-4">
        <p class="text-sm text-muted-foreground">Version</p>
        <p class="text-lg font-semibold">{{ project.config.version }}</p>
      </div>
      <div class="rounded-lg border bg-card p-4">
        <p class="text-sm text-muted-foreground">Sources</p>
        <p class="text-lg font-semibold">{{ project.config.sources.length }}</p>
      </div>
      <div class="rounded-lg border bg-card p-4">
        <p class="text-sm text-muted-foreground">Topic</p>
        <p class="text-lg font-semibold truncate">{{ project.config.topic.label }}</p>
      </div>
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
          class="p-4 flex items-center justify-between"
        >
          <div>
            <p class="font-medium">{{ source.id }}</p>
            <p class="text-sm text-muted-foreground">{{ source.plugin }}</p>
          </div>
          <code class="text-xs bg-muted px-2 py-1 rounded">
            {{ JSON.stringify(source.config).slice(0, 50) }}...
          </code>
        </div>
      </div>
    </div>

    <!-- Pipeline -->
    <div class="rounded-lg border bg-card">
      <div class="border-b p-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Pipeline</h2>
        <RouterLink
          :to="`/projects/${project.config.project_id}/pipeline`"
          class="text-sm text-primary hover:underline"
        >
          Configure
        </RouterLink>
      </div>
      <div class="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="text-center p-3 rounded-lg bg-muted">
          <p class="text-xs text-muted-foreground">Normalizer</p>
          <p class="font-medium">{{ project.config.pipeline.normalizer.plugin }}</p>
        </div>
        <div class="text-center p-3 rounded-lg bg-muted">
          <p class="text-xs text-muted-foreground">Extractor</p>
          <p class="font-medium">{{ project.config.pipeline.extractor.plugin }}</p>
        </div>
        <div class="text-center p-3 rounded-lg bg-muted">
          <p class="text-xs text-muted-foreground">Comparator</p>
          <p class="font-medium">{{ project.config.pipeline.comparator.plugin }}</p>
        </div>
        <div class="text-center p-3 rounded-lg bg-muted">
          <p class="text-xs text-muted-foreground">Decider</p>
          <p class="font-medium">{{ project.config.pipeline.decider.plugin }}</p>
        </div>
      </div>
    </div>

    <!-- Operations -->
    <div class="rounded-lg border bg-card p-4">
      <h2 class="text-lg font-semibold mb-4">Operations</h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          :to="`/projects/${project.config.project_id}/content`"
          class="rounded-lg border px-4 py-2 hover:bg-accent"
        >
          Content
        </RouterLink>
        <RouterLink
          :to="`/projects/${project.config.project_id}/search`"
          class="rounded-lg border px-4 py-2 hover:bg-accent"
        >
          Search
        </RouterLink>
        <RouterLink
          :to="`/projects/${project.config.project_id}/run`"
          class="rounded-lg border px-4 py-2 hover:bg-accent"
        >
          Run Batch
        </RouterLink>
        <RouterLink
          :to="`/projects/${project.config.project_id}/inspect`"
          class="rounded-lg border px-4 py-2 hover:bg-accent"
        >
          Inspect
        </RouterLink>
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

    <!-- Raw Config -->
    <div class="rounded-lg border bg-card">
      <div class="border-b p-4">
        <h2 class="text-lg font-semibold">Raw Configuration</h2>
      </div>
      <div class="p-4">
        <pre class="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">{{ JSON.stringify(project.config, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiStore } from '@/stores/api'
import ProjectSubnav from '@/components/ProjectSubnav.vue'
import type { ProjectConfig, ProjectIndex } from '@/types'

const route = useRoute()
const router = useRouter()
const apiStore = useApiStore()

const projectId = route.params.id as string
const project = ref<{ config: ProjectConfig; index: ProjectIndex } | null>(null)
const loading = ref(true)
const activating = ref(false)
const deleting = ref(false)

async function loadProject() {
  try {
    loading.value = true
    project.value = await apiStore.getConfig(projectId)
  } catch (err) {
    console.error('Failed to load project:', err)
  } finally {
    loading.value = false
  }
}

async function activate() {
  try {
    activating.value = true
    await apiStore.activateConfig(projectId)
    await loadProject()
  } catch (err) {
    console.error('Failed to activate:', err)
  } finally {
    activating.value = false
  }
}

async function deleteProject() {
  if (!project.value) return

  const confirmed = window.confirm(
    `Delete project "${project.value.config.project_name}" (v${project.value.index.version})? This cannot be undone.`
  )
  if (!confirmed) return

  try {
    deleting.value = true
    await apiStore.deleteConfig(project.value.config.project_id, project.value.index.version)
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
