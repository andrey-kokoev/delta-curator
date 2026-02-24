<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[600px]">
      <div class="mb-4">
        <h2 class="text-lg font-semibold">Create Project with AI</h2>
        <p class="text-sm text-muted-foreground">
          Describe your project and let AI help you configure it.
        </p>
      </div>

      <div class="space-y-4">
        <div>
          <Label for="description">Project Description</Label>
          <Textarea
            id="description"
            v-model="description"
            placeholder="Describe what you want to curate (e.g., 'Track AI news from Hacker News and tech blogs')"
            class="min-h-[100px]"
          />
        </div>

        <div class="flex gap-2">
          <Button
            @click="generateConfig"
            :disabled="!description.trim() || generating"
            class="flex-1"
          >
            <Sparkles class="mr-2 h-4 w-4" />
            {{ generating ? 'Generating...' : 'Generate Config' }}
          </Button>
          <Button
            variant="outline"
            @click="createFromGenerated"
            :disabled="!generatedConfig || creating"
          >
            {{ creating ? 'Creating...' : 'Create Project' }}
          </Button>
        </div>

        <div v-if="generatedConfig" class="rounded-lg border bg-muted p-4">
          <h4 class="font-medium mb-2">Generated Configuration:</h4>
          <pre class="text-sm text-muted-foreground whitespace-pre-wrap">{{ JSON.stringify(generatedConfig, null, 2) }}</pre>
        </div>

        <div v-if="error" class="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p class="text-sm text-destructive">{{ error }}</p>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-6">
        <Button variant="outline" @click="$emit('update:open', false)">
          Cancel
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Sparkles } from 'lucide-vue-next'
import { DialogRoot as Dialog, DialogContent } from 'radix-vue'
import Button from '@/components/ui/button.vue'
import Label from '@/components/ui/label.vue'
import Textarea from '@/components/ui/textarea.vue'
import type { ProjectConfig } from '@delta-curator/protocol'

interface Props {
  open: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': [config: ProjectConfig]
}>()

const description = ref('')
const generating = ref(false)
const creating = ref(false)
const generatedConfig = ref<ProjectConfig | null>(null)
const error = ref('')

async function generateConfig() {
  if (!description.value.trim()) return

  generating.value = true
  error.value = ''

  try {
    // Mock AI generation - in real implementation, this would call an AI service
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Generate a basic config based on description
    const mockConfig: ProjectConfig = {
      version: '1.0.0',
      project_id: `project-${Date.now()}`,
      project_name: 'AI Generated Project',
      topic: {
        id: 'ai-generated-topic',
        label: description.value
      },
      sources: [{
        id: 'hacker-news-source',
        plugin: 'rss_source',
        config: {
          feed_url: 'https://hnrss.org/frontpage',
          user_agent: 'delta-curator/0.1',
          max_items_per_batch: 50
        }
      }],
      pipeline: {
        normalizer: { plugin: 'text_normalizer', config: {} },
        extractor: { plugin: 'regex_facet_extractor', config: {} },
        resolver: { plugin: 'dictionary_resolver', config: {} },
        comparator: { plugin: 'fingerprint_comparator', config: {} },
        ranking: {
          ingest: { enabled: false, backend: 'none', max_passage_chars: 4000 },
          search: { enabled: false, backend: 'none', rerank: true }
        },
        decider: { plugin: 'rules_decider', config: {} },
        merger: { plugin: 'patch_to_mutations', config: {} }
      },
      storage: {
        committer: { plugin: 'd1_committer', config: { database: 'DB' } },
        artifacts: { kind: 'r2', bucket: 'ARTIFACTS', prefix: 'delta-curator/' }
      }
    }

    generatedConfig.value = mockConfig
  } catch (err) {
    error.value = 'Failed to generate configuration'
  } finally {
    generating.value = false
  }
}

async function createFromGenerated() {
  if (!generatedConfig.value) return

  creating.value = true
  error.value = ''

  try {
    // In real implementation, this would call the API to create the project
    emit('created', generatedConfig.value)
    emit('update:open', false)

    // Reset form
    description.value = ''
    generatedConfig.value = null
  } catch (err) {
    error.value = 'Failed to create project'
  } finally {
    creating.value = false
  }
}
</script>