<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[640px] max-h-[80vh] overflow-y-auto">
      <div class="mb-4">
        <DialogTitle class="flex items-center gap-2">
          <Sparkles class="h-5 w-5" />
          Create Source with Assistant
        </DialogTitle>
        <DialogDescription>
          Answer a few questions and we will prefill a source configuration.
        </DialogDescription>
      </div>

      <div class="mb-6">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium">Setup Progress</span>
          <span class="text-sm text-muted-foreground">{{ currentStep + 1 }} of {{ visibleSteps.length }}</span>
        </div>
        <div class="h-2 w-full rounded-full bg-muted">
          <div
            class="h-2 rounded-full bg-primary transition-all duration-300"
            :style="{ width: `${((currentStep + 1) / visibleSteps.length) * 100}%` }"
          ></div>
        </div>
      </div>

      <div v-if="currentStepData" class="space-y-4">
        <div class="rounded-lg border bg-muted/40 p-4">
          <h3 class="mb-1 font-medium">{{ currentStepData.title }}</h3>
          <p class="mb-4 text-sm text-muted-foreground">{{ currentStepData.description }}</p>

          <div class="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p class="mb-1 text-sm font-medium">Assistant</p>
            <p class="text-sm">{{ currentStepData.question }}</p>
          </div>

          <div class="space-y-2">
            <label class="text-sm">{{ currentStepData.fieldLabel }}</label>

            <textarea
              v-if="currentStepData.type === 'textarea'"
              v-model="formData[currentStepData.field]"
              :placeholder="currentStepData.placeholder"
              rows="4"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              @input="validateCurrentField"
            ></textarea>

            <input
              v-else-if="currentStepData.type === 'text' || currentStepData.type === 'number'"
              v-model="formData[currentStepData.field]"
              :placeholder="currentStepData.placeholder"
              :type="currentStepData.type === 'number' ? 'number' : 'text'"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              @input="validateCurrentField"
            />

            <select
              v-else
              v-model="formData[currentStepData.field]"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

            <p v-if="fieldErrors[currentStepData.field]" class="text-sm text-destructive">
              {{ fieldErrors[currentStepData.field] }}
            </p>
          </div>
        </div>

        <div
          v-if="currentStep === visibleSteps.length - 1 && isFormValid"
          class="rounded-lg border border-success/25 bg-success-muted p-4"
        >
          <p class="mb-2 text-sm font-medium text-success-foreground">Ready to add source</p>
          <pre class="overflow-x-auto rounded bg-success/20 p-2 text-xs">{{ JSON.stringify(buildSource(), null, 2) }}</pre>
        </div>
      </div>

      <div class="mt-6 flex gap-2">
        <Button variant="outline" :disabled="currentStep === 0" @click="previousStep">
          <ArrowLeft class="mr-2 h-4 w-4" />
          Previous
        </Button>

        <Button
          v-if="currentStep < visibleSteps.length - 1"
          :disabled="!isCurrentFieldValid"
          @click="nextStep"
        >
          Next
          <ArrowRight class="ml-2 h-4 w-4" />
        </Button>

        <Button v-else :disabled="!isFormValid" @click="createSource">
          <Sparkles class="mr-2 h-4 w-4" />
          Add Source
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-vue-next'
import { DialogRoot as Dialog, DialogContent, DialogDescription, DialogTitle } from 'radix-vue'
import Button from '@/components/ui/button.vue'
import type { SourceConfig } from '@/types'

type StepField =
  | 'sourceType'
  | 'sourceId'
  | 'rssFeedUrl'
  | 'rssBatchSize'
  | 'rssUserAgent'
  | 'apiEndpoint'
  | 'apiUpdateInterval'
  | 'filePath'

type SourceType = '' | 'rss_source' | 'api_source' | 'file_drop_source'

interface Step {
  field: StepField
  title: string
  description: string
  question: string
  fieldLabel: string
  type: 'textarea' | 'text' | 'number' | 'select'
  placeholder: string
  options?: Array<{ value: string; label: string }>
  validate: (value: string) => string | null
  showIf?: (data: Record<StepField, string>) => boolean
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [source: SourceConfig]
}>()

