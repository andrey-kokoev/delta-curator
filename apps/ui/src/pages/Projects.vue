<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Projects</h1>
        <p class="text-muted-foreground">Manage your curation projects</p>
      </div>
      <SplitButton @primary="openAIDialog = true" @secondary="goToManualCreate">
        <template #primary-icon>
          <Sparkles class="h-4 w-4" />
        </template>
        <template #primary-text>New Project</template>
        <template #secondary-icon>
          <Plus class="h-4 w-4" />
        </template>
        <template #secondary-text>Manual Setup</template>
      </SplitButton>
    </div>

    <!-- AI Create Dialog -->
    <AICreateProjectDialog
      v-model:open="openAIDialog"
      @created="handleProjectCreated"
    />

    <!-- Projects List -->
    <div v-if="loading" class="text-center py-12">
      <p class="text-muted-foreground">Loading projects...</p>
    </div>

    <div v-else-if="configs.length === 0" class="text-center py-12">
      <FolderKanban class="mx-auto h-12 w-12 text-muted-foreground" />
      <h3 class="mt-4 text-lg font-medium">No projects yet</h3>
      <p class="mt-2 text-muted-foreground">Create your first project to get started</p>
      <div class="mt-4 space-x-2">
        <button
          @click="seedProject"
          class="rounded-lg border px-4 py-2 hover:bg-accent"
          :disabled="seeding"
        >
          {{ seeding ? 'Seeding...' : 'Seed Demo Project' }}
        </button>
        <SplitButton @primary="openAIDialog = true" @secondary="goToManualCreate">
          <template #primary-icon>
            <Sparkles class="h-4 w-4" />
          </template>
          <template #primary-text>Create Project</template>
          <template #secondary-icon>
            <Plus class="h-4 w-4" />
          </template>
          <template #secondary-text>Manual Setup</template>
        </SplitButton>
      </div>
    </div>

    <div v-else class="grid gap-4">
      <div
        v-for="config in configs"
        :key="config.project_id"
        class="rounded-lg border bg-card p-6"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-start gap-4">
            <div class="rounded-lg bg-primary/10 p-3">
              <FolderKanban class="h-6 w-6 text-primary" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-semibold">{{ config.project_name }}</h3>
              </div>
              <p class="text-sm text-muted-foreground">{{ config.project_id }}</p>
              <div class="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                <span>v{{ config.version }}</span>
                <span>Updated {{ formatRelativeTime(config.updated_at) }}</span>
              </div>
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <button
              v-if="!config.is_active"
              @click="activate(config.project_id)"
              class="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
              :disabled="activating === config.project_id"
            >
              {{ activating === config.project_id ? 'Activating...' : 'Activate' }}
            </button>
            <RouterLink
              :to="`/projects/${config.project_id}`"
              class="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              View
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { FolderKanban, Plus, Sparkles } from 'lucide-vue-next'
import { useApiStore } from '@/stores/api'
import SplitButton from '@/components/SplitButton.vue'
import AICreateProjectDialog from '@/components/AICreateProjectDialog.vue'
import type { ProjectIndex } from '@/types'
import type { ProjectConfig } from '@delta-curator/protocol'
import { formatRelativeTime } from '@/lib/utils'

const router = useRouter()
const apiStore = useApiStore()

const configs = ref<ProjectIndex[]>([])
const loading = ref(true)
const seeding = ref(false)
const activating = ref<string | null>(null)
const openAIDialog = ref(false)

async function loadProjects() {
  try {
    loading.value = true
    const result = await apiStore.listConfigs()
    configs.value = result.configs
  } catch (err) {
    console.error('Failed to load projects:', err)
  } finally {
    loading.value = false
  }
}

async function seedProject() {
  try {
    seeding.value = true
    await apiStore.seedConfig(true)
    await loadProjects()
  } catch (err) {
    console.error('Failed to seed project:', err)
  } finally {
    seeding.value = false
  }
}

async function activate(projectId: string) {
  try {
    activating.value = projectId
    await apiStore.activateConfig(projectId)
    await loadProjects()
  } catch (err) {
    console.error('Failed to activate:', err)
  } finally {
    activating.value = null
  }
}

function goToManualCreate() {
  router.push('/projects/new')
}

async function handleProjectCreated(config: ProjectConfig) {
  try {
    await apiStore.saveConfig(config as any, true)
    await loadProjects()
  } catch (err) {
    console.error('Failed to create project:', err)
  }
}

onMounted(loadProjects)
</script>
