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
      class="relative w-full max-w-xl bg-background border-l shadow-xl overflow-y-auto"
      :class="{ 'h-full': !isMobile, 'fixed inset-0': isMobile }"
    >
      <!-- Header -->
      <div class="sticky top-0 bg-background border-b px-6 py-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Project Settings</h2>
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
      <div v-if="!project" class="p-6 text-center text-muted-foreground">
        Project not loaded
      </div>
      <div v-else class="p-6 space-y-8">
        <!-- Storage Configuration -->
        <div class="space-y-4">
          <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">Storage Configuration</h3>
          <div class="rounded-lg border bg-card p-4 space-y-4">
            <div>
              <p class="text-sm text-muted-foreground mb-1">Committer Plugin</p>
              <p class="font-medium">{{ project.config.storage.committer.plugin }}</p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground mb-1">Database</p>
              <p class="font-medium">{{ project.config.storage.committer.config.database }}</p>
            </div>
            <div class="border-t pt-4">
              <p class="text-sm text-muted-foreground mb-1">Artifacts Kind</p>
              <p class="font-medium">{{ project.config.storage.artifacts.kind }}</p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground mb-1">Bucket</p>
              <p class="font-medium">{{ project.config.storage.artifacts.bucket }}</p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground mb-1">Prefix</p>
              <p class="font-medium">{{ project.config.storage.artifacts.prefix }}</p>
            </div>
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="space-y-4">
          <h3 class="text-sm font-medium text-destructive uppercase tracking-wide">Danger Zone</h3>
          <div class="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-4">
            <div>
              <p class="font-medium">Delete Project</p>
              <p class="text-sm text-muted-foreground mt-1">
                This action cannot be undone. This will permanently delete the project
                "{{ project.config.project_name }}" ({{ project.config.project_id }}).
              </p>
            </div>
            <button
              @click="confirmDelete"
              :disabled="deleting"
              class="rounded-lg border border-destructive bg-destructive px-4 py-2 text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {{ deleting ? 'Deleting...' : 'Delete Project' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { ProjectConfig, ProjectIndex } from '@/types'

const props = defineProps<{
  isOpen: boolean
  project: { config: ProjectConfig; index: ProjectIndex } | null
}>()

const emit = defineEmits<{
  close: []
  delete: []
}>()

const deleting = ref(false)
const isMobile = ref(false)

function close() {
  emit('close')
}

function confirmDelete() {
  if (!props.project) return
  
  const confirmed = window.confirm(
    `Are you sure you want to delete "${props.project.config.project_name}" (${props.project.config.project_id})? This action cannot be undone.`
  )
  
  if (confirmed) {
    deleting.value = true
    emit('delete')
  }
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