const currentStep = ref(0)
const formData = ref<Record<StepField, string>>({
  sourceType: '',
  sourceId: '',
  rssFeedUrl: '',
  rssBatchSize: '50',
  rssUserAgent: 'delta-curator/0.1',
  apiEndpoint: '',
  apiUpdateInterval: '3600',
  filePath: ''
})
const fieldErrors = ref<Record<string, string>>({})

const steps: Step[] = [
  {
    field: 'sourceType',
    title: 'Source Type',
    description: 'Choose the source connector type.',
    question: 'Which type of source should we configure?',
    fieldLabel: 'Type',
    type: 'select',
    placeholder: 'Select source type',
    options: [
      { value: 'rss_source', label: 'RSS Source' },
      { value: 'api_source', label: 'API Source' },
      { value: 'file_drop_source', label: 'File Drop Source' }
    ],
    validate: (value) => (value ? null : 'Please choose a source type')
  },
  {
    field: 'sourceId',
    title: 'Source Identifier',
    description: 'Give this source a stable id.',
    question: 'What id should we use for this source?',
    fieldLabel: 'Source ID',
    type: 'text',
    placeholder: 'Example: ai-release-rss',
    validate: (value) => {
      const trimmed = value.trim()
      if (!trimmed) return 'Please provide a source id'
      if (!/^[a-z0-9-_]+$/i.test(trimmed)) return 'Use letters, numbers, - or _'
      return null
    }
  },
  {
    field: 'rssFeedUrl',
    title: 'RSS Feed URL',
    description: 'Provide the feed to ingest from.',
    question: 'What is the RSS feed URL for this source?',
    fieldLabel: 'Feed URL',
    type: 'text',
    placeholder: 'https://example.com/feed.xml',
    showIf: (data) => data.sourceType === 'rss_source',
    validate: (value) => {
      const trimmed = value.trim()
      if (!trimmed) return 'Please provide an RSS feed URL'
      try {
        const parsed = new URL(trimmed)
        if (!['http:', 'https:'].includes(parsed.protocol)) return 'URL must be http or https'
      } catch {
        return 'Please provide a valid URL'
      }
      return null
    }
  },
  {
    field: 'rssBatchSize',
    title: 'RSS Batch Size',
    description: 'Set how many items to pull per run.',
    question: 'What maximum number of RSS items should be processed in each batch?',
    fieldLabel: 'Batch Size',
    type: 'number',
    placeholder: '50',
    showIf: (data) => data.sourceType === 'rss_source',
    validate: (value) => {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isInteger(parsed) || parsed <= 0) return 'Batch size must be a positive integer'
      if (parsed > 500) return 'Batch size must be 500 or less'
      return null
    }
  },
  {
    field: 'rssUserAgent',
    title: 'RSS User Agent',
    description: 'Optional client identifier for feed requests.',
    question: 'Do you want to set a custom User-Agent header for this RSS source?',
    fieldLabel: 'User-Agent (Optional)',
    type: 'text',
    placeholder: 'delta-curator/0.1',
    showIf: (data) => data.sourceType === 'rss_source',
    validate: () => null
  },
  {
    field: 'apiEndpoint',
    title: 'API Endpoint',
    description: 'Provide the endpoint to pull from.',
    question: 'What API endpoint should this source read from?',
    fieldLabel: 'Endpoint URL',
    type: 'text',
    placeholder: 'https://api.example.com/data',
    showIf: (data) => data.sourceType === 'api_source',
    validate: (value) => {
      const trimmed = value.trim()
      if (!trimmed) return 'Please provide an API endpoint'
      try {
        const parsed = new URL(trimmed)
        if (!['http:', 'https:'].includes(parsed.protocol)) return 'URL must be http or https'
      } catch {
        return 'Please provide a valid URL'
      }
      return null
    }
  },
  {
    field: 'apiUpdateInterval',
    title: 'API Poll Interval',
    description: 'Set poll interval in seconds.',
    question: 'How often should this API source be polled (seconds)?',
    fieldLabel: 'Update Interval (seconds)',
    type: 'number',
    placeholder: '3600',
    showIf: (data) => data.sourceType === 'api_source',
    validate: (value) => {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isInteger(parsed) || parsed <= 0) return 'Interval must be a positive integer'
      return null
    }
  },
  {
    field: 'filePath',
    title: 'File Drop Path',
    description: 'Provide the folder path watched by this source.',
    question: 'Which folder path should this file-drop source read from?',
    fieldLabel: 'Folder Path',
    type: 'text',
    placeholder: '/data/incoming',
    showIf: (data) => data.sourceType === 'file_drop_source',
    validate: (value) => (value.trim() ? null : 'Please provide a folder path')
  }
]

