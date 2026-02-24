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
          <span class="text-sm text-muted-foreground">{{ currentStep + 1 }} of {{ steps.length }}</span>
        </div>
        <div class="h-2 w-full rounded-full bg-muted">
          <div
            class="h-2 rounded-full bg-primary transition-all duration-300"
            :style="{ width: `${((currentStep + 1) / steps.length) * 100}%` }"
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
              v-else-if="currentStepData.type === 'text'"
              v-model="formData[currentStepData.field]"
              :placeholder="currentStepData.placeholder"
              type="text"
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
          v-if="currentStep === steps.length - 1 && isFormValid"
          class="rounded-lg border border-green-300 bg-green-50 p-4"
        >
          <p class="mb-2 text-sm font-medium text-green-800">Ready to add source</p>
          <pre class="overflow-x-auto rounded bg-green-100 p-2 text-xs">{{ JSON.stringify(buildSource(), null, 2) }}</pre>
        </div>
      </div>

      <div class="mt-6 flex gap-2">
        <Button variant="outline" :disabled="currentStep === 0" @click="previousStep">
          <ArrowLeft class="mr-2 h-4 w-4" />
          Previous
        </Button>

        <Button
          v-if="currentStep < steps.length - 1"
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

type StepField = 'sourceType' | 'sourceId' | 'sourceTarget' | 'frequency'

interface Step {
  field: StepField
  title: string
  description: string
  question: string
  fieldLabel: string
  type: 'textarea' | 'text' | 'select'
  placeholder: string
  options?: Array<{ value: string; label: string }>
  validate: (value: string) => string | null
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
  sourceTarget: '',
  frequency: ''
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
    field: 'sourceTarget',
    title: 'Source Location',
    description: 'Provide where to read content from.',
    question: 'Where should this source pull content from?',
    fieldLabel: 'Target',
    type: 'text',
    placeholder: 'RSS URL, API endpoint, or folder path',
    validate: (value) => (value.trim() ? null : 'Please provide a source target')
  },
  {
    field: 'frequency',
    title: 'Polling Frequency',
    description: 'Set how frequently the source should be checked.',
    question: 'How frequently should this source run?',
    fieldLabel: 'Frequency',
    type: 'select',
    placeholder: 'Select frequency',
    options: [
      { value: 'hourly', label: 'Hourly' },
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' }
    ],
    validate: (value) => (value ? null : 'Please choose a frequency')
  }
]

const currentStepData = computed(() => steps[currentStep.value])

const isCurrentFieldValid = computed(() => {
  const step = currentStepData.value
  if (!step) return false
  const value = formData.value[step.field] || ''
  return !step.validate(value)
})

const isFormValid = computed(() => steps.every((step) => !step.validate(formData.value[step.field] || '')))

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
  if (currentStep.value < steps.length - 1 && isCurrentFieldValid.value) {
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
    sourceTarget: '',
    frequency: ''
  }
}

function buildSource(): SourceConfig {
  const frequency = formData.value.frequency
  const sourceType = formData.value.sourceType
  const sourceTarget = formData.value.sourceTarget.trim()

  if (sourceType === 'rss_source') {
    return {
      id: formData.value.sourceId.trim(),
      plugin: 'rss_source',
      config: {
        feed_url: sourceTarget,
        user_agent: 'delta-curator/0.1',
        max_items_per_batch: frequency === 'hourly' ? 10 : frequency === 'daily' ? 50 : 100
      }
    }
  }

  if (sourceType === 'api_source') {
    return {
      id: formData.value.sourceId.trim(),
      plugin: 'api_source',
      config: {
        endpoint: sourceTarget,
        update_interval: frequency === 'hourly' ? 3600 : frequency === 'daily' ? 86400 : 604800
      }
    }
  }

  return {
    id: formData.value.sourceId.trim(),
    plugin: 'file_drop_source',
    config: {
      path: sourceTarget,
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
</script>
