<template>
  <div class="rounded-lg border bg-card p-2">
    <nav class="flex flex-wrap gap-2">
      <RouterLink
        v-for="item in items"
        :key="item.path"
        :to="item.path"
        :class="[
          'rounded-md px-3 py-2 text-sm transition-colors',
          isActive(item.path)
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        ]"
      >
        {{ item.label }}
      </RouterLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  projectId: string
}>()

const route = useRoute()

const items = computed(() => [
  { label: 'Overview', path: `/projects/${props.projectId}` },
  { label: 'Sources', path: `/projects/${props.projectId}/sources` },
  { label: 'Pipeline', path: `/projects/${props.projectId}/pipeline` },
  { label: 'Content', path: `/projects/${props.projectId}/content` },
  { label: 'Search', path: `/projects/${props.projectId}/search` },
  { label: 'Run', path: `/projects/${props.projectId}/run` },
  { label: 'Inspect', path: `/projects/${props.projectId}/inspect` }
])

function isActive(path: string): boolean {
  return route.path === path
}
</script>
