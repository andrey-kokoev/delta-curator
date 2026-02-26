<template>
  <!-- Desktop: Right-side drawer -->
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex justify-end"
    @click.self="close"
  >
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/50" @click.self="close"></div>
    
    <!-- Drawer content -->
    <div
      class="relative w-full max-w-2xl bg-background border-l shadow-xl overflow-y-auto"
      :class="{ 'h-full': !isMobile, 'fixed inset-0': isMobile }"
    >
      <!-- Header -->
      <div class="sticky top-0 bg-background border-b px-6 py-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Run Detail</h2>
        <button
          @click="close"
          class="rounded-md p-2 hover:bg-accent"
          aria-label="Close"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div v-if="!run" class="p-6 text-center text-muted-foreground">
        Run not found
      </div>
      <div v-else class="p-6 space-y-6">
        <!-- Run Summary -->
        <div class="space-y-3">
          <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">Run Summary</h3>
          <div class="rounded-lg border bg-card p-4 space-y-2">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Run Time</span>
              <span class="font-medium">{{ formatRunTime(run.run_at) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Source</span>
              <span class="font-medium">{{ run.source_id }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Items</span>
              <span class="font-medium">{{ formatRunMetric(run.item_count, 'items') }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Events</span>
              <span class="font-medium">{{ formatRunMetric(run.event_count, 'events') }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Commit ID</span>
              <code class="text-xs bg-muted px-2 py-1 rounded">{{ run.commit_id }}</code>
            </div>
          </div>
        </div>

        <!-- Advanced (collapsed by default) -->
        <div class="space-y-3">
          <button
            @click="showAdvanced = !showAdvanced"
            class="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground"
          >
            <span>{{ showAdvanced ? '▼' : '▶' }}</span>
            Advanced
          </button>
          <div v-if="showAdvanced" class="rounded-lg border bg-card p-4">
            <div v-if="run.rerank_query" class="space-y-1">
              <span class="text-muted-foreground text-sm">Reranker Query</span>
              <p class="text-sm bg-muted p-2 rounded">{{ run.rerank_query }}</p>
            </div>
            <div v-else class="text-sm text-muted-foreground">
              No advanced details available
            </div>
          </div>
        </div>

        <!-- Processed Items -->
        <div class="space-y-3" v-if="run.processed_items && run.processed_items.length > 0">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Processed Items ({{ run.processed_items.length }})
            </h3>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                v-model="showAllScores"
                class="rounded border-gray-300"
              />
              Show all scores
            </label>
          </div>
          <div class="rounded-lg border divide-y max-h-96 overflow-y-auto">
            <div
              v-for="item in run.processed_items"
              :key="item.source_item_id"
              class="p-3 space-y-1"
            >
              <p class="font-medium truncate">{{ item.title || item.source_item_id }}</p>
              <p class="text-sm text-muted-foreground truncate">{{ item.url || item.source_item_id }}</p>
              <div class="flex items-center gap-2 text-sm">
                <span
                  class="px-2 py-0.5 rounded text-xs"
                  :class="getOutcomeBadgeClass(item.outcome)"
                >
                  {{ item.outcome || 'pending' }}
                </span>
                <span
                  v-if="shouldShowScore(item)"
                  class="text-muted-foreground"
                >
                  rank: {{ Number(item.rank_score).toFixed(3) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Raw JSON (collapsed by default) -->
        <div class="space-y-3" v-if="hasRawData">
          <button
            @click="showRawJson = !showRawJson"
            class="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground"
          >
            <span>{{ showRawJson ? '▼' : '▶' }}</span>
            Raw JSON
          </button>
          <div v-if="showRawJson" class="rounded-lg border bg-card p-4">
            <pre class="text-xs overflow-x-auto">{{ JSON.stringify(run, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { SourceRunSummary } from '@/types'
import { formatRunTime, formatRunMetric } from '@/lib/projectUtils'

const props = defineProps<{
  isOpen: boolean
  run: SourceRunSummary | null
}>()

const emit = defineEmits<{
  close: []
}>()

const showAdvanced = ref(false)
const showAllScores = ref(false)
const showRawJson = ref(false)
const isMobile = ref(false)

const hasRawData = computed(() => {
  return props.run && Object.keys(props.run).length > 0
})

function shouldShowScore(item: any): boolean {
  if (item.rank_score == null) return false
  if (showAllScores.value) return true
  return item.outcome === 'skipped_low_rank'
}

function getOutcomeBadgeClass(outcome?: string): string {
  switch (outcome) {
    case 'event_created':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'skipped_low_rank':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    case 'skipped_existing':
    case 'skipped_decision':
    case 'skipped_already_processed_url':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    default:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  }
}

function close() {
  emit('close')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    close()
  }
}

function checkMobile() {
  isMobile.value = window.innerWidth < 768
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', checkMobile)
})
</script>
