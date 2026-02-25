<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">{{ project?.project_name || projectId }}</h1>
      <p class="text-muted-foreground">{{ project?.project_id || projectId }}</p>
    </div>

    <ProjectSubnav :project-id="projectId" />

    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Pipeline</h2>
      <p class="text-muted-foreground">Configure processing pipeline</p>
    </div>

    <div v-if="loading" class="text-center py-12">
      <p class="text-muted-foreground">Loading...</p>
    </div>

    <div v-else class="space-y-6">
      <!-- Pipeline Stages -->
      <div class="rounded-lg border bg-card p-6 space-y-6">
        <h2 class="text-lg font-semibold">Pipeline Stages</h2>
        
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-sm font-medium">Normalizer</label>
            <select v-model="pipeline.normalizer.plugin" class="w-full rounded-lg border bg-background px-3 py-2">
              <option value="text_normalizer">Text Normalizer</option>
            </select>
            <textarea
              v-model="normalizerConfig"
              rows="3"
              class="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
              placeholder="Config JSON"
            ></textarea>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Extractor</label>
            <select v-model="pipeline.extractor.plugin" class="w-full rounded-lg border bg-background px-3 py-2">
              <option value="regex_facet_extractor">Regex Facet Extractor</option>
            </select>
            <textarea
              v-model="extractorConfig"
              rows="3"
              class="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
              placeholder="Config JSON"
            ></textarea>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Resolver</label>
            <select v-model="pipeline.resolver.plugin" class="w-full rounded-lg border bg-background px-3 py-2">
              <option value="dictionary_resolver">Dictionary Resolver</option>
            </select>
            <textarea
              v-model="resolverConfig"
              rows="3"
              class="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
              placeholder="Config JSON"
            ></textarea>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Comparator</label>
            <select v-model="pipeline.comparator.plugin" class="w-full rounded-lg border bg-background px-3 py-2">
              <option value="fingerprint_comparator">Fingerprint Comparator</option>
            </select>
            <textarea
              v-model="comparatorConfig"
              rows="3"
              class="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
              placeholder="Config JSON"
            ></textarea>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Decider</label>
            <select v-model="pipeline.decider.plugin" class="w-full rounded-lg border bg-background px-3 py-2">
              <option value="rules_decider">Rules Decider</option>
            </select>
            <textarea
              v-model="deciderConfig"
              rows="3"
              class="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
              placeholder="Config JSON"
            ></textarea>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Merger</label>
            <select v-model="pipeline.merger.plugin" class="w-full rounded-lg border bg-background px-3 py-2">
              <option value="patch_to_mutations">Patch to Mutations</option>
            </select>
            <textarea
              v-model="mergerConfig"
              rows="3"
              class="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
              placeholder="Config JSON"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Ranking -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h2 class="text-lg font-semibold">Ranking Configuration</h2>
        
        <div class="space-y-4">
          <div class="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p class="font-medium">Ingest-time Ranking</p>
              <p class="text-sm text-muted-foreground">Rank items during ingestion using Workers AI</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                v-model="pipeline.ranking.ingest.enabled"
                type="checkbox"
                class="sr-only peer"
              >
              <div class="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-primary-foreground after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-background after:border-input after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div v-if="pipeline.ranking.ingest.enabled" class="space-y-2 pl-4 border-l-2">
            <label class="text-sm">Ranking Query</label>
            <input
              v-model="pipeline.ranking.ingest.query"
              type="text"
              placeholder="Enter query for relevance scoring"
              class="w-full rounded-lg border bg-background px-3 py-2"
            />
            <label class="text-sm">Model</label>
            <input
              v-model="pipeline.ranking.ingest.model"
              type="text"
              placeholder="@cf/baai/bge-reranker-base"
              class="w-full rounded-lg border bg-background px-3 py-2"
            />
          </div>

          <div class="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p class="font-medium">Search-time Ranking</p>
              <p class="text-sm text-muted-foreground">Use AI Search for query-time reranking</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                v-model="pipeline.ranking.search.enabled"
                type="checkbox"
                class="sr-only peer"
              >
              <div class="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-primary-foreground after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-background after:border-input after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div v-if="pipeline.ranking.search.enabled" class="space-y-2 pl-4 border-l-2">
            <label class="text-sm">Index Name</label>
            <input
              v-model="pipeline.ranking.search.index"
              type="text"
              placeholder="delta-curator-index"
              class="w-full rounded-lg border bg-background px-3 py-2"
            />
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-4">
        <button
          @click="savePipeline"
          class="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          :disabled="saving"
        >
          {{ saving ? 'Saving...' : 'Save Pipeline' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiStore } from '@/stores/api'
import ProjectSubnav from '@/components/ProjectSubnav.vue'
import type { ProjectConfig, PipelineConfig } from '@/types'

const route = useRoute()
const router = useRouter()
const apiStore = useApiStore()

const projectId = route.params.id as string
const project = ref<ProjectConfig | null>(null)
const pipeline = ref<PipelineConfig>({} as PipelineConfig)
const loading = ref(true)
const saving = ref(false)

// Config JSON strings
const normalizerConfig = ref('')
const extractorConfig = ref('')
const resolverConfig = ref('')
const comparatorConfig = ref('')
const deciderConfig = ref('')
const mergerConfig = ref('')

async function loadProject() {
  try {
    loading.value = true
    const result = await apiStore.getConfig(projectId)
    project.value = result.config
    pipeline.value = { ...result.config.pipeline }
    
    // Initialize config JSON
    normalizerConfig.value = JSON.stringify(pipeline.value.normalizer.config || {}, null, 2)
    extractorConfig.value = JSON.stringify(pipeline.value.extractor.config || {}, null, 2)
    resolverConfig.value = JSON.stringify(pipeline.value.resolver.config || {}, null, 2)
    comparatorConfig.value = JSON.stringify(pipeline.value.comparator.config || {}, null, 2)
    deciderConfig.value = JSON.stringify(pipeline.value.decider.config || {}, null, 2)
    mergerConfig.value = JSON.stringify(pipeline.value.merger.config || {}, null, 2)
  } catch (err) {
    console.error('Failed to load project:', err)
  } finally {
    loading.value = false
  }
}

async function savePipeline() {
  try {
    saving.value = true
    
    // Parse configs
    pipeline.value.normalizer.config = JSON.parse(normalizerConfig.value || '{}')
    pipeline.value.extractor.config = JSON.parse(extractorConfig.value || '{}')
    pipeline.value.resolver.config = JSON.parse(resolverConfig.value || '{}')
    pipeline.value.comparator.config = JSON.parse(comparatorConfig.value || '{}')
    pipeline.value.decider.config = JSON.parse(deciderConfig.value || '{}')
    pipeline.value.merger.config = JSON.parse(mergerConfig.value || '{}')
    
    if (project.value) {
      project.value.pipeline = pipeline.value
      await apiStore.saveConfig(project.value, false)
      router.push(`/projects/${projectId}`)
    }
  } catch (err) {
    console.error('Failed to save pipeline:', err)
    alert('Failed to save: ' + (err as Error).message)
  } finally {
    saving.value = false
  }
}

onMounted(loadProject)
</script>
