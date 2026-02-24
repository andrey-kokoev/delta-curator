<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
      <div class="mb-4">
        <DialogTitle class="flex items-center gap-2">
          <Sparkles class="h-5 w-5" />
          Create Project with AI Assistant
        </DialogTitle>
        <DialogDescription>
          Let our AI guide you through creating the perfect curation project.
        </DialogDescription>
      </div>

      <!-- Progress Indicator -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium">Setup Progress</span>
          <span class="text-sm text-muted-foreground">{{ currentStep + 1 }} of {{ steps.length }}</span>
        </div>
        <div class="w-full bg-muted rounded-full h-2">
          <div
            class="bg-primary h-2 rounded-full transition-all duration-300"
            :style="{ width: `${((currentStep + 1) / steps.length) * 100}%` }"
          ></div>
        </div>
      </div>

      <div class="space-y-6">
        <!-- Current Step -->
        <div v-if="currentStepData" class="space-y-4">
          <div class="bg-muted/50 rounded-lg p-4">
            <h3 class="font-medium mb-2">{{ currentStepData.title }}</h3>
            <p class="text-sm text-muted-foreground mb-4">{{ currentStepData.description }}</p>

            <!-- AI Question -->
            <div class="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4">
              <div class="flex items-start gap-3">
                <div class="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Sparkles class="h-4 w-4 text-primary" />
                </div>
                <div class="flex-1">
                  <p class="text-sm font-medium mb-1">AI Assistant</p>
                  <p class="text-sm">{{ currentStepData.aiQuestion }}</p>
                </div>
              </div>
            </div>

            <!-- Form Field -->
            <div class="space-y-3">
              <Label :for="currentStepData.field" class="pb-2">{{ currentStepData.fieldLabel }}</Label>

              <!-- Text Input -->
              <Textarea
                v-if="currentStepData.type === 'textarea'"
                :id="currentStepData.field"
                v-model="formData[currentStepData.field]"
                :placeholder="currentStepData.placeholder"
                @input="validateCurrentField"
              />

              <!-- Select Input -->
              <select
                v-else-if="currentStepData.type === 'select'"
                :id="currentStepData.field"
                v-model="formData[currentStepData.field]"
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                @change="validateCurrentField"
              >
                <option value="" disabled>{{ currentStepData.placeholder }}</option>
                <option
                  v-for="option in currentStepData.options"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>

              <!-- Validation Error -->
              <p v-if="fieldErrors[currentStepData.field]" class="text-sm text-destructive">
                {{ fieldErrors[currentStepData.field] }}
              </p>

              <!-- Help Text -->
              <div v-if="currentStepData.help" class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div class="flex items-start gap-3">
                  <div class="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span class="text-xs text-blue-600">💡</span>
                  </div>
                  <div class="flex-1">
                    <p class="text-sm text-blue-800">{{ currentStepData.help }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Form Preview (on last step) -->
        <div v-if="currentStep === steps.length - 1 && isFormValid" class="bg-green-50 border border-green-200 rounded-lg p-4">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle class="h-4 w-4 text-green-600" />
            </div>
            <div class="flex-1">
              <h4 class="font-medium text-green-800 mb-2">Ready to Create!</h4>
              <p class="text-sm text-green-700 mb-3">
                Your project configuration is complete. Click "Create Project" to save it.
              </p>
              <details class="text-sm">
                <summary class="cursor-pointer text-green-700 hover:text-green-800 font-medium">
                  Preview Configuration
                </summary>
                <pre class="mt-2 text-xs bg-green-100 p-2 rounded overflow-x-auto">{{ JSON.stringify(generateConfig(), null, 2) }}</pre>
              </details>
            </div>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p class="text-sm text-destructive">{{ error }}</p>
        </div>
      </div>

      <div class="flex gap-2 mt-6">
        <Button
          variant="outline"
          @click="previousStep"
          :disabled="currentStep === 0"
        >
          <ArrowLeft class="mr-2 h-4 w-4" />
          Previous
        </Button>

        <Button
          v-if="currentStep < steps.length - 1"
          @click="nextStep"
          :disabled="!isCurrentFieldValid"
        >
          Next
          <ArrowRight class="ml-2 h-4 w-4" />
        </Button>

        <Button
          v-else
          @click="createProject"
          :disabled="!isFormValid || creating"
        >
          <Sparkles class="mr-2 h-4 w-4" />
          {{ creating ? 'Creating...' : 'Create Project' }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Sparkles, ArrowLeft, ArrowRight, CheckCircle } from 'lucide-vue-next'
import Button from '@/components/ui/button.vue'
import Label from '@/components/ui/label.vue'
import Textarea from '@/components/ui/textarea.vue'
import { DialogRoot as Dialog, DialogContent, DialogDescription, DialogTitle } from 'radix-vue'
import type { ProjectConfig } from '@delta-curator/protocol'

interface Step {
  id: string
  title: string
  description: string
  field: string
  fieldLabel: string
  type: 'textarea' | 'select'
  placeholder: string
  aiQuestion: string
  help?: string
  options?: { value: string; label: string }[]
  validation?: (value: string) => string | null
  required?: boolean
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': [config: ProjectConfig]
}>()

const currentStep = ref(0)
const formData = ref<Record<string, string>>({})
const fieldErrors = ref<Record<string, string>>({})
const error = ref('')
const creating = ref(false)

const steps: Step[] = [
  {
    id: 'description',
    title: 'Project Overview',
    description: 'Tell me about your curation goals',
    field: 'description',
    fieldLabel: 'Project Description',
    type: 'textarea',
    placeholder: 'What do you want to curate? (e.g., AI news, tech blogs, research papers)',
    aiQuestion: 'What kind of content would you like to curate? Please describe your project in a few sentences.',
    help: 'Be specific about the domain, sources, and what makes content "interesting" to you. This helps me suggest the best configuration.',
    validation: (value) => {
      if (!value.trim()) return 'Please provide a project description'
      if (value.length < 10) return 'Please provide more detail (at least 10 characters)'
      return null
    },
    required: true,
  },
  {
    id: 'sources',
    title: 'Data Sources',
    description: 'Where should we collect data from?',
    field: 'sources',
    fieldLabel: 'Primary Sources',
    type: 'select',
    placeholder: 'Select your main data source',
    aiQuestion: 'Where would you like to collect data from? Choose the most relevant source for your project.',
    help: 'Different sources have different update frequencies and content types. RSS feeds are great for blogs, APIs for structured data.',
    options: [
      { value: 'rss', label: 'RSS Feeds (blogs, news sites)' },
      { value: 'api', label: 'APIs (social media, platforms)' },
      { value: 'web-scraping', label: 'Web Scraping (any website)' },
      { value: 'file-upload', label: 'File Upload (documents, datasets)' },
    ],
    validation: (value) => {
      if (!value) return 'Please select a data source'
      return null
    },
    required: true,
  },
  {
    id: 'frequency',
    title: 'Update Frequency',
    description: 'How often should we check for new content?',
    field: 'frequency',
    fieldLabel: 'Check Frequency',
    type: 'select',
    placeholder: 'How often to check for updates?',
    aiQuestion: 'How frequently should we check for new content? Consider how often your sources publish.',
    help: 'More frequent checks catch content faster but use more resources. News sites might need hourly checks, blogs daily.',
    options: [
      { value: 'hourly', label: 'Every hour (real-time content)' },
      { value: 'daily', label: 'Once per day (blogs, articles)' },
      { value: 'weekly', label: 'Once per week (research, reports)' },
    ],
    validation: (value) => {
      if (!value) return 'Please select a frequency'
      return null
    },
    required: true,
  },
  {
    id: 'criteria',
    title: 'Novelty Criteria',
    description: 'What makes content novel or interesting?',
    field: 'criteria',
    fieldLabel: 'Novelty Rules',
    type: 'textarea',
    placeholder: 'Describe what makes content worth keeping (e.g., "AI breakthroughs", "new frameworks", "industry trends")',
    aiQuestion: 'What criteria should we use to determine if content is novel or interesting? Think about keywords, topics, or patterns.',
    help: 'This helps filter out duplicates and low-value content. Mention specific terms, topics, or quality indicators.',
    validation: (value) => {
      if (!value.trim()) return 'Please describe your novelty criteria'
      if (value.length < 20) return 'Please provide more specific criteria (at least 20 characters)'
      return null
    },
    required: true,
  },
  {
    id: 'ranking',
    title: 'Content Ranking',
    description: 'How should we prioritize content?',
    field: 'ranking',
    fieldLabel: 'Ranking Strategy',
    type: 'select',
    placeholder: 'How to rank and sort content?',
    aiQuestion: 'How would you like to rank and prioritize the curated content?',
    help: 'Ranking affects what appears first in your feed. AI ranking uses semantic understanding, simple rules use keywords.',
    options: [
      { value: 'ai-semantic', label: 'AI Semantic Ranking (understands meaning)' },
      { value: 'keyword-based', label: 'Keyword-based (simple rules)' },
      { value: 'recency', label: 'By recency (newest first)' },
    ],
    validation: (value) => {
      if (!value) return 'Please select a ranking strategy'
      return null
    },
    required: true,
  },
]

const currentStepData = computed(() => steps[currentStep.value])

const isCurrentFieldValid = computed(() => {
  const step = currentStepData.value
  if (!step) return false

  const value = formData.value[step.field] || ''
  const validationError = step.validation ? step.validation(value) : null

  return !validationError
})

const isFormValid = computed(() => {
  return steps.every(step => {
    const value = formData.value[step.field] || ''
    const validationError = step.validation ? step.validation(value) : null
    return !validationError
  })
})

const validateCurrentField = () => {
  const step = currentStepData.value
  if (!step) return

  const value = formData.value[step.field] || ''
  const validationError = step.validation ? step.validation(value) : null

  if (validationError) {
    fieldErrors.value[step.field] = validationError
  } else {
    delete fieldErrors.value[step.field]
  }
}

const nextStep = () => {
  if (currentStep.value < steps.length - 1 && isCurrentFieldValid.value) {
    currentStep.value++
  }
}

const previousStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

const generateConfig = (): ProjectConfig => {
  const data = formData.value

  // Map form data to actual config structure
  const config: ProjectConfig = {
    version: "1.0.0",
    project_id: `project-${Date.now()}`,
    project_name: data.description?.slice(0, 50) + "..." || "AI Curation Project",
    topic: {
      id: 'ai-generated-topic',
      label: data.description || 'Generated topic'
    },
    sources: [],
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

  // Configure source based on selection
  if (data.sources === 'rss') {
    config.sources.push({
      id: "rss-source",
      plugin: "rss_source",
      enabled: true,
      config: {
        feed_url: "https://example.com/feed.xml",
        user_agent: 'delta-curator/0.1',
        max_items_per_batch: data.frequency === 'hourly' ? 10 : data.frequency === 'daily' ? 50 : 100
      },
      state: {}
    })
  } else if (data.sources === 'api') {
    config.sources.push({
      id: "api-source",
      plugin: "api_source",
      enabled: true,
      config: {
        endpoint: "https://api.example.com/data",
        update_interval: data.frequency === 'hourly' ? 3600 : data.frequency === 'daily' ? 86400 : 604800
      },
      state: {}
    })
  } else {
    // Default source for other types
    config.sources.push({
      id: "default-source",
      plugin: "file_drop",
      enabled: true,
      config: {},
      state: {}
    })
  }

  // Configure ranking
  if (data.ranking === 'ai-semantic') {
    config.pipeline.ranking.ingest = {
      enabled: true,
      backend: 'workers_ai_rerank',
      max_passage_chars: 4000
    }
    config.pipeline.ranking.search = {
      enabled: true,
      backend: 'ai_search_rerank',
      rerank: true
    }
  }

  // Add criteria to decider config
  config.pipeline.decider = {
    plugin: 'rules_decider',
    config: {
      rules: data.criteria?.split(',').map((rule: string) => rule.trim()) || []
    }
  }

  return config
}

const createProject = async () => {
  if (!isFormValid.value) return

  creating.value = true
  error.value = ''

  try {
    const config = generateConfig()
    emit('created', config)
    emit('update:open', false)

    // Reset form
    currentStep.value = 0
    formData.value = {}
    fieldErrors.value = {}
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create project'
  } finally {
    creating.value = false
  }
}

// Reset form when dialog opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    currentStep.value = 0
    formData.value = {}
    fieldErrors.value = {}
    error.value = ''
  }
})
</script>