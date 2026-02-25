<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">New Project</h1>
      <p class="text-muted-foreground">Create a new curation project</p>
    </div>

    <form @submit.prevent="createProject" class="space-y-6">
      <!-- Basic Info -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h2 class="text-lg font-semibold">Basic Information</h2>
        
        <div class="space-y-2">
          <label class="text-sm font-medium">Project ID</label>
          <input
            v-model="form.project_id"
            type="text"
            required
            pattern="[a-z0-9-]+"
            placeholder="my-project"
            class="w-full rounded-lg border bg-background px-3 py-2"
          />
          <p class="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens only</p>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Project Name</label>
          <input
            v-model="form.project_name"
            type="text"
            required
            placeholder="My Project"
            class="w-full rounded-lg border bg-background px-3 py-2"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Topic Label</label>
          <input
            v-model="form.topic.label"
            type="text"
            required
            placeholder="e.g., FDA Communications"
            class="w-full rounded-lg border bg-background px-3 py-2"
          />
        </div>
      </div>

      <!-- Sources -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Data Sources</h2>
          <button
            type="button"
            @click="addSource"
            class="text-sm text-primary hover:underline"
          >
            + Add Source
          </button>
        </div>

        <div v-for="(source, index) in form.sources" :key="index" class="space-y-3 p-4 border rounded-lg">
          <div class="flex items-center justify-between">
            <span class="font-medium">Source {{ index + 1 }}</span>
            <button
              type="button"
              @click="removeSource(index)"
              class="text-sm text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
          
          <div class="space-y-2">
            <label class="text-sm">Source ID</label>
            <input
              v-model="source.id"
              type="text"
              required
              class="w-full rounded-lg border bg-background px-3 py-2"
            />
          </div>
          
          <div class="space-y-2">
            <label class="text-sm">Plugin</label>
            <select
              v-model="source.plugin"
              class="w-full rounded-lg border bg-background px-3 py-2"
            >
              <option value="rss_source">RSS Source</option>
              <option value="file_drop_source">File Drop Source</option>
              <option value="api_source">API Source</option>
            </select>
          </div>

          <div class="space-y-2">
            <label class="text-sm">Feed URL / Config</label>
            <input
              v-model="source.config.feed_url"
              type="url"
              placeholder="https://example.com/feed.xml"
              class="w-full rounded-lg border bg-background px-3 py-2"
            />
          </div>
        </div>
      </div>

      <!-- Pipeline (Simplified) -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h2 class="text-lg font-semibold">Pipeline Configuration</h2>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-sm">Normalizer</label>
            <select v-model="form.pipeline.normalizer.plugin" class="w-full rounded-lg border bg-background px-3 py-2">
              <option value="text_normalizer">Text Normalizer</option>
            </select>
          </div>
          
          <div class="space-y-2">
            <label class="text-sm">Extractor</label>
            <select v-model="form.pipeline.extractor.plugin" class="w-full rounded-lg border bg-background px-3 py-2">
              <option value="regex_facet_extractor">Regex Facet Extractor</option>
            </select>
          </div>
          
          <div class="space-y-2">
            <label class="text-sm">Comparator</label>
            <select v-model="form.pipeline.comparator.plugin" class="w-full rounded-lg border bg-background px-3 py-2">
              <option value="fingerprint_comparator">Fingerprint Comparator</option>
            </select>
          </div>
          
          <div class="space-y-2">
            <label class="text-sm">Decider</label>
            <select v-model="form.pipeline.decider.plugin" class="w-full rounded-lg border bg-background px-3 py-2">
              <option value="rules_decider">Rules Decider</option>
            </select>
          </div>
        </div>

        <div class="space-y-2">
          <label class="flex items-center gap-2">
            <input
              v-model="form.pipeline.ranking.ingest.enabled"
              type="checkbox"
            />
            <span class="text-sm">Enable ingest-time ranking (Workers AI)</span>
          </label>
        </div>

        <div v-if="form.pipeline.ranking.ingest.enabled" class="space-y-2">
          <label class="text-sm">Ranking Query</label>
          <input
            v-model="form.pipeline.ranking.ingest.query"
            type="text"
            placeholder="Enter query for ranking relevance"
            class="w-full rounded-lg border bg-background px-3 py-2"
          />
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-end gap-4">
        <RouterLink
          to="/projects"
          class="rounded-lg border px-4 py-2 hover:bg-accent"
        >
          Cancel
        </RouterLink>
        <button
          type="submit"
          class="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          :disabled="saving"
        >
          {{ saving ? 'Creating...' : 'Create Project' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApiStore } from '@/stores/api'
import type { ProjectConfig } from '@/types'

const router = useRouter()
const apiStore = useApiStore()

const saving = ref(false)

const form = reactive<ProjectConfig>({
  project_id: '',
  project_name: '',
  topic: {
    id: '',
    label: ''
  },
  sources: [
    {
      id: '',
      plugin: 'rss_source',
      config: {}
    }
  ],
  pipeline: {
    normalizer: { plugin: 'text_normalizer', config: {} },
    extractor: { plugin: 'regex_facet_extractor', config: {} },
    resolver: { plugin: 'dictionary_resolver', config: {} },
    comparator: { plugin: 'fingerprint_comparator', config: {} },
    ranking: {
      ingest: {
        enabled: false,
        backend: 'none',
        max_passage_chars: 4000
      },
      search: {
        enabled: false,
        backend: 'none',
        rerank: true
      }
    },
    decider: { plugin: 'rules_decider', config: {} },
    merger: { plugin: 'patch_to_mutations', config: {} }
  },
  storage: {
    committer: {
      plugin: 'd1_committer',
      config: { database: 'DB' }
    },
    artifacts: {
      kind: 'r2',
      bucket: 'ARTIFACTS',
      prefix: 'delta-curator/'
    }
  }
})

function addSource() {
  form.sources.push({
    id: '',
    plugin: 'rss_source',
    config: {}
  })
}

function removeSource(index: number) {
  form.sources.splice(index, 1)
}

async function createProject() {
  try {
    saving.value = true
    form.topic.id = `${form.project_id}-topic`
    await apiStore.saveConfig(form, true)
    router.push('/projects')
  } catch (err) {
    console.error('Failed to create project:', err)
    alert('Failed to create project: ' + (err as Error).message)
  } finally {
    saving.value = false
  }
}
</script>