const visibleSteps = computed(() => {
  return steps.filter((step) => !step.showIf || step.showIf(formData.value))
})

const currentStepData = computed(() => visibleSteps.value[currentStep.value])

const isCurrentFieldValid = computed(() => {
  const step = currentStepData.value
  if (!step) return false
  const value = formData.value[step.field] || ''
  return !step.validate(value)
})

const isFormValid = computed(() => {
  return visibleSteps.value.every((step) => !step.validate(formData.value[step.field] || ''))
})

function validateCurrentField() {
  const step = currentStepData.value
  if (!step) return
  const value = formData.value[step.field] || ''
  const message = step.validate(value)
  if (message) {
    fieldErrors.value[step.field] = message
  } else {
    delete fieldErrors.value[step.field]
  }
}

function nextStep() {
  validateCurrentField()
  if (currentStep.value < visibleSteps.value.length - 1 && isCurrentFieldValid.value) {
    currentStep.value += 1
  }
}

function previousStep() {
  if (currentStep.value > 0) {
    currentStep.value -= 1
  }
}

function resetState() {
  currentStep.value = 0
  fieldErrors.value = {}
  formData.value = {
    sourceType: '',
    sourceId: '',
    rssFeedUrl: '',
    rssBatchSize: '50',
    rssUserAgent: 'delta-curator/0.1',
    apiEndpoint: '',
    apiUpdateInterval: '3600',
    filePath: ''
  }
}

function buildSource(): SourceConfig {
  const sourceType = formData.value.sourceType as SourceType
  const sourceId = formData.value.sourceId.trim()

  if (sourceType === 'rss_source') {
    return {
      id: sourceId,
      plugin: 'rss_source',
      config: {
        feed_url: formData.value.rssFeedUrl.trim(),
        user_agent: formData.value.rssUserAgent.trim() || 'delta-curator/0.1',
        max_items_per_batch: Number.parseInt(formData.value.rssBatchSize, 10)
      }
    }
  }

  if (sourceType === 'api_source') {
    return {
      id: sourceId,
      plugin: 'api_source',
      config: {
        endpoint: formData.value.apiEndpoint.trim(),
        update_interval: Number.parseInt(formData.value.apiUpdateInterval, 10)
      }
    }
  }

  return {
    id: sourceId,
    plugin: 'file_drop_source',
    config: {
      path: formData.value.filePath.trim(),
      pattern: '*'
    }
  }
}

function createSource() {
  if (!isFormValid.value) return
  emit('created', buildSource())
  emit('update:open', false)
  resetState()
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      resetState()
    }
  }
)

watch(
  () => formData.value.sourceType,
  () => {
    if (currentStep.value >= visibleSteps.value.length) {
      currentStep.value = Math.max(visibleSteps.value.length - 1, 0)
    }
    const nextErrors: Record<string, string> = {}
    for (const step of visibleSteps.value) {
      if (fieldErrors.value[step.field]) {
        nextErrors[step.field] = fieldErrors.value[step.field]
      }
    }
    fieldErrors.value = nextErrors
  }
)
</script>
