<template>
  <div class="rounded-lg border bg-card p-5 space-y-4">
    <!-- Top Row: Name and Pin -->
    <div class="flex items-start justify-between gap-2">
      <h4 class="font-semibold text-lg leading-tight">{{ project.project_name }}</h4>
      <button
        @click="togglePin"
        :aria-pressed="project.pinned"
        class="p-1.5 rounded-md hover:bg-accent transition-colors"
        :title="project.pinned ? 'Unpin project' : 'Pin project'"
      >
        <Star
          :class="[
            'h-5 w-5 transition-colors',
            project.pinned ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
          ]"
        />
      </button>
    </div>

    <!-- Project ID -->
    <p class="text-xs text-muted-foreground font-mono">{{ project.project_id }}</p>

    <!-- Body Info -->
    <div class="space-y-1.5 text-sm">
      <div class="flex items-center gap-2">
        <Tag class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="text-muted-foreground">Topic:</span>
        <span class="font-medium truncate">{{ project.topic_label }}</span>
      </div>
      <div class="flex items-center gap-2">
        <Radio class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="text-muted-foreground">Sources:</span>
        <span class="font-medium">{{ project.sources_count }}</span>
      </div>
      <div class="flex items-center gap-2">
        <Clock class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="text-muted-foreground">Last activity:</span>
        <span class="font-medium">{{ formatRelativeTime(project.last_activity_at) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <Eye class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="text-muted-foreground">Last reviewed:</span>
        <span class="font-medium">{{ formatRelativeTime(project.last_reviewed_at) || 'Never' }}</span>
      </div>
    </div>

    <!-- Activity Count -->
    <div class="pt-3 border-t">
      <div class="flex items-center justify-between">
        <span class="text-sm text-muted-foreground">{{ activityLabel }}</span>
        <span class="text-lg font-bold">{{ activityCount }}</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2 pt-2">
      <RouterLink
        :to="`/projects/${project.project_id}`"
        class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Open
        <ArrowRight class="h-3.5 w-3.5" />
      </RouterLink>
      <button
        @click="markReviewed"
        class="inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
      >
        <Check class="h-3.5 w-3.5" />
        Reviewed
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Star, Tag, Radio, Clock, Eye, ArrowRight, Check } from 'lucide-vue-next'
import type { ProjectListItem, ProjectActivity } from '@/types'

const props = defineProps<{
  project: ProjectListItem
  activity?: ProjectActivity
  windowMode: '24h' | '7d' | 'since_review'
}>()

const emit = defineEmits<{
  (e: 'toggle-pin', projectId: string, pinned: boolean): void
  (e: 'mark-reviewed', projectId: string): void
}>()

const activityLabel = computed(() => {
  switch (props.windowMode) {
    case '24h':
      return 'New events (24h)'
    case '7d':
      return 'New events (7d)'
    case 'since_review':
      return 'New events (since review)'
    default:
      return 'New events'
  }
})

const activityCount = computed(() => {
  if (!props.activity) return 'n/a'
  return props.activity.events_count.toString()
})

function togglePin() {
  emit('toggle-pin', props.project.project_id, !props.project.pinned)
}

function markReviewed() {
  emit('mark-reviewed', props.project.project_id)
}

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return ''
  
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  // For older dates, show the actual date
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: diffDays > 365 ? 'numeric' : undefined
  })
}
</script>
