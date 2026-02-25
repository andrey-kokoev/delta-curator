<template>
  <div v-if="loading" class="text-center py-12">
    <p class="text-muted-foreground">Loading project...</p>
  </div>

  <div v-else-if="!project" class="text-center py-12">
    <p class="text-muted-foreground">Project not found</p>
    <RouterLink to="/projects" class="text-primary hover:underline">Back to projects</RouterLink>
  </div>

  <div v-else class="space-y-6 w-full border rounded-lg bg-card p-6">
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
      <div class="border rounded-md bg-muted p-4 w-full">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Novelty Criteria</p>
        <input
          v-model="editableNoveltyCriteria"
          type="text"
          class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          @blur="saveInlineEdits"
          @keydown.enter.prevent="saveInlineEdits"
        />
      </div>
    </div>

    <ProjectSubnav :project-id="projectId" />

    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Overview</h2>
      <p class="text-muted-foreground">
        Project summary, source status, and storage
        <span v-if="inlineSaving" class="ml-2 text-sm">• Saving...</span>
        <span v-else-if="inlineSaveError" class="ml-2 text-sm text-destructive">• {{ inlineSaveError }}</span>
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
          class="p-4 flex items-start justify-between gap-4"
        >
          <div>
            <div class="flex items-center gap-2">
              <p class="font-medium">{{ source.id }}</p>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="source.enabled === false ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'"
              >
                {{ source.enabled === false ? 'Paused' : 'Enabled' }}
              </span>
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
    <details class="rounded-lg border bg-card">
      <summary class="relative cursor-pointer select-none border-b p-4 pr-24 text-lg font-semibold">
        <span class="inline-block">Raw Configuration</span>
        <button
          type="button"
          class="absolute right-4 top-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent"
          @click.stop.prevent="copyRawConfig"
        >
          {{ rawCopied ? 'Copied' : 'Copy' }}
        </button>
      </summary>
      <div class="p-4">
        <pre class="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">{{ JSON.stringify(project.config, null, 2) }}</pre>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiStore } from '@/stores/api'
import ProjectSubnav from '@/components/ProjectSubnav.vue'
import type { ProjectConfig, ProjectIndex, InspectResult, InspectSourceCursor } from '@/types'

const route = useRoute()
const router = useRouter()
const apiStore = useApiStore()

const projectId = route.params.id as string
const project = ref<{ config: ProjectConfig; index: ProjectIndex } | null>(null)
const loading = ref(true)
const deleting = ref(false)
const sourceCursors = ref<Record<string, InspectSourceCursor>>({})
const editableProjectName = ref('')
const editableNoveltyCriteria = ref('')
const inlineSaving = ref(false)
const inlineSaveError = ref<string | null>(null)
const rawCopied = ref(false)

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

async function copyRawConfig() {
  if (!project.value) return

  try {
    await navigator.clipboard.writeText(JSON.stringify(project.value.config, null, 2))
    rawCopied.value = true
    setTimeout(() => {
      rawCopied.value = false
    }, 1500)
  } catch (err) {
    console.error('Failed to copy raw config:', err)
  }
}

onMounted(loadProject)
</script>
