<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">{{ form.project_name || projectId }}</h1>
      <p class="text-muted-foreground">{{ form.project_id || projectId }}</p>
    </div>

    <ProjectSubnav :project-id="projectId" />

    <div v-if="loading" class="text-center py-12">
      <p class="text-muted-foreground">Loading...</p>
    </div>

    <form v-else @submit.prevent="saveProject" class="space-y-6">
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h2 class="text-lg font-semibold">Basic Information</h2>
        
        <div class="space-y-2">
          <label class="text-sm font-medium">Project Name</label>
          <input
            v-model="form.project_name"
            type="text"
            required
            class="w-full rounded-lg border bg-background px-3 py-2"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Topic Label</label>
          <input
            v-model="form.topic.label"
            type="text"
            required
            class="w-full rounded-lg border bg-background px-3 py-2"
          />
        </div>

      </div>

      <!-- JSON Editor for Advanced Config -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h2 class="text-lg font-semibold">Advanced Configuration (JSON)</h2>
        <textarea
          v-model="jsonConfig"
          rows="20"
          class="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
        ></textarea>
        <p v-if="jsonError" class="text-sm text-destructive">{{ jsonError }}</p>
      </div>

      <div class="flex items-center justify-end gap-4">
        <RouterLink
          :to="`/projects/${projectId}`"
          class="rounded-lg border px-4 py-2 hover:bg-accent"
        >
          Cancel
        </RouterLink>
        <button
          type="submit"
          class="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          :disabled="saving || !!jsonError"
        >
          {{ saving ? 'Saving...' : 'Save Changes' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiStore } from '@/stores/api'
import ProjectSubnav from '@/components/ProjectSubnav.vue'
import type { ProjectConfig } from '@/types'

const route = useRoute()
const router = useRouter()
const apiStore = useApiStore()

const projectId = route.params.id as string
const form = ref<ProjectConfig>({} as ProjectConfig)
const loading = ref(true)
const saving = ref(false)

const jsonConfig = ref('')
const jsonError = computed(() => {
  try {
    JSON.parse(jsonConfig.value)
    return null
  } catch (e) {
    return 'Invalid JSON: ' + (e as Error).message
  }
})

async function loadProject() {
  try {
    loading.value = true
    const project = await apiStore.getConfig(projectId)
    form.value = project.config
    jsonConfig.value = JSON.stringify(project.config, null, 2)
  } catch (err) {
    console.error('Failed to load project:', err)
  } finally {
    loading.value = false
  }
}

async function saveProject() {
  try {
    saving.value = true
    const config = JSON.parse(jsonConfig.value) as ProjectConfig
    await apiStore.saveConfig(config, false)
    router.push(`/projects/${projectId}`)
  } catch (err) {
    console.error('Failed to save project:', err)
    alert('Failed to save: ' + (err as Error).message)
  } finally {
    saving.value = false
  }
}

onMounted(loadProject)
</script>
