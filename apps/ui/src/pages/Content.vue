<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">{{ project?.config.project_name || projectId }}</h1>
      <p class="text-muted-foreground">{{ project?.config.project_id || projectId }}</p>
    </div>

    <ProjectSubnav v-if="projectId" :project-id="projectId" />

    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Content</h2>
      <p class="text-muted-foreground">Browse curated documents</p>
    </div>

    <!-- Filters -->
    <div class="flex gap-4">
      <input
        v-model="filters.sourceId"
        type="text"
        placeholder="Filter by source..."
        class="rounded-lg border bg-background px-4 py-2"
      />
      <button
        @click="loadContent"
        class="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
      >
        Refresh
      </button>
    </div>

    <!-- Content List -->
    <div v-if="loading" class="text-center py-12">
      <p class="text-muted-foreground">Loading content...</p>
    </div>

    <div v-else-if="docs.length === 0" class="text-center py-12">
      <FileText class="mx-auto h-12 w-12 text-muted-foreground" />
      <h3 class="mt-4 text-lg font-medium">No content yet</h3>
      <p class="mt-2 text-muted-foreground">Run a batch to start curating content</p>
      <RouterLink
        :to="project ? `/projects/${project.config.project_id}/run` : '/projects'"
        class="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-primary-foreground"
      >
        Run Batch
      </RouterLink>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="doc in docs"
        :key="doc.doc_id"
        class="rounded-lg border bg-card p-6"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <p class="font-medium truncate">{{ doc.doc_id }}</p>
            <p class="text-sm text-muted-foreground">Source: {{ doc.source_item_id }}</p>
          </div>
          <button
            @click="selectedDoc = selectedDoc?.doc_id === doc.doc_id ? null : doc"
            class="text-sm text-primary hover:underline"
          >
            {{ selectedDoc?.doc_id === doc.doc_id ? 'Hide' : 'View' }}
          </button>
        </div>

        <div v-if="selectedDoc?.doc_id === doc.doc_id" class="mt-4">
          <pre class="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">{{ formatPayload(doc.payload) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { FileText } from 'lucide-vue-next'
import { useApiStore } from '@/stores/api'
import ProjectSubnav from '@/components/ProjectSubnav.vue'
import type { CuratedDoc, ProjectConfig } from '@/types'

const docs = ref<CuratedDoc[]>([])
const loading = ref(true)
const selectedDoc = ref<CuratedDoc | null>(null)
const filters = ref({ sourceId: '' })
const project = ref<{ config: ProjectConfig } | null>(null)
const route = useRoute()
const apiStore = useApiStore()
const projectId = route.params.id as string | undefined

async function loadProjectContext() {
  if (!projectId) return
  try {
    project.value = await apiStore.getConfig(projectId)
  } catch (err) {
    console.error('Failed to load project context:', err)
  }
}

async function loadContent() {
  try {
    loading.value = true
    const result = await apiStore.listContent({
      k: 100,
      projectId,
      sourceId: filters.value.sourceId || undefined
    })
    docs.value = result.docs
  } catch (err) {
    console.error('Failed to load content:', err)
  } finally {
    loading.value = false
  }
}

function formatPayload(payload: string): string {
  try {
    const parsed = JSON.parse(payload)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return payload
  }
}

onMounted(async () => {
  await loadProjectContext()
  await loadContent()
})
</script>
