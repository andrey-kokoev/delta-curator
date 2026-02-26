<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">{{ project?.config.project_name || projectId }}</h1>
      <p class="text-muted-foreground">{{ project?.config.project_id || projectId }}</p>
    </div>

    <div class="flex flex-col md:flex-row gap-6 items-start w-full pb-6">
    <ProjectSubnav v-if="projectId" :project-id="projectId" />
    <div class="flex-1 min-w-0 space-y-6 w-full">

    <!-- Search Form -->
    <div class="rounded-lg border bg-card p-6 space-y-4">
      <div class="flex gap-4">
        <input
          v-model="query"
          type="text"
          placeholder="Enter search query..."
          class="flex-1 rounded-lg border bg-background px-4 py-2"
          @keyup.enter="performSearch"
        />
        <button
          @click="performSearch"
          class="rounded-lg bg-primary px-6 py-2 text-primary-foreground hover:bg-primary/90"
          :disabled="searching"
        >
          {{ searching ? 'Searching...' : 'Search' }}
        </button>
      </div>

      <div class="flex items-center gap-6">
        <label class="flex items-center gap-2">
          <input
            v-model="rerank"
            type="checkbox"
          />
          <span class="text-sm">Use AI reranking</span>
        </label>

        <div class="flex items-center gap-2">
          <span class="text-sm">Results:</span>
          <select v-model="k" class="rounded-lg border bg-background px-2 py-1">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Results -->
    <div v-if="results" class="space-y-4">
      <div class="flex items-center justify-between">
        <p class="text-muted-foreground">
          Found {{ results.total }} results in {{ results.took_ms }}ms
        </p>
      </div>

      <div v-if="results.docs.length === 0" class="text-center py-12">
        <SearchIcon class="mx-auto h-12 w-12 text-muted-foreground" />
        <p class="mt-4 text-muted-foreground">No results found</p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="(doc, index) in results.docs"
          :key="doc.doc_id"
          class="rounded-lg border bg-card p-6"
        >
          <div class="flex items-start gap-4">
            <span class="text-sm text-muted-foreground w-8">#{{ index + 1 }}</span>
            <div class="flex-1">
              <p class="font-medium">{{ doc.doc_id }}</p>
              <p class="text-sm text-muted-foreground">{{ doc.source_item_id }}</p>
              <pre class="mt-2 text-xs bg-muted p-3 rounded overflow-auto max-h-48">{{ formatPayload(doc.payload) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
      </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Search as SearchIcon } from 'lucide-vue-next'
import { useApiStore } from '@/stores/api'
import ProjectSubnav from '@/components/ProjectSubnav.vue'
import type { SearchResult, ProjectConfig } from '@/types'

const apiStore = useApiStore()
const route = useRoute()
const projectId = route.params.id as string | undefined

const query = ref('')
const k = ref(20)
const rerank = ref(true)
const searching = ref(false)
const results = ref<SearchResult | null>(null)
const project = ref<{ config: ProjectConfig } | null>(null)

async function loadProjectContext() {
  if (!projectId) return
  try {
    project.value = await apiStore.getConfig(projectId)
  } catch (err) {
    console.error('Failed to load project context:', err)
  }
}

async function performSearch() {
  if (!query.value.trim()) return
  
  try {
    searching.value = true
    results.value = await apiStore.searchScoped(query.value, {
      k: k.value,
      rerank: rerank.value,
      projectId,
    })
  } catch (err) {
    console.error('Search failed:', err)
    alert('Search failed: ' + (err as Error).message)
  } finally {
    searching.value = false
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

onMounted(loadProjectContext)
</script>
